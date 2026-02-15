// src/compliance/kyc-assessment.js — Avaliação de Compliance KYC/AML

/**
 * Gera avaliação completa de compliance para o relatório
 * Inclui: KYC, AML/KYT, cooperação regulatória, trilha de auditoria,
 *         monitoramento on-chain, prova de reservas
 */
function generateComplianceAssessment(report) {
  const d = report.decision;
  const findings = report.findings || [];
  const defi = report.defiAnalysis || {};
  const explorer = report.sources?.explorer?.data || {};
  const heuristics = report.sources?.heuristics || {};

  const assessment = {
    timestamp: report.timestamp,
    overallRisk: d.level,
    overallScore: d.score,
    recommendation: d.recommendation,

    // ============================================================
    // 1) KYC Obrigatório
    // ============================================================
    kyc: evaluateKYC(d, findings, explorer, defi),

    // ============================================================
    // 2) AML/KYT Ativo
    // ============================================================
    amlKyt: evaluateAMLKYT(report),

    // ============================================================
    // 3) Cooperação Regulatória
    // ============================================================
    regulatoryCooperation: evaluateRegulatory(d, findings),

    // ============================================================
    // 4) Trilha de Auditoria
    // ============================================================
    auditTrail: generateAuditTrail(report),

    // ============================================================
    // 5) Relatórios e Monitoramento On-Chain
    // ============================================================
    onChainMonitoring: evaluateOnChainMonitoring(explorer, defi, heuristics),

    // ============================================================
    // 6) Prova de Reservas / Transparência
    // ============================================================
    proofOfReserves: evaluateTransparency(explorer, defi, findings),
  };

  return assessment;
}

// ============================================================
// 1) KYC — Due Diligence Assessment
// ============================================================
function evaluateKYC(decision, findings, explorer, defi) {
  const level = decision.level;
  let requirement = "Standard CDD";
  let actions = [];
  let status = "REQUIRED";

  if (level === "CRITICAL") {
    requirement = "Enhanced Due Diligence (EDD) + Suspicious Activity Report (SAR)";
    status = "MANDATORY_BLOCK";
    actions = [
      "BLOQUEAR transação imediatamente",
      "Registrar SAR/COAF (Comunicação de Operação Suspeita)",
      "Preservar toda documentação para autoridades",
      "Não alertar o cliente sobre a investigação (tipping-off)",
      "Acionar Compliance Officer para decisão final",
    ];
  } else if (level === "HIGH") {
    requirement = "Enhanced Due Diligence (EDD)";
    status = "MANDATORY_EDD";
    actions = [
      "Solicitar documentação completa: ID + comprovante de endereço + source of funds",
      "Verificar identidade via serviço de KYC (Onfido, Jumio, SumSub)",
      "Exigir declaração de origem dos fundos (assinada)",
      "Verificar PEP (Politically Exposed Person) e lista de sanções",
      "Análise manual por Compliance Officer antes de prosseguir",
      "Documentar decisão e justificativa (trilha de auditoria)",
    ];
  } else if (level === "MEDIUM") {
    requirement = "Customer Due Diligence (CDD) Reforçada";
    status = "REQUIRED_CDD_PLUS";
    actions = [
      "Solicitar ID e comprovante de endereço",
      "Verificar consistência dos dados informados",
      "Solicitar invoice/contrato referente à operação",
      "Monitoramento contínuo por 90 dias",
    ];
  } else {
    requirement = "Customer Due Diligence (CDD) Padrão";
    status = "STANDARD";
    actions = [
      "Verificação de identidade básica (ID + selfie)",
      "Registro da operação em sistema interno",
      "Monitoramento padrão",
    ];
  }

  // Adicionar flags específicas
  const mixerUsed = defi?.summary?.usedMixer;
  const bridgeUsed = defi?.summary?.usedBridge;

  if (mixerUsed) {
    actions.unshift("⚠️ MIXER DETECTADO — Exigir explicação detalhada da origem dos fundos");
  }
  if (bridgeUsed) {
    actions.push("Solicitar rastreio completo cross-chain (hash de origem + destino)");
  }

  return {
    requirement,
    status,
    actions,
    documentsRequired: getRequiredDocuments(level, mixerUsed),
    riskFactors: findings.map((f) => `[${f.severity}] ${f.source}: ${f.detail}`),
  };
}

