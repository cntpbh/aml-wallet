// server.js — AML Wallet Screening Server
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { screenWallet } from "./src/risk-engine.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ============================================================
// API: Screening de carteira
// ============================================================
app.get("/api/screen", async (req, res) => {
  const chain = String(req.query.chain || "").toLowerCase().trim();
  const address = String(req.query.address || "").trim();

  if (!chain || !address) {
    return res.status(400).json({
      error: "Parâmetros 'chain' e 'address' são obrigatórios.",
    });
  }

  // Validação básica de formato
  const valid = validateAddress(chain, address);
  if (!valid.ok) {
    return res.status(400).json({ error: valid.message });
  }

  try {
    const report = await screenWallet(chain, address);
    res.json(report);
  } catch (err) {
    console.error("[SCREEN ERROR]", err);
    res.status(500).json({
      error: "Erro interno ao processar screening.",
      detail: err.message,
    });
  }
});

// ============================================================
// API: Health check
// ============================================================
app.get("/api/health", (req, res) => {
  const providers = {
    etherscan: !!process.env.ETHERSCAN_API_KEY,
    bscscan: !!process.env.BSCSCAN_API_KEY,
    polygonscan: !!process.env.POLYGONSCAN_API_KEY,
    chainabuse: !!process.env.CHAINABUSE_API_KEY,
    blocksec: !!process.env.BLOCKSEC_API_KEY,
  };
  res.json({ status: "ok", providers });
});

// ============================================================
// Validação de endereço
// ============================================================
function validateAddress(chain, address) {
  const evmRegex = /^0x[a-fA-F0-9]{40}$/;
  const btcRegex = /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/;
  const tronRegex = /^T[a-zA-HJ-NP-Z0-9]{33}$/;

  const evmChains = ["ethereum", "bsc", "polygon"];

  if (evmChains.includes(chain)) {
    return evmRegex.test(address)
      ? { ok: true }
      : { ok: false, message: `Endereço EVM inválido. Esperado: 0x + 40 hex chars.` };
  }
  if (chain === "bitcoin") {
    return btcRegex.test(address)
      ? { ok: true }
      : { ok: false, message: `Endereço Bitcoin inválido.` };
  }
  if (chain === "tron") {
    return tronRegex.test(address)
      ? { ok: true }
      : { ok: false, message: `Endereço TRON inválido. Esperado: T + 33 chars.` };
  }

  return { ok: false, message: `Rede '${chain}' não suportada. Use: ethereum, bsc, polygon, bitcoin, tron.` };
}

app.listen(PORT, () => {
  console.log(`\n🔍 AML Wallet Screening rodando em http://localhost:${PORT}\n`);
});
