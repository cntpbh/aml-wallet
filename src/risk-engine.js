// src/risk-engine.js — Motor de risco consolidado v2
// Inclui: DeFi analysis (mixer/bridge/DEX), compliance assessment, PDF
import { checkOFAC } from "./providers/ofac.js";
import { checkExplorer } from "./providers/explorer.js";
import { checkChainabuse } from "./providers/chainabuse.js";
import { checkBlocksec } from "./providers/blocksec.js";
import { analyzeOnChain } from "./providers/onchain-heuristics.js";
import { analyzeDefiInteractions } from "./providers/defi-analysis.js";
import { generateComplianceAssessment } from "./compliance/kyc-assessment.js";

// ============================================================
// screenWallet — Função principal de screening v2
// ============================================================
export async function screenWallet(chain, address) {
  const timestamp = new Date().toISOString();
  const findings = [];
  const sources = {};

  // 1) OFAC — Lista de sanções (local)
  try {
    const ofac = await checkOFAC(address);
    sources.ofac = { enabled: true, match: ofac.match, details: ofac.details };
    if (ofac.match) {
      findings.push({
        source: "OFAC/SDN",
        severity: "CRITICAL",
        detail: `Endereço consta na lista de sanções OFAC. ${ofac.details || ""}`,
        category: "sanctions",
      });
    }
  } catch (err) {
    sources.ofac = { enabled: false, error: err.message };
  }

  // 2) Explorer — Dados on-chain
  let explorerData = null;
  try {
    explorerData = await checkExplorer(chain, address);
    sources.explorer = { enabled: true, data: explorerData };

    // 2b) Heurísticas on-chain
    const heuristics = analyzeOnChain(explorerData, chain);
    if (heuristics.flags.length > 0) {
      for (const flag of heuristics.flags) {
        findings.push({
          source: "On-Chain Heuristics",
          severity: flag.severity,
          detail: flag.detail,
          category: "heuristic",
        });
      }
    }
    sources.heuristics = { enabled: true, score: heuristics.score, flags: heuristics.flags };
  } catch (err) {
    sources.explorer = { enabled: false, error: err.message };
    sources.heuristics = { enabled: false, error: "Sem dados on-chain" };
  }

  // 3) DeFi Analysis — Mixer / Bridge / DEX / Saltos opacos
  let defiAnalysis = null;
  try {
    defiAnalysis = analyzeDefiInteractions(explorerData, chain);
    sources.defiAnalysis = { enabled: true };

    // Adicionar findings de DeFi
    if (defiAnalysis.findings.length > 0) {
      findings.push(...defiAnalysis.findings);
    }
  } catch (err) {
    sources.defiAnalysis = { enabled: false, error: err.message };
  }

  // 4) Chainabuse — Scam reports
  try {
    const ca = await checkChainabuse(chain, address);
    sources.chainabuse = {
      enabled: ca.enabled,
      hits: ca.hits?.length || 0,
      reports: ca.hits?.slice(0, 5) || [],
    };
    if (ca.enabled && ca.hits?.length > 0) {
      findings.push({
        source: "Chainabuse",
        severity: ca.hits.length >= 3 ? "HIGH" : "MEDIUM",
        detail: `${ca.hits.length} report(s) de scam/abuso encontrado(s).`,
        category: "scam",
      });
    }
  } catch (err) {
    sources.chainabuse = { enabled: false, error: err.message };
  }

  // 5) Blocksec/MetaSleuth — Risk Score
  try {
    const bs = await checkBlocksec(chain, address);
    sources.blocksec = {
      enabled: bs.enabled,
      score: bs.score,
      labels: bs.labels || [],
    };
    if (bs.enabled && bs.score !== null) {
      if (bs.score >= 70) {
        findings.push({
          source: "Blocksec/MetaSleuth",
          severity: "HIGH",
          detail: `Risk Score: ${bs.score}/100. Labels: ${bs.labels?.join(", ") || "N/A"}`,
          category: "riskscore",
        });
      } else if (bs.score >= 40) {
        findings.push({
          source: "Blocksec/MetaSleuth",
          severity: "MEDIUM",
          detail: `Risk Score moderado: ${bs.score}/100.`,
          category: "riskscore",
        });
      }
    }
  } catch (err) {
    sources.blocksec = { enabled: false, error: err.message };
  }

  // ============================================================
  // Consolidação do risco
  // ============================================================
  const decision = consolidateRisk(findings, defiAnalysis);

  const report = {
    id: generateReportId(),
    timestamp,
    input: { chain, address },
    decision,
    findings,
    defiAnalysis: defiAnalysis || { summary: {}, findings: [], opaqueHops: 0, mixerInteractions: [], bridgeInteractions: [], dexInteractions: [] },
    sources,
    disclaimer:
      "Screening automatizado. Pode haver falso positivo/negativo. " +
      "Recomenda-se evidências adicionais (KYC, invoice, contrato, hash/txid) " +
      "antes de decisão final de compliance.",
  };

  // ============================================================
  // Gerar avaliação de compliance
  // ============================================================
  const compliance = generateComplianceAssessment(report);

  return { report, compliance };
}

// ============================================================
// Consolidação de risco v2
// ============================================================
function consolidateRisk(findings, defiAnalysis) {
  if (findings.length === 0) {
    return {
      level: "LOW",
      score: 10,
      recommendation: "APPROVE",
      summary: "Nenhum indicador de risco detectado nas fontes consultadas.",
    };
  }

  const hasCritical = findings.some((f) => f.severity === "CRITICAL");
  const highCount = findings.filter((f) => f.severity === "HIGH").length;
  const medCount = findings.filter((f) => f.severity === "MEDIUM").length;

  // Padrão mixer + bridge + DEX = alto risco automático
  const hasMixerBridgeDex = defiAnalysis?.summary?.suspiciousPattern;
  const hasMixer = defiAnalysis?.summary?.usedMixer;

  if (hasCritical || (hasMixer && hasMixerBridgeDex)) {
    return {
      level: hasCritical ? "CRITICAL" : "HIGH",
      score: hasCritical ? 100 : 90,
      recommendation: "BLOCK",
      summary: hasCritical
        ? "Endereço consta em lista de sanções ou interagiu com protocolo sancionado. Transação PROIBIDA."
        : "Fundos passaram por mixer + bridge + DEX. Padrão de ofuscação detectado. Recomenda-se bloqueio.",
    };
  }

  if (highCount >= 2 || hasMixer) {
    return {
      level: "HIGH",
      score: 85,
      recommendation: "BLOCK",
      summary: hasMixer
        ? `Interação com mixer detectada + ${highCount} indicadores de alto risco. Recomenda-se bloqueio.`
        : `${highCount} indicadores de alto risco detectados. Recomenda-se bloqueio.`,
    };
  }

  if (highCount === 1) {
    return {
      level: "HIGH",
      score: 70,
      recommendation: "REVIEW",
      summary: "Indicador de alto risco detectado. Requer revisão manual (EDD).",
    };
  }

  if (medCount >= 2) {
    return {
      level: "MEDIUM",
      score: 55,
      recommendation: "REVIEW",
      summary: `${medCount} indicadores de risco moderado. Recomenda-se diligência adicional.`,
    };
  }

  return {
    level: "MEDIUM",
    score: 40,
    recommendation: "REVIEW",
    summary: "Indicador(es) de risco moderado detectado(s). Monitorar.",
  };
}

function generateReportId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `AML-${ts}-${rand}`.toUpperCase();
}