function getRequiredDocuments(level, mixerUsed) {
  const docs = [
    { name: "Documento de identidade (RG/CNH/Passaporte)", required: true },
    { name: "Comprovante de endereço (últimos 3 meses)", required: true },
  ];

  if (level !== "LOW") {
    docs.push({ name: "Comprovante de renda / declaração IR", required: level !== "MEDIUM" });
    docs.push({ name: "Invoice / Contrato da operação", required: true });
  }

  if (level === "HIGH" || level === "CRITICAL") {
    docs.push({ name: "Declaração de origem dos fundos (assinada)", required: true });
    docs.push({ name: "Extratos bancários (últimos 6 meses)", required: true });
    docs.push({ name: "Hash/TXID das transações de origem", required: true });
    docs.push({ name: "Contrato social / Ato constitutivo (se PJ)", required: false });
  }

  if (mixerUsed) {
    docs.push({ name: "Justificativa por escrito do uso de mixer", required: true });
    docs.push({ name: "Rastreio completo da cadeia de transações", required: true });
  }

  return docs;
}

// ============================================================
// 2) AML/KYT Assessment
// ============================================================
function evaluateAMLKYT(report) {
  const sources = report.sources || {};
  const activeProviders = [];
  const inactiveProviders = [];

  const providerChecks = [
    { name: "OFAC/SDN (Sanções)", key: "ofac" },
    { name: "Blockchain Explorer (On-Chain)", key: "explorer" },
    { name: "Heurísticas Comportamentais", key: "heuristics" },
    { name: "Chainabuse (Scam Reports)", key: "chainabuse" },
    { name: "Blocksec/MetaSleuth (Risk Score)", key: "blocksec" },
    { name: "DeFi Protocol Analysis", key: "defiAnalysis" },
  ];

  for (const p of providerChecks) {
    const src = sources[p.key] || report[p.key];
    if (src?.enabled !== false && src !== undefined) {
      activeProviders.push(p.name);
    } else {
      inactiveProviders.push(p.name);
    }
  }

  const coveragePercent = Math.round((activeProviders.length / providerChecks.length) * 100);

  return {
    status: coveragePercent >= 80 ? "ACTIVE" : coveragePercent >= 50 ? "PARTIAL" : "INSUFFICIENT",
    coveragePercent,
    activeProviders,
    inactiveProviders,
    recommendation:
      coveragePercent < 80
        ? `Cobertura de ${coveragePercent}%. Recomenda-se ativar: ${inactiveProviders.join(", ")}`
        : `Cobertura de ${coveragePercent}%. Sistema operando com nível adequado de fontes.`,
    screeningType: "Automated Real-Time Screening",
    frequency: "Per-transaction (on-demand)",
  };
}

