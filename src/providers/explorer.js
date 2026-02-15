// src/providers/explorer.js — Multi-chain blockchain explorer (CommonJS)

const EXPLORER_CONFIG = {
  ethereum: { url: "https://api.etherscan.io/api", key: () => process.env.ETHERSCAN_API_KEY || "", unit: "ETH" },
  bsc: { url: "https://api.bscscan.com/api", key: () => process.env.BSCSCAN_API_KEY || "", unit: "BNB" },
  polygon: { url: "https://api.polygonscan.com/api", key: () => process.env.POLYGONSCAN_API_KEY || "", unit: "MATIC" },
};

async function checkExplorer(chain, address) {
  if (chain === "bitcoin") return checkBlockchair(address);
  if (chain === "tron") return checkTron(address);
  return checkEVM(chain, address);
}

// ============================================================
// EVM (Ethereum, BSC, Polygon)
// ============================================================
async function checkEVM(chain, address) {
  const cfg = EXPLORER_CONFIG[chain];
  if (!cfg) throw new Error("Explorer nao configurado: " + chain);
  const kp = cfg.key() ? "&apikey=" + cfg.key() : "";
  const bp = "&address=" + address + kp;

  const [balRes, txRes, tokenRes] = await Promise.all([
    fetchJSON(cfg.url + "?module=account&action=balance" + bp),
    fetchJSON(cfg.url + "?module=account&action=txlist" + bp + "&startblock=0&endblock=99999999&page=1&offset=50&sort=desc"),
    fetchJSON(cfg.url + "?module=account&action=tokentx" + bp + "&page=1&offset=50&sort=desc"),
  ]);

  const balance = balRes?.result ? parseInt(balRes.result) / 1e18 : null;
  const txs = Array.isArray(txRes?.result) ? txRes.result : [];
  const tokenTxs = Array.isArray(tokenRes?.result) ? tokenRes.result : [];
  const addrLow = address.toLowerCase();

  // Counterparties
  const cps = new Map();
  for (const tx of [...txs, ...tokenTxs]) {
    const other = tx.from?.toLowerCase() === addrLow ? tx.to?.toLowerCase() : tx.from?.toLowerCase();
    if (other && other !== addrLow) {
      const e = cps.get(other) || { address: other, txCount: 0, lastSeen: null };
      e.txCount++;
      const ts = tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000).toISOString() : null;
      if (ts && (!e.lastSeen || ts > e.lastSeen)) e.lastSeen = ts;
      cps.set(other, e);
    }
  }

  const stableTxs = tokenTxs.filter(tx => ["USDT", "USDC", "DAI", "BUSD"].includes(tx.tokenSymbol?.toUpperCase()));

  return {
    provider: "Etherscan", chain,
    balance: balance !== null ? balance.toFixed(6) + " " + cfg.unit : "N/A",
    balanceRaw: balance,
    txCount: txs.length,
    tokenTxCount: tokenTxs.length,
    stablecoinTxCount: stableTxs.length,
    firstTransaction: txs.length ? new Date(parseInt(txs[txs.length - 1].timeStamp) * 1000).toISOString() : null,
    lastTransaction: txs.length ? new Date(parseInt(txs[0].timeStamp) * 1000).toISOString() : null,
    uniqueCounterparties: cps.size,
    contractInteractions: txs.filter(tx => tx.input && tx.input !== "0x").length,
    topCounterparties: [...cps.values()].sort((a, b) => b.txCount - a.txCount).slice(0, 10),
    tokenBalances: [...new Set(tokenTxs.map(t => t.tokenSymbol))].slice(0, 10).map(s => ({ symbol: s })),
    recentTransactions: txs.slice(0, 15).map(tx => ({
      hash: tx.hash, from: tx.from, to: tx.to,
      value: tx.value ? (parseInt(tx.value) / 1e18).toFixed(6) + " " + cfg.unit : "0",
      date: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000).toISOString() : null,
      direction: tx.from?.toLowerCase() === addrLow ? "OUT" : "IN",
    })),
    recentTxSample: txs.slice(0, 10).map(tx => ({
      hash: tx.hash, from: tx.from, to: tx.to,
      value: tx.value ? String(parseInt(tx.value) / 1e18) : "0",
      input: tx.input,
      date: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000).toISOString() : null,
    })),
  };
}

