// src/providers/explorer.js — Consulta blockchain explorers (free tier)
import fetch from "node-fetch";

const EXPLORER_CONFIG = {
  ethereum: {
    url: "https://api.etherscan.io/api",
    key: () => process.env.ETHERSCAN_API_KEY || "",
    name: "Etherscan",
  },
  bsc: {
    url: "https://api.bscscan.com/api",
    key: () => process.env.BSCSCAN_API_KEY || "",
    name: "BscScan",
  },
  polygon: {
    url: "https://api.polygonscan.com/api",
    key: () => process.env.POLYGONSCAN_API_KEY || "",
    name: "PolygonScan",
  },
};

/**
 * Consulta dados on-chain via exploradores de blockchain
 */
export async function checkExplorer(chain, address) {
  if (chain === "bitcoin") {
    return checkBlockchair(address);
  }
  if (chain === "tron") {
    return checkTronscan(address);
  }

  // EVM chains (Ethereum, BSC, Polygon)
  return checkEVMExplorer(chain, address);
}

// ============================================================
// EVM Chains (Etherscan / BscScan / PolygonScan)
// ============================================================
async function checkEVMExplorer(chain, address) {
  const config = EXPLORER_CONFIG[chain];
  if (!config) throw new Error(`Explorer não configurado para ${chain}`);

  const apiKey = config.key();
  if (!apiKey) {
    console.warn(`[EXPLORER] ${config.name}: API key não configurada. Usando sem key (rate limited).`);
  }

  const baseParams = `&address=${address}${apiKey ? `&apikey=${apiKey}` : ""}`;

  // Consultas paralelas
  const [balRes, txRes, tokenRes] = await Promise.all([
    fetchJSON(`${config.url}?module=account&action=balance${baseParams}`),
    fetchJSON(`${config.url}?module=account&action=txlist${baseParams}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc`),
    fetchJSON(`${config.url}?module=account&action=tokentx${baseParams}&page=1&offset=50&sort=desc`),
  ]);

  const balance = balRes?.result ? parseInt(balRes.result) / 1e18 : null;
  const transactions = Array.isArray(txRes?.result) ? txRes.result : [];
  const tokenTransfers = Array.isArray(tokenRes?.result) ? tokenRes.result : [];

  // Primeira transação = idade da carteira
  const firstTx = transactions.length > 0
    ? transactions[transactions.length - 1]
    : null;
  const firstTxDate = firstTx?.timeStamp
    ? new Date(parseInt(firstTx.timeStamp) * 1000).toISOString()
    : null;

  // Última transação
  const lastTx = transactions.length > 0 ? transactions[0] : null;
  const lastTxDate = lastTx?.timeStamp
    ? new Date(parseInt(lastTx.timeStamp) * 1000).toISOString()
    : null;

  // Contagem de endereços únicos com quem interagiu
  const uniqueCounterparties = new Set();
  for (const tx of transactions) {
    if (tx.from?.toLowerCase() !== address.toLowerCase()) uniqueCounterparties.add(tx.from?.toLowerCase());
    if (tx.to?.toLowerCase() !== address.toLowerCase()) uniqueCounterparties.add(tx.to?.toLowerCase());
  }

  // Detectar interações com contratos
  const contractInteractions = transactions.filter((tx) => tx.to && tx.input && tx.input !== "0x").length;

  // Tokens USDT/USDC movimentados
  const stablecoinTransfers = tokenTransfers.filter((tx) => {
    const symbol = tx.tokenSymbol?.toUpperCase();
    return symbol === "USDT" || symbol === "USDC" || symbol === "DAI" || symbol === "BUSD";
  });

  return {
    provider: config.name,
    chain,
    balance: balance !== null ? `${balance.toFixed(6)} ${chain === "bsc" ? "BNB" : chain === "polygon" ? "MATIC" : "ETH"}` : "N/A",
    balanceRaw: balance,
    txCount: transactions.length,
    tokenTxCount: tokenTransfers.length,
    stablecoinTxCount: stablecoinTransfers.length,
    firstTransaction: firstTxDate,
    lastTransaction: lastTxDate,
    uniqueCounterparties: uniqueCounterparties.size,
    contractInteractions,
    recentTxSample: transactions.slice(0, 5).map(summarizeTx),
  };
}

