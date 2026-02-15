// src/providers/onchain-heuristics.js — Análise heurística (CommonJS)

function analyzeOnChain(data, chain) {
  if (!data) return { score: 0, flags: [] };
  const flags = [];
  let pts = 0;

  // Idade da carteira
  if (data.firstTransaction) {
    const days = (Date.now() - new Date(data.firstTransaction).getTime()) / 864e5;
    if (days < 7) { flags.push({ severity: "HIGH", detail: `Carteira muito nova (${Math.round(days)} dia(s)). Alto risco de descarte pós-uso.` }); pts += 30; }
    else if (days < 30) { flags.push({ severity: "MEDIUM", detail: `Carteira recente (${Math.round(days)} dias).` }); pts += 15; }
  }

  // Volume
  if (data.firstTransaction && data.txCount) {
    const days = Math.max(1, (Date.now() - new Date(data.firstTransaction).getTime()) / 864e5);
    const tpd = data.txCount / days;
    if (tpd > 50) { flags.push({ severity: "HIGH", detail: `~${Math.round(tpd)} tx/dia. Possível bot ou mixer.` }); pts += 25; }
    else if (tpd > 20) { flags.push({ severity: "MEDIUM", detail: `~${Math.round(tpd)} tx/dia. Atividade elevada.` }); pts += 10; }
  }

  // Stablecoins
  if (data.tokenTxCount > 0 && data.stablecoinTxCount > 0) {
    const r = data.stablecoinTxCount / data.tokenTxCount;
    if (r > 0.9 && data.stablecoinTxCount > 20) {
      flags.push({ severity: "MEDIUM", detail: `${Math.round(r * 100)}% stablecoins (${data.stablecoinTxCount} txs). Padrão OTC/P2P.` }); pts += 10;
    }
  }

  // Relay wallet
  if (data.balanceRaw !== null && data.balanceRaw < 0.001 && data.txCount > 50) {
    flags.push({ severity: "MEDIUM", detail: `Saldo ~zero (${data.balance}) mas ${data.txCount}+ txs. Possível relay wallet.` }); pts += 15;
  }

  // Concentração
  if (data.uniqueCounterparties != null && data.txCount > 20 && data.uniqueCounterparties < 3) {
    flags.push({ severity: "MEDIUM", detail: `Apenas ${data.uniqueCounterparties} counterparty(ies). Alta concentração.` }); pts += 10;
  }

  // Contratos
  if (data.contractInteractions > 0 && data.txCount > 0) {
    const r = data.contractInteractions / data.txCount;
    if (r > 0.8 && data.contractInteractions > 30) {
      flags.push({ severity: "LOW", detail: `${Math.round(r * 100)}% interações com contratos. DeFi power user.` }); pts += 5;
    }
  }

  return { score: Math.min(100, pts), flags };
}

module.exports = { analyzeOnChain };