// ============================================================
// 3) Cooperação Regulatória
// ============================================================
function evaluateRegulatory(decision, findings) {
  const obligations = [];

  if (decision.level === "CRITICAL") {
    obligations.push({
      regulation: "Circular BACEN nº 3.978/2020",
      action: "Comunicação ao COAF obrigatória (SISCOAF)",
      deadline: "24 horas",
      priority: "IMEDIATA",
    });
    obligations.push({
      regulation: "FATF Recommendation 20",
      action: "Suspicious Transaction Report (STR)",
      deadline: "Imediatamente",
      priority: "IMEDIATA",
    });
  }

  if (decision.level === "HIGH" || decision.level === "CRITICAL") {
    obligations.push({
      regulation: "Lei nº 9.613/1998 (Lei de Lavagem)",
      action: "Manter registros por mínimo de 5 anos",
      deadline: "Contínuo",
      priority: "ALTA",
    });
    obligations.push({
      regulation: "Instrução CVM 617/2019",
      action: "Due diligence reforçada e monitoramento contínuo",
      deadline: "Antes de prosseguir com operação",
      priority: "ALTA",
    });
  }

  obligations.push({
    regulation: "Circular BACEN nº 3.978/2020",
    action: "Registro e manutenção de cadastro do cliente",
    deadline: "Contínuo",
    priority: "PADRÃO",
  });

  const hasMixer = findings.some(f => f.category === "mixer" || f.detail?.toLowerCase().includes("mixer"));
  if (hasMixer) {
    obligations.push({
      regulation: "OFAC Compliance",
      action: "Verificar se mixer está na SDN List (Tornado Cash = sancionado)",
      deadline: "Antes da operação",
      priority: "CRÍTICA",
    });
  }

  return {
    status: decision.level === "CRITICAL" ? "SAR_REQUIRED" : decision.level === "HIGH" ? "ENHANCED_MONITORING" : "STANDARD",
    obligations,
    jurisdictions: ["Brasil (BACEN/COAF)", "EUA (OFAC/FinCEN)", "Internacional (FATF/GAFI)"],
  };
}

// ============================================================
// 4) Trilha de Auditoria
// ============================================================
function generateAuditTrail(report) {
  const trail = [];
  const ts = report.timestamp;

  trail.push({
    timestamp: ts,
    action: "SCREENING_INITIATED",
    detail: `Screening iniciado para ${report.input.chain.toUpperCase()}:${report.input.address}`,
    actor: "SYSTEM",
  });

  // Registrar cada fonte consultada
  for (const [key, src] of Object.entries(report.sources || {})) {
    if (src && typeof src === "object") {
      trail.push({
        timestamp: ts,
        action: "SOURCE_QUERIED",
        detail: `Fonte '${key}' consultada. Status: ${src.enabled !== false ? "OK" : "N/A"}${src.error ? ` (Erro: ${src.error})` : ""}`,
        actor: "SYSTEM",
      });
    }
  }

  // Registrar DeFi analysis
  if (report.defiAnalysis) {
    trail.push({
      timestamp: ts,
      action: "DEFI_ANALYSIS",
      detail: `Análise DeFi: Mixer=${report.defiAnalysis.summary?.usedMixer}, Bridge=${report.defiAnalysis.summary?.usedBridge}, DEX=${report.defiAnalysis.summary?.usedDex}, Hops=${report.defiAnalysis.opaqueHops}`,
      actor: "SYSTEM",
    });
  }

  trail.push({
    timestamp: ts,
    action: "RISK_CALCULATED",
    detail: `Nível: ${report.decision.level}, Score: ${report.decision.score}/100, Recomendação: ${report.decision.recommendation}`,
    actor: "SYSTEM",
  });

  trail.push({
    timestamp: ts,
    action: "REPORT_GENERATED",
    detail: `Relatório ID ${report.id} gerado com ${report.findings.length} finding(s).`,
    actor: "SYSTEM",
  });

  // Hash do relatório (integridade)
  const reportHash = simpleHash(JSON.stringify(report));
  trail.push({
    timestamp: ts,
    action: "INTEGRITY_HASH",
    detail: `SHA256-LIKE: ${reportHash}`,
    actor: "SYSTEM",
  });

  return {
    entries: trail,
    reportHash,
    retentionPolicy: "Mínimo 5 anos (Lei 9.613/1998)",
    immutable: true,
  };
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}

