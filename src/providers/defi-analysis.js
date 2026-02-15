// src/providers/defi-analysis.js — Detecção de DEX, Bridge, Mixer e saltos opacos

// ============================================================
// ENDEREÇOS CONHECIDOS — Mixers, Bridges, DEXs
// ============================================================

const KNOWN_MIXERS = new Map([
  // Tornado Cash
  ["0x8589427373d6d84e98730d7795d8f6f8731fda16", { name: "Tornado Cash", type: "mixer", risk: "CRITICAL" }],
  ["0x722122df12d4e14e13ac3b6895a86e84145b6967", { name: "Tornado Cash Router", type: "mixer", risk: "CRITICAL" }],
  ["0xd90e2f925da726b50c4ed8d0fb90ad053324f31b", { name: "Tornado Cash 1 ETH", type: "mixer", risk: "CRITICAL" }],
  ["0xd96f2b1cf787cf7db4f5946fa12b187a39064b15", { name: "Tornado Cash 10 ETH", type: "mixer", risk: "CRITICAL" }],
  ["0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfbfa9", { name: "Tornado Cash 0.1 ETH", type: "mixer", risk: "CRITICAL" }],
  ["0x910cbd523d972eb0a6f4cae4618ad62622b39dbf", { name: "Tornado Cash 100 ETH", type: "mixer", risk: "CRITICAL" }],
  ["0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3", { name: "Tornado Cash 100 ETH", type: "mixer", risk: "CRITICAL" }],
  ["0xa160cdab225685da1d56aa342ad8841c3b53f291", { name: "Tornado Cash 10 ETH", type: "mixer", risk: "CRITICAL" }],
  ["0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144", { name: "Tornado Cash 0.1 ETH", type: "mixer", risk: "CRITICAL" }],
  ["0x58e8dcc13be9780fc42e8723d8ead4cf46943df2", { name: "Tornado Cash 100 DAI", type: "mixer", risk: "CRITICAL" }],
  ["0x178169b423a011fff22b9e3f3abea13a5b3bc24e", { name: "Tornado Cash 1000 DAI", type: "mixer", risk: "CRITICAL" }],
  ["0x610b717796ad172b316836ac95a2ffad065ceab4", { name: "Tornado Cash 10000 DAI", type: "mixer", risk: "CRITICAL" }],
  ["0xbb93e510bbcd0b7beb5a853875f9ec60275cf498", { name: "Tornado Cash 100000 DAI", type: "mixer", risk: "CRITICAL" }],
  // Railgun
  ["0xfa7093cdd9ee6932b4eb2c9e1cce4ce7a7abfee1", { name: "Railgun", type: "mixer", risk: "HIGH" }],
  // Aztec (privacy)
  ["0xff1f2b4adb9df6fc8eafecdcbf96a2b351680455", { name: "Aztec Protocol", type: "privacy", risk: "HIGH" }],
  // Sinbad
  ["0x25d39b8a67e3baa7b0e53adf331e6956cb0ff76e", { name: "Sinbad Mixer", type: "mixer", risk: "CRITICAL" }],
]);

const KNOWN_BRIDGES = new Map([
  // Cross-chain bridges
  ["0x3ee18b2214aff97000d974cf647e7c347e8fa585", { name: "Wormhole", type: "bridge" }],
  ["0x3014ca10b91cb3d0ad85fef7a3cb95bcac9c0f79", { name: "Multichain (Anyswap)", type: "bridge" }],
  ["0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf", { name: "Polygon Bridge (ERC20)", type: "bridge" }],
  ["0xa0c68c638235ee32657e8f720a23cec1bfc6c9a8", { name: "Polygon Bridge (Ether)", type: "bridge" }],
  ["0x99c9fc46f92e8a1c0dec1b1747d010903e884be1", { name: "Optimism Gateway", type: "bridge" }],
  ["0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f", { name: "Arbitrum Inbox", type: "bridge" }],
  ["0x5427fefa711eff984124bfbb1ab6fbf5e3da1820", { name: "Synapse Bridge", type: "bridge" }],
  ["0xc30141b657f4216252dc59af2e7cdb9d8792e1b0", { name: "Socket Bridge", type: "bridge" }],
  ["0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae", { name: "LiFi Diamond", type: "bridge" }],
  ["0x2796317b0ff8538f253012862c06787adfb8ceb6", { name: "Across Bridge", type: "bridge" }],
  ["0x88ad09518695c6c3712ac10a214be5109a655671", { name: "Stargate Router", type: "bridge" }],
  ["0xd9d74a29307cc6fc8bf424ee4217f1a587fbc8dc", { name: "THORChain Router", type: "bridge" }],
]);