// ============================================================
// TRON — TronGrid (primary) + Tronscan (fallback)
// ============================================================
async function checkTron(address) {
  let acct = null, txList = [], trc20List = [], provider = "TronGrid";
  const tgKey = process.env.TRONGRID_API_KEY || "";
  const hdrs = { "Accept": "application/json" };
  if (tgKey) hdrs["TRON-PRO-API-KEY"] = tgKey;

  // === TronGrid (primary) ===
  try {
    const [aR, tR, t20R] = await Promise.all([
      fetchJSON("https://api.trongrid.io/v1/accounts/" + address, hdrs),
      fetchJSON("https://api.trongrid.io/v1/accounts/" + address + "/transactions?limit=50&order_by=block_timestamp,desc", hdrs),
      fetchJSON("https://api.trongrid.io/v1/accounts/" + address + "/transactions/trc20?limit=50&order_by=block_timestamp,desc", hdrs),
    ]);
    if (aR?.data?.length > 0) acct = aR.data[0];
    else if (aR?.balance !== undefined || aR?.address) acct = aR;
    txList = Array.isArray(tR?.data) ? tR.data : [];
    trc20List = Array.isArray(t20R?.data) ? t20R.data : [];
  } catch (e) { console.log("[TRON] TronGrid err:", e.message); }

  // === Tronscan (fallback) ===
  if (!acct) {
    provider = "Tronscan";
    try {
      const tsHeaders = { "Accept": "application/json" };
      const tsKey = process.env.TRONSCAN_API_KEY || "";
      if (tsKey) tsHeaders["TRON-PRO-API-KEY"] = tsKey;
      const [aR, tR] = await Promise.all([
        fetchJSON("https://apilist.tronscanapi.com/api/accountv2?address=" + address, tsHeaders),
        fetchJSON("https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&count=true&limit=50&start=0&address=" + address, tsHeaders),
      ]);
      if (aR) acct = aR;
      txList = Array.isArray(tR?.data) ? tR.data : [];
    } catch (e2) { console.log("[TRON] Tronscan err:", e2.message); }
  }

  // === POST RPC fallback ===
  if (!acct) {
    try {
      const resp = await fetch("https://api.trongrid.io/wallet/getaccount", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ address: address, visible: true }),
        signal: AbortSignal.timeout(15000),
      });
      if (resp.ok) {
        const raw = await resp.json();
        if (raw && (raw.balance !== undefined || raw.address)) { acct = raw; provider = "TronGrid-RPC"; }
      }
    } catch (e3) { console.log("[TRON] RPC err:", e3.message); }
  }

  if (!acct) throw new Error("TRON: APIs indisponiveis (TronGrid + Tronscan). Configure TRONGRID_API_KEY ou tente novamente.");

  // === Parse balance ===
  const balanceRaw = (acct.balance || 0) / 1e6;
  const balance = balanceRaw.toFixed(6) + " TRX";

  // === Token balances (TRC-20) ===
  const tokenBalances = [];
  const USDT_ADDR = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
  const USDC_ADDR = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";
  if (Array.isArray(acct.trc20)) {
    for (const tok of acct.trc20) {
      for (const [contract, amount] of Object.entries(tok)) {
        const sym = contract === USDT_ADDR ? "USDT" : contract === USDC_ADDR ? "USDC" : contract.substring(0, 8) + "...";
        const dec = (contract === USDT_ADDR || contract === USDC_ADDR) ? 6 : 18;
        tokenBalances.push({ symbol: sym, balance: (parseFloat(amount) / Math.pow(10, dec)).toFixed(2), contract });
      }
    }
  }
  // From TRC-20 transfers
  if (tokenBalances.length === 0 && trc20List.length > 0) {
    const syms = new Set();
    trc20List.forEach(tx => { if (tx.token_info?.symbol) syms.add(tx.token_info.symbol); });
    syms.forEach(s => tokenBalances.push({ symbol: s, balance: "consultar explorer" }));
  }

  // === Parse transactions ===
  const parsed = [];
  const counterparties = new Map();

  // TronGrid tx format
  for (const tx of txList) {
    let from, to, value, hash, date;
    if (tx.raw_data) {
      hash = tx.txID;
      date = tx.block_timestamp ? new Date(tx.block_timestamp).toISOString() : null;
      const c = tx.raw_data.contract?.[0]?.parameter?.value;
      if (c) { from = c.owner_address || ""; to = c.to_address || c.contract_address || ""; value = c.amount ? (c.amount / 1e6).toFixed(2) + " TRX" : "contract"; }
    } else {
      // Tronscan format
      hash = tx.hash; from = tx.ownerAddress; to = tx.toAddress;
      value = tx.amount ? (tx.amount / 1e6).toFixed(2) + " TRX" : "contract";
      date = tx.timestamp ? new Date(tx.timestamp).toISOString() : null;
    }
    if (from && to) {
      const dir = from === address ? "OUT" : "IN";
      parsed.push({ hash, from, to, value, date, direction: dir });
      const other = dir === "OUT" ? to : from;
      if (other !== address) {
        const e = counterparties.get(other) || { address: other, txCount: 0, lastSeen: null };
        e.txCount++; if (date && (!e.lastSeen || date > e.lastSeen)) e.lastSeen = date;
        counterparties.set(other, e);
      }
    }
  }

  // TRC-20 transfers
  for (const tx of trc20List) {
    const f = tx.from, t = tx.to;
    const sym = tx.token_info?.symbol || "TRC20";
    const dec = tx.token_info?.decimals || 6;
    const val = (parseFloat(tx.value || 0) / Math.pow(10, dec)).toFixed(2) + " " + sym;
    const date = tx.block_timestamp ? new Date(tx.block_timestamp).toISOString() : null;
    const dir = f === address ? "OUT" : "IN";
    parsed.push({ hash: tx.transaction_id, from: f, to: t, value: val, date, direction: dir, token: sym });
    const other = dir === "OUT" ? t : f;
    if (other && other !== address) {
      const e = counterparties.get(other) || { address: other, txCount: 0, lastSeen: null };
      e.txCount++; if (date && (!e.lastSeen || date > e.lastSeen)) e.lastSeen = date;
      counterparties.set(other, e);
    }
  }

  parsed.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const stableCount = trc20List.filter(tx => tx.token_info?.symbol === "USDT" || tx.token_info?.symbol === "USDC").length;

  return {
    provider, chain: "tron",
    balance, balanceRaw,
    txCount: acct.totalTransactionCount || txList.length || parsed.length,
    tokenTxCount: trc20List.length,
    stablecoinTxCount: stableCount,
    firstTransaction: acct.date_created ? new Date(acct.date_created).toISOString() : (parsed.length ? parsed[parsed.length - 1].date : null),
    lastTransaction: parsed.length ? parsed[0].date : null,
    uniqueCounterparties: counterparties.size,
    contractInteractions: txList.filter(tx => tx.raw_data?.contract?.[0]?.type !== "TransferContract").length,
    topCounterparties: [...counterparties.values()].sort((a, b) => b.txCount - a.txCount).slice(0, 10),
    tokenBalances,
    recentTransactions: parsed.slice(0, 20),
    recentTxSample: parsed.slice(0, 10).map(tx => ({ hash: tx.hash, from: tx.from, to: tx.to, value: tx.value, date: tx.date })),
  };
}