// ============================================================
// 5) Monitoramento On-Chain
// ============================================================
function evaluateOnChainMonitoring(explorer, defi, heuristics) {
  const metrics = {};

  if (explorer) {
    metrics.balance = explorer.balance || "N/A";
    metrics.totalTransactions = explorer.txCount || 0;
    metrics.tokenTransactions = explorer.tokenTxCount || 0;
    metrics.stablecoinTransactions = explorer.stablecoinTxCount || 0;
    metrics.firstActivity = explorer.firstTransaction || "N/A";
    metrics.lastActivity = explorer.lastTransaction || "N/A";
    metrics.uniqueCounterparties = explorer.uniqueCounterparties || "N/A";
    metrics.contractInteractions = explorer.contractInteractions || 0;
  }

  const monitoring = {
    metrics,
    defiExposure: {
      mixers: defi?.mixerInteractions?.length || 0,
      bridges: defi?.bridgeInteractions?.length || 0,
      dexSwaps: defi?.dexInteractions?.length || 0,
      opaqueHops: defi?.opaqueHops || 0,
      pattern: defi?.summary?.patternDescription || "Nenhum padrão suspeito detectado",
    },
    heuristicFlags: heuristics?.flags || [],
    heuristicScore: heuristics?.score || 0,
    continuousMonitoring: {
      recommended: true,
      frequency: "Diário para HIGH/CRITICAL, Semanal para MEDIUM, Mensal para LOW",
      alerts: [
        "Mudança súbita de padrão de transação",
        "Nova interação com mixer ou protocolo de privacidade",
        "Recebimento de fundos de endereço sancionado",
        "Volume anormal de transações",
      ],
    },
  };

  return monitoring;
}

// ============================================================
// 6) Prova de Reservas / Transparência
// ============================================================
function evaluateTransparency(explorer, defi, findings) {
  let transparencyScore = 100;
  const factors = [];

  // Mixer diminui transparência drasticamente
  if (defi?.summary?.usedMixer) {
    transparencyScore -= 50;
    factors.push({
      factor: "Uso de mixer/tumbler",
      impact: -50,
      detail: "Fundos passaram por serviço de ofuscação. Rastreabilidade severamente comprometida.",
    });
  }

  // Bridge diminui um pouco
  if (defi?.summary?.usedBridge) {
    transparencyScore -= 15;
    factors.push({
      factor: "Uso de bridge cross-chain",
      impact: -15,
      detail: "Fundos cruzaram chains. Rastreio requer análise multi-chain.",
    });
  }

  // Saltos opacos
  const hops = defi?.opaqueHops || 0;
  if (hops >= 3) {
    const penalty = Math.min(25, hops * 5);
    transparencyScore -= penalty;
    factors.push({
      factor: `${hops} saltos opacos`,
      impact: -penalty,
      detail: "Múltiplos intermediários entre origem e destino dos fundos.",
    });
  }

  // Carteira sem histórico
  if (explorer?.txCount < 5) {
    transparencyScore -= 10;
    factors.push({
      factor: "Histórico limitado",
      impact: -10,
      detail: "Poucas transações. Impossível estabelecer padrão comportamental.",
    });
  }

  transparencyScore = Math.max(0, transparencyScore);

  let status;
  if (transparencyScore >= 80) status = "TRANSPARENT";
  else if (transparencyScore >= 50) status = "PARTIALLY_OPAQUE";
  else if (transparencyScore >= 20) status = "OPAQUE";
  else status = "UNTRACEABLE";

  return {
    score: transparencyScore,
    status,
    factors,
    fundTraceability:
      transparencyScore >= 80
        ? "Alta — origem dos fundos rastreável via blockchain"
        : transparencyScore >= 50
          ? "Parcial — parte do caminho dos fundos é opaco"
          : transparencyScore >= 20
            ? "Baixa — múltiplas camadas de ofuscação detectadas"
            : "Nula — fundos passaram por mixer(s). Origem irrastreável.",
    recommendation:
      transparencyScore < 50
        ? "Exigir prova documental da origem dos fundos (extratos, contratos, invoices)."
        : "Rastreio on-chain suficiente para diligência padrão.",
  };
}

module.exports = { generateComplianceAssessment };
