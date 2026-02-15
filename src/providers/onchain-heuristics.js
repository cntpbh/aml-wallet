// src/providers/onchain-heuristics.js — Análise heurística on-chain
// Detecta padrões suspeitos com base em dados de blockchain (sem API externa)

/**
 * Analisa dados on-chain e retorna flags de risco + score
 * @param {Object} data - Dados retornados pelo explorer
 * @param {string} chain - Rede (ethereum, bsc, polygon, bitcoin, tron)
 * @returns {{ score: number, flags: Array<{severity: string, detail: string}> }}
 */
export function analyzeOnChain(data, chain) {
  if (!data) return { score: 0, flags: [] };

  const flags = [];
  let riskPoints = 0;

  // ============================================================
  // 1) Idade da carteira
  // ============================================================
  if (data.firstTransaction) {
    const ageMs = Date.now() - new Date(data.firstTransaction).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    if (ageDays < 7) {
      flags.push({
        severity: "HIGH",
        detail: `Carteira muito nova (criada há ${Math.round(ageDays)} dia(s)). Alto risco de descarte pós-uso.`,
      });
      riskPoints += 30;
    } else if (ageDays < 30) {
      flags.push({
        severity: "MEDIUM",
        detail: `Carteira recente (criada há ${Math.round(ageDays)} dias).`,
      });
      riskPoints += 15;
    }
  }

  // ============================================================
  // 2) Volume vs idade (atividade anômala)
  // ============================================================
  if (data.firstTransaction && data.txCount) {
    const ageMs = Date.now() - new Date(data.firstTransaction).getTime();
    const ageDays = Math.max(1, ageMs / (1000 * 60 * 60 * 24));
    const txPerDay = data.txCount / ageDays;

    if (txPerDay > 50) {
      flags.push({
        severity: "HIGH",
        detail: `Atividade anormalmente alta: ~${Math.round(txPerDay)} tx/dia. Possível bot ou mixer.`,
      });
      riskPoints += 25;
    } else if (txPerDay > 20) {
      flags.push({
        severity: "MEDIUM",
        detail: `Atividade elevada: ~${Math.round(txPerDay)} tx/dia.`,
      });
      riskPoints += 10;
    }
  }

  // ============================================================
  // 3) Proporção de stablecoins (USDT/USDC) em tokens
  // ============================================================
  if (data.tokenTxCount > 0 && data.stablecoinTxCount > 0) {
    const stablecoinRatio = data.stablecoinTxCount / data.tokenTxCount;

    if (stablecoinRatio > 0.9 && data.stablecoinTxCount > 20) {
      flags.push({
        severity: "MEDIUM",
        detail: `${Math.round(stablecoinRatio * 100)}% das transações de token são stablecoins (${data.stablecoinTxCount} txs). Padrão comum em OTC/P2P de alto volume.`,
      });
      riskPoints += 10;
    }
  }

  // ============================================================
  // 4) Carteira sem saldo mas com histórico pesado
  // ============================================================
  if (data.balanceRaw !== null && data.balanceRaw < 0.001 && data.txCount > 50) {
    flags.push({
      severity: "MEDIUM",
      detail: `Saldo próximo de zero (${data.balance}) mas ${data.txCount}+ transações. Possível carteira de passagem (relay).`,
    });
    riskPoints += 15;
  }

  // ============================================================
  // 5) Poucos counterparties (concentração)
  // ============================================================
  if (data.uniqueCounterparties !== null && data.uniqueCounterparties > 0) {
    if (data.txCount > 20 && data.uniqueCounterparties < 3) {
      flags.push({
        severity: "MEDIUM",
        detail: `Transaciona com apenas ${data.uniqueCounterparties} endereço(s) diferentes. Alta concentração.`,
      });
      riskPoints += 10;
    }
  }

  // ============================================================
  // 6) Muitas interações com contratos (possível uso de DeFi/mixer)
  // ============================================================
  if (data.contractInteractions > 0 && data.txCount > 0) {
    const contractRatio = data.contractInteractions / data.txCount;
    if (contractRatio > 0.8 && data.contractInteractions > 30) {
      flags.push({
        severity: "LOW",
        detail: `${Math.round(contractRatio * 100)}% das txs interagem com contratos. Padrão de uso intenso de DeFi/dApps.`,
      });
      riskPoints += 5;
    }
  }

  // ============================================================
  // 7) Inatividade prolongada seguida de atividade (dormant reactivation)
  // ============================================================
  if (data.firstTransaction && data.lastTransaction) {
    const firstDate = new Date(data.firstTransaction);
    const lastDate = new Date(data.lastTransaction);
    const totalSpanDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

    if (totalSpanDays > 365 && data.txCount < 10) {
      flags.push({
        severity: "LOW",
        detail: `Carteira existe há ${Math.round(totalSpanDays)} dias mas tem apenas ${data.txCount} transações. Possível carteira dormant reativada.`,
      });
      riskPoints += 5;
    }
  }

  // ============================================================
  // Score normalizado (0-100)
  // ============================================================
  const score = Math.min(100, riskPoints);

  return { score, flags };
}
