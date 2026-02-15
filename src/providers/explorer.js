// src/providers/explorer.js — Blockchain explorers (CommonJS, uses global fetch)

const EXPLORER_CONFIG = {
  ethereum: { url: "https://api.etherscan.io/api", key: () => process.env.ETHERSCAN_API_KEY || "", name: "Etherscan" },
  bsc: { url: "https://api.bscscan.com/api", key: () => process.env.BSCSCAN_API_KEY || "", name: "BscScan" },
  polygon: { url: "https://api.polygonscan.com/api", key: () => process.env.POLYGONSCAN_API_KEY || "", name: "PolygonScan" },
};

async function checkExplorer(chain, address) {
  if (chain === "bitcoin") return checkBlockchair(address);
  if (chain === "tron") return checkTronscan(address);
  return checkEVM(chain, address);
}

async function checkEVM(chain, address) {
  const cfg = EXPLORER_CONFIG[chain];
  if (!cfg) throw new Error(`Explorer não configurado para ${chain}`);
  const apiKey = cfg.key();
  const kp = apiKey ? `&apikey=${apiKey}` : "";
  const bp = `&address=${address}${kp}`;

  const [balRes, txRes, tokenRes] = await Promise.all([
    fetchJSON(`${cfg.url}?module=account&action=balance${bp}`),
    fetchJSON(`${cfg.url}?module=account&action=txlist${bp}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`),
    fetchJSON(`${cfg.url}?module=account&action=tokentx${bp}&page=1&offset=50&sort=desc`),
  ]);

  const balance = balRes?.result ? parseInt(balRes.result) / 1e18 : null;
  const txs = Array.isArray(txRes?.result) ? txRes.result : [];
  const tokenTxs = Array.isArray(tokenRes?.result) ? tokenRes.result : [];

  const firstTx = txs.length > 0 ? txs[txs.length - 1] : null;
  const lastTx = txs.length > 0 ? txs[0] : null;

  const counterparties = new Set();
  for (const tx of txs) {
    if (tx.from?.toLowerCase() !== address.toLowerCase()) counterparties.add(tx.from?.toLowerCase());
    if (tx.to?.toLowerCase() !== address.toLowerCase()) counterparties.add(tx.to?.toLowerCase());
  }

  const contractInt = txs.filter(tx => tx.to && tx.input && tx.input !== "0x").length;
  const stableTxs = tokenTxs.filter(tx => {
    const s = tx.tokenSymbol?.toUpperCase();
    return s === "USDT" || s === "USDC" || s === "DAI" || s === "BUSD";
  });

  const unit = chain === "bsc" ? "BNB" : chain === "polygon" ? "MATIC" : "ETH";

  return {
    provider: cfg.name, chain,
    balance: balance !== null ? `${balance.toFixed(6)} ${unit}` : "N/A",
    balanceRaw: balance,
    txCount: txs.length,
    tokenTxCount: tokenTxs.length,
    stablecoinTxCount: stableTxs.length,
    firstTransaction: firstTx?.timeStamp ? new Date(parseInt(firstTx.timeStamp) * 1000).toISOString() : null,
    lastTransaction: lastTx?.timeStamp ? new Date(parseInt(lastTx.timeStamp) * 1000).toISOString() : null,
    uniqueCounterparties: counterparties.size,
    contractInteractions: contractInt,
    recentTxSample: txs.slice(0, 10).map(tx => ({
      hash: tx.hash, from: tx.from, to: tx.to,
      value: tx.value ? `${(parseInt(tx.value) / 1e18).toFixed(6)}` : "0",
      input: tx.input,
      date: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000).toISOString() : null,
    })),
  };
}

async function checkBlockchair(address) {
  const data = await fetchJSON(`https://api.blockchair.com/bitcoin/dashboards/address/${address}?limit=10`);
  if (!data?.data?.[address]) throw new Error("Blockchair: não encontrado ou rate limited.");
  const info = data.data[address].address;
  const txs = data.data[address].transactions || [];
  return {
    provider: "Blockchair", chain: "bitcoin",
    balance: `${(info.balance / 1e8).toFixed(8)} BTC`, balanceRaw: info.balance / 1e8,
    txCount: info.transaction_count || 0, tokenTxCount: 0, stablecoinTxCount: 0,
    firstTransaction: info.first_seen_receiving || null,
    lastTransaction: info.last_seen_receiving || null,
    uniqueCounterparties: null, contractInteractions: 0,
    recentTxSample: txs.slice(0, 5).map(hash => ({ hash })),
  };
}

async function checkTronscan(address) {
  const [acct, txRes] = await Promise.all([
    fetchJSON(`https://apilist.tronscanapi.com/api/accountv2?address=${address}`),
    fetchJSON(`https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&count=true&limit=50&start=0&address=${address}`),
  ]);
  if (!acct) throw new Error("Tronscan: falha ao consultar.");
  const balance = acct.balance ? acct.balance / 1e6 : 0;
  const txList = Array.isArray(txRes?.data) ? txRes.data : [];
  const trc20 = txList.filter(tx => (tx.trigger_info || {}).contract_address === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  return {
    provider: "Tronscan", chain: "tron",
    balance: `${balance.toFixed(6)} TRX`, balanceRaw: balance,
    txCount: acct.totalTransactionCount || 0, tokenTxCount: txList.length, stablecoinTxCount: trc20.length,
    firstTransaction: acct.date_created ? new Date(acct.date_created).toISOString() : null,
    lastTransaction: txList[0]?.timestamp ? new Date(txList[0].timestamp).toISOString() : null,
    uniqueCounterparties: null, contractInteractions: 0,
    recentTxSample: txList.slice(0, 10).map(tx => ({
      hash: tx.hash, from: tx.ownerAddress, to: tx.toAddress,
      value: tx.amount ? `${tx.amount / 1e6} TRX` : "contract call",
    })),
  };
}

async function fetchJSON(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AML-Screening/2.1" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

module.exports = { checkExplorer };