const KNOWN_DEXS = new Map([
  // Uniswap
  ["0x7a250d5630b4cf539739df2c5dacb4c659f2488d", { name: "Uniswap V2 Router", type: "dex" }],
  ["0xe592427a0aece92de3edee1f18e0157c05861564", { name: "Uniswap V3 Router", type: "dex" }],
  ["0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", { name: "Uniswap V3 Router 2", type: "dex" }],
  ["0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", { name: "Uniswap Universal Router", type: "dex" }],
  // Sushiswap
  ["0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", { name: "SushiSwap Router", type: "dex" }],
  // PancakeSwap
  ["0x10ed43c718714eb63d5aa57b78b54704e256024e", { name: "PancakeSwap V2 Router", type: "dex" }],
  ["0x13f4ea83d0bd40e75c8222255bc855a974568dd4", { name: "PancakeSwap V3 Router", type: "dex" }],
  // 1inch
  ["0x1111111254eeb25477b68fb85ed929f73a960582", { name: "1inch V5 Router", type: "dex" }],
  ["0x111111125421ca6dc452d289314280a0f8842a65", { name: "1inch V6 Router", type: "dex" }],
  // Curve
  ["0xbebe89aa9d41a457a04d043f97de75291249ab0a", { name: "Curve Router", type: "dex" }],
  // 0x
  ["0xdef1c0ded9bec7f1a1670819833240f027b25eff", { name: "0x Exchange Proxy", type: "dex" }],
]);

// TRON known addresses
const TRON_KNOWN = new Map([
  ["TKzxdSv2FZKQrEqkKVgp5DcwEXBXBBWG4R", { name: "SunSwap V2 Router", type: "dex" }],
  ["TXF1yBnEoSFAfp9K3djekjMUbJFnG2mSPp", { name: "SunSwap V1", type: "dex" }],
  ["TGzz8gjYiYRqpfmDwnLxfNPZPB5uVdRvRh", { name: "JustSwap", type: "dex" }],
]);

// ============================================================
// analyzeDefiInteractions — Analisa transações para DEX/Bridge/Mixer
// ============================================================
export function analyzeDefiInteractions(explorerData, chain) {
  const result = {
    mixerInteractions: [],
    bridgeInteractions: [],
    dexInteractions: [],
    opaqueHops: 0,
    hopChain: [],
    summary: {
      usedMixer: false,
      usedBridge: false,
      usedDex: false,
      suspiciousPattern: false,
      patternDescription: null,
    },
    findings: [],
  };

  if (!explorerData?.recentTxSample) return result;

  const txs = explorerData.recentTxSample || [];

  for (const tx of txs) {
    const to = tx.to?.toLowerCase();
    const from = tx.from?.toLowerCase();

    if (!to) continue;

    // Check Mixers
    if (KNOWN_MIXERS.has(to) || KNOWN_MIXERS.has(from)) {
      const mixer = KNOWN_MIXERS.get(to) || KNOWN_MIXERS.get(from);
      result.mixerInteractions.push({
        name: mixer.name,
        type: mixer.type,
        risk: mixer.risk,
        hash: tx.hash,
        date: tx.date,
        direction: KNOWN_MIXERS.has(to) ? "OUT (deposit)" : "IN (withdrawal)",
      });
      result.summary.usedMixer = true;
    }

    // Check Bridges
    if (KNOWN_BRIDGES.has(to) || KNOWN_BRIDGES.has(from)) {
      const bridge = KNOWN_BRIDGES.get(to) || KNOWN_BRIDGES.get(from);
      result.bridgeInteractions.push({
        name: bridge.name,
        hash: tx.hash,
        date: tx.date,
        direction: KNOWN_BRIDGES.has(to) ? "OUT (bridging)" : "IN (received)",
      });
      result.summary.usedBridge = true;
    }

    // Check DEXs
    if (KNOWN_DEXS.has(to) || KNOWN_DEXS.has(from)) {
      const dex = KNOWN_DEXS.get(to) || KNOWN_DEXS.get(from);
      result.dexInteractions.push({
        name: dex.name,
        hash: tx.hash,
        date: tx.date,
      });
      result.summary.usedDex = true;
    }
  }

  // TRON-specific checks
  if (chain === "tron") {
    for (const tx of txs) {
      const to = tx.to;
      if (to && TRON_KNOWN.has(to)) {
        const known = TRON_KNOWN.get(to);
        if (known.type === "dex") {
          result.dexInteractions.push({ name: known.name, hash: tx.hash, date: tx.date });
          result.summary.usedDex = true;
        }
      }
    }
  }

  // ============================================================
  // Detecção de saltos opacos (opaque hops)
  // ============================================================
  result.opaqueHops = detectOpaqueHops(explorerData, txs);

  // ============================================================
  // Padrão combinado: DEX + Bridge + Mixer = alto risco
  // ============================================================
  const usedTypes = [];
  if (result.summary.usedMixer) usedTypes.push("Mixer");
  if (result.summary.usedBridge) usedTypes.push("Bridge");
  if (result.summary.usedDex) usedTypes.push("DEX");

  if (usedTypes.length >= 2) {
    result.summary.suspiciousPattern = true;
    result.summary.patternDescription =
      `Fundos passaram por ${usedTypes.join(" + ")}. Padrão de ofuscação de origem dos fundos.`;
  }

  // ============================================================
  // Gerar findings
  // ============================================================
  if (result.mixerInteractions.length > 0) {
    const critical = result.mixerInteractions.some((m) => m.risk === "CRITICAL");
    result.findings.push({
      source: "DeFi Analysis",
      severity: critical ? "CRITICAL" : "HIGH",
      detail: `Interação com mixer(s) detectada: ${[...new Set(result.mixerInteractions.map((m) => m.name))].join(", ")}. ${result.mixerInteractions.length} transação(ões).`,
      category: "mixer",
    });
  }

  if (result.bridgeInteractions.length > 0) {
    result.findings.push({
      source: "DeFi Analysis",
      severity: result.summary.usedMixer ? "HIGH" : "MEDIUM",
      detail: `Uso de bridge cross-chain: ${[...new Set(result.bridgeInteractions.map((b) => b.name))].join(", ")}. Fundos podem ter origem em outra rede.`,
      category: "bridge",
    });
  }

  if (result.summary.suspiciousPattern) {
    result.findings.push({
      source: "DeFi Analysis",
      severity: "HIGH",
      detail: result.summary.patternDescription,
      category: "pattern",
    });
  }

  if (result.opaqueHops >= 3) {
    result.findings.push({
      source: "DeFi Analysis",
      severity: result.opaqueHops >= 5 ? "HIGH" : "MEDIUM",
      detail: `${result.opaqueHops} salto(s) opaco(s) detectado(s). Fundos passaram por intermediários antes de chegar a esta carteira.`,
      category: "hops",
    });
  }

  return result;
}

