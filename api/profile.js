// api/profile.js (Vercel Function)
//
// Objetivo: coletar dados consultáveis da carteira (perfil on-chain) para due diligence:
// - saldo (quando possível)
// - tokens/ativos (EVM via explorers)
// - últimas transações (resumo)
// - observações operacionais
//
// Configure chaves (opcionais) no Vercel:
// ETHERSCAN_API_KEY / BSCSCAN_API_KEY / POLYGONSCAN_API_KEY
// TRONGRID_API_KEY (opcional) — para TRON
//
// IMPORTANTE: Explorers têm limites e podem variar por endpoint.

const KEYS = {
  ethereum: process.env.ETHERSCAN_API_KEY || "",
  bsc: process.env.BSCSCAN_API_KEY || "",
  polygon: process.env.POLYGONSCAN_API_KEY || ""
};

function mapExplorer(chain) {
  if (chain === "ethereum") return { base: "https://api.etherscan.io/api", key: KEYS.ethereum };
  if (chain === "bsc") return { base: "https://api.bscscan.com/api", key: KEYS.bsc };
  if (chain === "polygon") return { base: "https://api.polygonscan.com/api", key: KEYS.polygon };
  return null;
}

async function evmTxSummary(chain, address) {
  const ex = mapExplorer(chain);
  if (!ex || !ex.key) return { enabled: false, note: "Explorer API key não configurada." };

  const url = new URL(ex.base);
  url.searchParams.set("module", "account");
  url.searchParams.set("action", "txlist");
  url.searchParams.set("address", address);
  url.searchParams.set("page", "1");
  url.searchParams.set("offset", "10");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("apikey", ex.key);

  const r = await fetch(url.toString());
  const json = await r.json().catch(() => ({}));
  if (!r.ok || json?.status === "0") {
    return { enabled: true, error: json?.message || `HTTP ${r.status}`, txs: [] };
  }

  const txs = Array.isArray(json?.result) ? json.result : [];
  const slim = txs.slice(0, 10).map(t => ({
    hash: t.hash,
    from: t.from,
    to: t.to,
    valueWei: t.value,
    timeStamp: t.timeStamp
  }));
  return { enabled: true, txs: slim };
}

async function btcProfile(address) {
  // Blockstream public API (sem chave)
  const base = "https://blockstream.info/api";
  const r = await fetch(`${base}/address/${encodeURIComponent(address)}`);
  if (!r.ok) return { enabled: true, error: `HTTP ${r.status}` };

  const j = await r.json();
  return {
    enabled: true,
    balanceSats: (j?.chain_stats?.funded_txo_sum || 0) - (j?.chain_stats?.spent_txo_sum || 0),
    txCount: j?.chain_stats?.tx_count ?? null
  };
}

async function tronProfile(address) {
  // TRON: sem chave, dá para usar tronscan public endpoints, mas variam e têm CORS/limites.
  // Aqui deixamos "modo governança": retorna instrução para ativar TRONGRID (recomendado).
  const key = process.env.TRONGRID_API_KEY || "";
  if (!key) return { enabled: false, note: "TRONGRID_API_KEY não configurada. Ative para consultar saldo/tx." };

  const r = await fetch(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}`, {
    headers: { "TRON-PRO-API-KEY": key }
  });
  if (!r.ok) return { enabled: true, error: `HTTP ${r.status}` };

  const j = await r.json();
  const acc = Array.isArray(j?.data) ? j.data[0] : null;
  return {
    enabled: true,
    balanceSun: acc?.balance ?? null,
    createTime: acc?.create_time ?? null
  };
}

export default async function handler(req, res) {
  const chain = String(req.query.chain || "").toLowerCase();
  const address = String(req.query.address || "");

  if (!chain || !address) {
    res.status(400).json({ error: "chain e address são obrigatórios." });
    return;
  }

  let profile = {};
  if (chain === "ethereum" || chain === "bsc" || chain === "polygon") {
    profile = {
      chain,
      address,
      txSummary: await evmTxSummary(chain, address),
      notes: [
        "Para tokens/FTs/NFTs, adicione endpoints do explorer (tokentx / tokenbalance / NFT transfers) conforme necessidade.",
        "Para risco on-chain avançado, conecte um provedor KYT/AML (TRM/Chainalysis/Blocksec etc.)."
      ]
    };
  } else if (chain === "bitcoin") {
    profile = { chain, address, ...(await btcProfile(address)) };
  } else if (chain === "tron") {
    profile = { chain, address, ...(await tronProfile(address)) };
  } else {
    profile = { chain, address, error: "Chain não suportada neste MVP." };
  }

  res.status(200).json({
    input: { chain, address },
    profile,
    consultables: [
      "Saldo (quando possível)",
      "Últimas transações (resumo)",
      "Contrapartes (from/to) para triagem",
      "Compatibilidade com políticas internas (KYC, invoice, contrato, TXID)"
    ],
    disclaimer: "Dados dependem de explorers/provedores. Em produção, use chaves e cache/rate-limit."
  });
}
