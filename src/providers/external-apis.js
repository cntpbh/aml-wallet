// src/providers/external-apis.js — Chainabuse + Blocksec (CommonJS)

async function checkChainabuse(chain, address) {
  const key = process.env.CHAINABUSE_API_KEY;
  if (!key) return { enabled: false, hits: [] };
  try {
    const res = await fetch(`https://api.chainabuse.com/v0/reports?address=${encodeURIComponent(address)}`, {
      headers: { "X-API-KEY": key, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { enabled: true, hits: [], error: `HTTP ${res.status}` };
    const json = await res.json();
    const reports = Array.isArray(json?.reports) ? json.reports : Array.isArray(json) ? json : [];
    return { enabled: true, hits: reports.map(r => ({ category: r.category || "unknown", description: (r.description || "").substring(0, 200) })) };
  } catch (e) { return { enabled: true, hits: [], error: e.message }; }
}

const CHAIN_MAP = { ethereum: "eth", bsc: "bsc", polygon: "polygon", bitcoin: "btc", tron: "tron" };

async function checkBlocksec(chain, address) {
  const key = process.env.BLOCKSEC_API_KEY;
  if (!key) return { enabled: false, score: null, labels: [] };
  const chainId = CHAIN_MAP[chain];
  if (!chainId) return { enabled: false, score: null, labels: [] };
  try {
    const res = await fetch("https://aml.blocksec.com/api/aml/v2/address", {
      method: "POST",
      headers: { "Content-Type": "application/json", "API-KEY": key },
      body: JSON.stringify({ chain: chainId, address }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { enabled: true, score: null, labels: [], error: `HTTP ${res.status}` };
    const json = await res.json();
    return { enabled: true, score: json?.data?.risk_score ?? null, labels: json?.data?.labels ?? [] };
  } catch (e) { return { enabled: true, score: null, labels: [], error: e.message }; }
}

module.exports = { checkChainabuse, checkBlocksec };