// ============================================================
// Detecção de saltos opacos
// ============================================================
function detectOpaqueHops(data, txs) {
  let hops = 0;

  for (const tx of txs) {
    const isContractCall = tx.input && tx.input !== "0x" && tx.input?.length > 10;
    const hasValue = parseFloat(tx.value) > 0;

    // Hop opaco: transação com contrato + valor + sem match com DEX/bridge conhecidos
    if (isContractCall && hasValue) {
      const to = tx.to?.toLowerCase();
      if (to && !KNOWN_DEXS.has(to) && !KNOWN_BRIDGES.has(to) && !KNOWN_MIXERS.has(to)) {
        hops++;
      }
    }

    // Hop opaco: recebimento de contrato desconhecido (internal tx pattern)
    if (tx.from && tx.to) {
      const from = tx.from.toLowerCase();
      if (KNOWN_BRIDGES.has(from) || KNOWN_MIXERS.has(from)) {
        hops++;
      }
    }
  }

  // Padrão adicional: muitas transações pequenas em sequência rápida
  if (txs.length >= 3) {
    const dates = txs
      .map((tx) => tx.date ? new Date(tx.date).getTime() : null)
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (dates.length >= 3) {
      let rapidSequences = 0;
      for (let i = 1; i < dates.length; i++) {
        const diffMinutes = (dates[i] - dates[i - 1]) / (1000 * 60);
        if (diffMinutes < 10) rapidSequences++;
      }
      if (rapidSequences >= 2) hops += rapidSequences;
    }
  }

  return hops;
}

// ============================================================
// getProtocolLabel — Retorna label legível para um endereço
// ============================================================
export function getProtocolLabel(address) {
  const addr = address?.toLowerCase();
  if (!addr) return null;

  if (KNOWN_MIXERS.has(addr)) return KNOWN_MIXERS.get(addr);
  if (KNOWN_BRIDGES.has(addr)) return KNOWN_BRIDGES.get(addr);
  if (KNOWN_DEXS.has(addr)) return KNOWN_DEXS.get(addr);
  if (TRON_KNOWN.has(address)) return TRON_KNOWN.get(address);

  return null;
}
