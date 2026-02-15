// src/providers/defi-analysis.js — Detecção Mixer/Bridge/DEX (CommonJS)

const MIXERS = new Map([
  ["0x8589427373d6d84e98730d7795d8f6f8731fda16", { name: "Tornado Cash", risk: "CRITICAL" }],
  ["0x722122df12d4e14e13ac3b6895a86e84145b6967", { name: "Tornado Cash Router", risk: "CRITICAL" }],
  ["0xd90e2f925da726b50c4ed8d0fb90ad053324f31b", { name: "Tornado Cash 1 ETH", risk: "CRITICAL" }],
  ["0xd96f2b1cf787cf7db4f5946fa12b187a39064b15", { name: "Tornado Cash 10 ETH", risk: "CRITICAL" }],
  ["0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfbfa9", { name: "Tornado Cash 0.1 ETH", risk: "CRITICAL" }],
  ["0x910cbd523d972eb0a6f4cae4618ad62622b39dbf", { name: "Tornado Cash 100 ETH", risk: "CRITICAL" }],
  ["0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3", { name: "Tornado Cash 100 ETH", risk: "CRITICAL" }],
  ["0x58e8dcc13be9780fc42e8723d8ead4cf46943df2", { name: "Tornado Cash 100 DAI", risk: "CRITICAL" }],
  ["0xfa7093cdd9ee6932b4eb2c9e1cce4ce7a7abfee1", { name: "Railgun", risk: "HIGH" }],
  ["0xff1f2b4adb9df6fc8eafecdcbf96a2b351680455", { name: "Aztec Protocol", risk: "HIGH" }],
]);

const BRIDGES = new Map([
  ["0x3ee18b2214aff97000d974cf647e7c347e8fa585", { name: "Wormhole" }],
  ["0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf", { name: "Polygon Bridge" }],
  ["0x99c9fc46f92e8a1c0dec1b1747d010903e884be1", { name: "Optimism Gateway" }],
  ["0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f", { name: "Arbitrum Inbox" }],
  ["0x5427fefa711eff984124bfbb1ab6fbf5e3da1820", { name: "Synapse Bridge" }],
  ["0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae", { name: "LiFi Diamond" }],
  ["0x2796317b0ff8538f253012862c06787adfb8ceb6", { name: "Across Bridge" }],
  ["0x88ad09518695c6c3712ac10a214be5109a655671", { name: "Stargate Router" }],
  ["0xd9d74a29307cc6fc8bf424ee4217f1a587fbc8dc", { name: "THORChain Router" }],
]);

const DEXS = new Map([
  ["0x7a250d5630b4cf539739df2c5dacb4c659f2488d", { name: "Uniswap V2" }],
  ["0xe592427a0aece92de3edee1f18e0157c05861564", { name: "Uniswap V3" }],
  ["0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", { name: "Uniswap V3 R2" }],
  ["0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", { name: "Uniswap Universal" }],
  ["0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", { name: "SushiSwap" }],
  ["0x10ed43c718714eb63d5aa57b78b54704e256024e", { name: "PancakeSwap V2" }],
  ["0x1111111254eeb25477b68fb85ed929f73a960582", { name: "1inch V5" }],
  ["0xdef1c0ded9bec7f1a1670819833240f027b25eff", { name: "0x Exchange" }],
]);

// Known token contracts — NOT opaque hops (standard transfers)
const KNOWN_TOKENS = new Set([
  // EVM — Stablecoins
  "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT (ETH)
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC (ETH)
  "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
  "0x4fabb145d64652a948d72533023f6e7a623c7c53", // BUSD
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
  "0x55d398326f99059ff775485246999027b3197955", // USDT (BSC)
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC (BSC)
  "0xe9e7cea3dedca5984780bafc599bd69add087d56", // BUSD (BSC)
  "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT (Polygon)
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // USDC (Polygon)
  // TRON
  "tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t",         // USDT TRC-20
  "tekxitehnzsme2xqrbj4w32run966rdz8",           // USDC TRC-20
  "tmwfhyxljarok54fi9rdnj6ys7aewn5ch9",          // USDD
  "tnuopnxu4gfzcwqrwgw9beluqntiyhm7h6",          // WIN
  "tfczxzpchnthtehn2y83n64uxcxn2fsltj",          // SUN
  "tkvjmrmhwbhbsyxlbeorlbqyj3vq2zzgyn",         // JST
]);

