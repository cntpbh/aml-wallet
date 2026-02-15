// src/risk-engine.js — Motor de risco v2.2 (CommonJS)
const { checkOFAC } = require("./providers/ofac.js");
const { checkExplorer } = require("./providers/explorer.js");
const { analyzeOnChain } = require("./providers/onchain-heuristics.js");
const { analyzeDefiInteractions } = require("./providers/defi-analysis.js");
const { detectFlashTokens } = require("./providers/flash-detection.js");
const { checkChainabuse, checkBlocksec } = require("./providers/external-apis.js");
const { generateComplianceAssessment } = require("./compliance/kyc-assessment.js");

async function screenWallet(chain, address) {
  const timestamp = new Date().toISOString();
  const findings = [];
  const sources = {};

  // 1) OFAC
  try {
    const ofac = checkOFAC(address);
    sources.ofac = { enabled: true, match: ofac.match };
    if (ofac.match) findings.push({ source: "OFAC/SDN", severity: "CRITICAL", detail: `Endereço na lista OFAC/SDN. ${ofac.details}`, category: "sanctions" });
  } catch (e) { sources.ofac = { enabled: false, error: e.message }; }

  // 2) Explorer + Heuristics
  let explorerData = null;
  try {
    explorerData = await checkExplorer(chain, address);
    sources.explorer = { enabled: true, data: explorerData };
    const h = analyzeOnChain(explorerData, chain);
    h.flags.forEach(f => findings.push({ source: "On-Chain Heuristics", severity: f.severity, detail: f.detail, category: "heuristic" }));
    sources.heuristics = { enabled: true, score: h.score, flags: h.flags };
  } catch (e) {
    sources.explorer = { enabled: false, error: e.message };
    sources.heuristics = { enabled: false };
  }

  // 3) DeFi Analysis
  let defiAnalysis = { summary: {}, findings: [], opaqueHops: 0, mixerInteractions: [], bridgeInteractions: [], dexInteractions: [] };
  try {
    defiAnalysis = analyzeDefiInteractions(explorerData, chain);
    sources.defiAnalysis = { enabled: true };
    findings.push(...defiAnalysis.findings);
  } catch (e) { sources.defiAnalysis = { enabled: false, error: e.message }; }

  // 4) Flash Token Detection
  let flashAnalysis = { checked: false, flashTokensDetected: false, officialTokensFound: [], suspiciousTokens: [], findings: [], summary: "" };
  try {
    flashAnalysis = detectFlashTokens(explorerData, chain);
    sources.flashDetection = { enabled: flashAnalysis.checked, detected: flashAnalysis.flashTokensDetected };
    findings.push(...flashAnalysis.findings);
  } catch (e) { sources.flashDetection = { enabled: false, error: e.message }; }

  // 5) Chainabuse
  try {
    const ca = await checkChainabuse(chain, address);
    sources.chainabuse = { enabled: ca.enabled, hits: ca.hits?.length || 0 };
    if (ca.enabled && ca.hits?.length > 0) findings.push({ source: "Chainabuse", severity: ca.hits.length >= 3 ? "HIGH" : "MEDIUM", detail: `${ca.hits.length} report(s) de scam/abuso.`, category: "scam" });
  } catch (e) { sources.chainabuse = { enabled: false, error: e.message }; }

  // 6) Blocksec
  try {
    const bs = await checkBlocksec(chain, address);
    sources.blocksec = { enabled: bs.enabled, score: bs.score, labels: bs.labels };
    if (bs.enabled && bs.score >= 70) findings.push({ source: "Blocksec", severity: "HIGH", detail: `Risk Score: ${bs.score}/100.`, category: "riskscore" });
    else if (bs.enabled && bs.score >= 40) findings.push({ source: "Blocksec", severity: "MEDIUM", detail: `Risk Score: ${bs.score}/100.`, category: "riskscore" });
  } catch (e) { sources.blocksec = { enabled: false, error: e.message }; }

  // Consolidate
  const decision = consolidateRisk(findings, defiAnalysis, flashAnalysis);

  const report = {
    id: `AML-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase(),
    timestamp, input: { chain, address }, decision, findings, defiAnalysis, flashAnalysis, sources,
    disclaimer: "Screening automatizado. Pode haver falso positivo/negativo. Recomenda-se evidências adicionais (KYC, invoice, contrato, hash/txid) antes de decisão final.",
  };

  const compliance = generateComplianceAssessment(report);
  return { report, compliance };
}

function consolidateRisk(findings, defi, flash) {
  if (findings.length === 0) return { level: "LOW", score: 10, recommendation: "APPROVE", summary: "Nenhum indicador de risco detectado." };

  const hasCritical = findings.some(f => f.severity === "CRITICAL");
  const hasFlash = flash?.flashTokensDetected;
  const highCount = findings.filter(f => f.severity === "HIGH").length;
  const medCount = findings.filter(f => f.severity === "MEDIUM").length;
  const hasMixerPattern = defi?.summary?.suspiciousPattern;
  const hasMixer = defi?.summary?.usedMixer;

  // CRITICAL: OFAC, flash token, or mixer+bridge+DEX
  if (hasCritical || hasFlash || (hasMixer && hasMixerPattern)) {
    let summary = "Endereço sancionado ou interação com protocolo sancionado. PROIBIDO.";
    if (hasFlash) summary = "FLASH TOKEN DETECTADO. Token(s) falso(s) imitando stablecoin. NÃO ACEITAR como pagamento. BLOQUEAR.";
    else if (hasMixer && hasMixerPattern) summary = "Fundos via Mixer+Bridge+DEX. Ofuscação detectada. Bloquear.";
    return { level: "CRITICAL", score: 100, recommendation: "BLOCK", summary };
  }

  if (highCount >= 2 || hasMixer)
    return { level: "HIGH", score: 85, recommendation: "BLOCK", summary: `${hasMixer ? "Mixer detectado + " : ""}${highCount} indicador(es) alto risco. Bloquear.` };
  if (highCount === 1)
    return { level: "HIGH", score: 70, recommendation: "REVIEW", summary: "Indicador de alto risco. EDD obrigatório." };
  if (medCount >= 2)
    return { level: "MEDIUM", score: 55, recommendation: "REVIEW", summary: `${medCount} indicadores moderados. Diligência adicional.` };
  return { level: "MEDIUM", score: 40, recommendation: "REVIEW", summary: "Risco moderado. Monitorar." };
}

module.exports = { screenWallet };