// ============================================================
// Bitcoin (Blockchair — sem key necessária para consultas básicas)
// ============================================================
async function checkBlockchair(address) {
  const url = `https://api.blockchair.com/bitcoin/dashboards/address/${address}?limit=10`;
  const data = await fetchJSON(url);

  if (!data?.data?.[address]) {
    throw new Error("Blockchair: endereço não encontrado ou rate limited.");
  }

  const info = data.data[address].address;
  const txs = data.data[address].transactions || [];

  return {
    provider: "Blockchair",
    chain: "bitcoin",
    balance: `${(info.balance / 1e8).toFixed(8)} BTC`,
    balanceRaw: info.balance / 1e8,
    txCount: info.transaction_count || 0,
    tokenTxCount: 0,
    stablecoinTxCount: 0,
    firstTransaction: info.first_seen_receiving || null,
    lastTransaction: info.last_seen_receiving || null,
    totalReceived: `${(info.received / 1e8).toFixed(8)} BTC`,
    totalSent: `${(info.spent / 1e8).toFixed(8)} BTC`,
    uniqueCounterparties: null,
    contractInteractions: 0,
    recentTxSample: txs.slice(0, 5).map((hash) => ({ hash })),
  };
}

// ============================================================
// TRON (Tronscan API — gratuita)
// ============================================================
async function checkTronscan(address) {
  const [acctRes, txRes] = await Promise.all([
    fetchJSON(`https://apilist.tronscanapi.com/api/accountv2?address=${address}`),
    fetchJSON(`https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&count=true&limit=50&start=0&address=${address}`),
  ]);

  if (!acctRes) throw new Error("Tronscan: falha ao consultar conta.");

  const balance = acctRes.balance ? acctRes.balance / 1e6 : 0;
  const transactions = acctRes.totalTransactionCount || 0;
  const created = acctRes.date_created
    ? new Date(acctRes.date_created).toISOString()
    : null;

  // Detectar transfers de USDT-TRC20
  const txList = Array.isArray(txRes?.data) ? txRes.data : [];
  const trc20Txs = txList.filter((tx) => {
    const info = tx.trigger_info || {};
    return info.contract_address === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT-TRC20
  });

  return {
    provider: "Tronscan",
    chain: "tron",
    balance: `${balance.toFixed(6)} TRX`,
    balanceRaw: balance,
    txCount: transactions,
    tokenTxCount: txList.length,
    stablecoinTxCount: trc20Txs.length,
    firstTransaction: created,
    lastTransaction: txList[0]?.timestamp
      ? new Date(txList[0].timestamp).toISOString()
      : null,
    uniqueCounterparties: null,
    contractInteractions: 0,
    recentTxSample: txList.slice(0, 5).map((tx) => ({
      hash: tx.hash,
      from: tx.ownerAddress,
      to: tx.toAddress,
      value: tx.amount ? `${tx.amount / 1e6} TRX` : "contract call",
    })),
  };
}

// ============================================================
// Helpers
// ============================================================
async function fetchJSON(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AML-Screening-MVP/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`[FETCH] HTTP ${res.status} para ${url.substring(0, 80)}...`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[FETCH] Erro: ${err.message} para ${url.substring(0, 80)}...`);
    return null;
  }
}

function summarizeTx(tx) {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value ? `${(parseInt(tx.value) / 1e18).toFixed(6)}` : "0",
    date: tx.timeStamp ? new Date(parseInt(tx.timeStamp) * 1000).toISOString() : null,
  };
}
