// api/screen.js — Vercel Serverless Function
const { screenWallet } = require("../src/risk-engine.js");

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const chain = String(req.query.chain || "").toLowerCase().trim();
    const address = String(req.query.address || "").trim();

    if (!chain || !address) {
      return res.status(400).json({ error: "Parametros 'chain' e 'address' sao obrigatorios." });
    }

    const valid = validateAddress(chain, address);
    if (!valid.ok) return res.status(400).json({ error: valid.message });

    const result = await screenWallet(chain, address);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[SCREEN ERROR]", err);
    return res.status(500).json({
      error: "Erro interno no screening.",
      detail: String(err.message || err),
    });
  }
};

function validateAddress(chain, address) {
  const evm = /^0x[a-fA-F0-9]{40}$/;
  const btc = /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/;
  const trn = /^T[a-zA-HJ-NP-Z0-9]{33}$/;

  if (["ethereum", "bsc", "polygon"].includes(chain))
    return evm.test(address) ? { ok: true } : { ok: false, message: "Endereco EVM invalido." };
  if (chain === "bitcoin")
    return btc.test(address) ? { ok: true } : { ok: false, message: "Endereco Bitcoin invalido." };
  if (chain === "tron")
    return trn.test(address) ? { ok: true } : { ok: false, message: "Endereco TRON invalido." };
  return { ok: false, message: "Rede nao suportada." };
}