function analyzeDefiInteractions(explorerData, chain) {
  const result = {
    mixerInteractions: [], bridgeInteractions: [], dexInteractions: [],
    opaqueHops: 0,
    summary: { usedMixer: false, usedBridge: false, usedDex: false, suspiciousPattern: false, patternDescription: null },
    findings: [],
  };

  if (!explorerData?.recentTxSample) return result;
  const txs = explorerData.recentTxSample;

  for (const tx of txs) {
    const to = tx.to?.toLowerCase();
    const from = tx.from?.toLowerCase();
    if (!to) continue;

    // Mixers
    const mx = MIXERS.get(to) || MIXERS.get(from);
    if (mx) {
      result.mixerInteractions.push({ name: mx.name, risk: mx.risk, hash: tx.hash, date: tx.date, direction: MIXERS.has(to) ? "OUT" : "IN" });
      result.summary.usedMixer = true;
    }
    // Bridges
    const br = BRIDGES.get(to) || BRIDGES.get(from);
    if (br) {
      result.bridgeInteractions.push({ name: br.name, hash: tx.hash, date: tx.date, direction: BRIDGES.has(to) ? "OUT" : "IN" });
      result.summary.usedBridge = true;
    }
    // DEXs
    const dx = DEXS.get(to) || DEXS.get(from);
    if (dx) {
      result.dexInteractions.push({ name: dx.name, hash: tx.hash, date: tx.date });
      result.summary.usedDex = true;
    }
  }

  // Opaque hops — only count truly suspicious contract interactions
  let hops = 0;
  for (const tx of txs) {
    const to = tx.to?.toLowerCase();
    const from = tx.from?.toLowerCase();

    // Skip if it's a known token contract (normal TRC-20/ERC-20 transfer)
    if (to && KNOWN_TOKENS.has(to)) continue;
    if (from && KNOWN_TOKENS.has(from)) continue;

    // Skip if tx has a "token" field (means it's a parsed token transfer from explorer)
    if (tx.token) continue;

    // Only count as opaque if it's a contract call to an unknown address
    const isContract = tx.input && tx.input !== "0x" && tx.input?.length > 10;
    if (isContract && to && !DEXS.has(to) && !BRIDGES.has(to) && !MIXERS.has(to)) hops++;

    // Receiving from known risky protocols
    if (from && BRIDGES.has(from)) hops++;
    if (from && MIXERS.has(from)) hops++;
  }

  // Rapid sequences — only suspicious if MANY in sequence (>5 within 10min),
  // not just 2 normal transactions close together
  const dates = txs.map(t => t.date ? new Date(t.date).getTime() : null).filter(Boolean).sort((a, b) => a - b);
  let rapidBurst = 0;
  for (let i = 1; i < dates.length; i++) {
    if ((dates[i] - dates[i - 1]) / 6e4 < 5) { rapidBurst++; } else { rapidBurst = 0; }
  }
  // Only count as hops if there was a genuine burst (5+ txs within 5min each)
  if (rapidBurst >= 5) hops += Math.floor(rapidBurst / 2);

  result.opaqueHops = hops;

  // Pattern detection
  const used = [];
  if (result.summary.usedMixer) used.push("Mixer");
  if (result.summary.usedBridge) used.push("Bridge");
  if (result.summary.usedDex) used.push("DEX");
  if (used.length >= 2) {
    result.summary.suspiciousPattern = true;
    result.summary.patternDescription = `Fundos passaram por ${used.join(" + ")}. Padrão de ofuscação de origem.`;
  }

  // Generate findings — higher thresholds to avoid false positives
  if (result.mixerInteractions.length > 0) {
    const crit = result.mixerInteractions.some(m => m.risk === "CRITICAL");
    result.findings.push({
      source: "DeFi Analysis", severity: crit ? "CRITICAL" : "HIGH", category: "mixer",
      detail: `Mixer detectado: ${[...new Set(result.mixerInteractions.map(m => m.name))].join(", ")}. ${result.mixerInteractions.length} tx(s).`,
    });
  }
  if (result.bridgeInteractions.length > 0) {
    result.findings.push({
      source: "DeFi Analysis", severity: result.summary.usedMixer ? "HIGH" : "MEDIUM", category: "bridge",
      detail: `Bridge cross-chain: ${[...new Set(result.bridgeInteractions.map(b => b.name))].join(", ")}.`,
    });
  }
  if (result.summary.suspiciousPattern) {
    result.findings.push({ source: "DeFi Analysis", severity: "HIGH", category: "pattern", detail: result.summary.patternDescription });
  }
  // Opaque hops: only flag if genuinely high (5+ real hops, not token transfers)
  if (result.opaqueHops >= 5) {
    result.findings.push({
      source: "DeFi Analysis", severity: result.opaqueHops >= 10 ? "HIGH" : "MEDIUM", category: "hops",
      detail: `${result.opaqueHops} salto(s) opaco(s) detectado(s).`,
    });
  }

  return result;
}

module.exports = { analyzeDefiInteractions };