// ============================================================
// Bitcoin
// ============================================================
async function checkBlockchair(address) {
  const data = await fetchJSON("https://api.blockchair.com/bitcoin/dashboards/address/" + address + "?limit=10");
  if (!data?.data?.[address]) throw new Error("Blockchair: nao encontrado.");
  const info = data.data[address].address;
  return {
    provider: "Blockchair", chain: "bitcoin",
    balance: (info.balance / 1e8).toFixed(8) + " BTC", balanceRaw: info.balance / 1e8,
    txCount: info.transaction_count || 0, tokenTxCount: 0, stablecoinTxCount: 0,
    firstTransaction: info.first_seen_receiving || null, lastTransaction: info.last_seen_receiving || null,
    uniqueCounterparties: null, contractInteractions: 0,
    topCounterparties: [], tokenBalances: [], recentTransactions: [],
    recentTxSample: (data.data[address].transactions || []).slice(0, 5).map(h => ({ hash: h })),
  };
}

// ============================================================
// Fetch helper
// ============================================================
async function fetchJSON(url, headers, opts) {
  try {
    const options = opts || { headers: { "User-Agent": "AML-Screening/2.2", ...(headers || {}) }, signal: AbortSignal.timeout(15000) };
    if (!options.signal) options.signal = AbortSignal.timeout(15000);
    const res = await fetch(url, options);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

module.exports = { checkExplorer };
