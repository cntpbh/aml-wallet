// server.js — AML Wallet Screening Server v2
// Inclui: endpoint de PDF, DeFi analysis, compliance assessment
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { spawn } from "child_process";
import { readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { screenWallet } from "./src/risk-engine.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Garantir diretório temp
const TEMP_DIR = path.join(__dirname, "data", "temp");
if (!existsSync(TEMP_DIR)) {
  await mkdir(TEMP_DIR, { recursive: true });
}

// ============================================================
// API: Screening de carteira (JSON)
// ============================================================
app.get("/api/screen", async (req, res) => {
  const chain = String(req.query.chain || "").toLowerCase().trim();
  const address = String(req.query.address || "").trim();

  if (!chain || !address) {
    return res.status(400).json({ error: "Parâmetros 'chain' e 'address' são obrigatórios." });
  }

  const valid = validateAddress(chain, address);
  if (!valid.ok) {
    return res.status(400).json({ error: valid.message });
  }

  try {
    const result = await screenWallet(chain, address);
    res.json(result);
  } catch (err) {
    console.error("[SCREEN ERROR]", err);
    res.status(500).json({ error: "Erro interno ao processar screening.", detail: err.message });
  }
});

// ============================================================
// API: Gerar PDF do relatório
// ============================================================
app.post("/api/report/pdf", express.json(), async (req, res) => {
  const data = req.body;

  if (!data || (!data.report && !data.decision)) {
    return res.status(400).json({ error: "Dados do relatório não fornecidos." });
  }

  const reportId = data.report?.id || `AML-${Date.now().toString(36)}`;
  const pdfPath = path.join(TEMP_DIR, `${reportId}.pdf`);
  const pyScript = path.join(__dirname, "src", "reports", "pdf_generator.py");

  try {
    await generatePDF(pyScript, data, pdfPath);

    const pdfBuffer = await readFile(pdfPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-aml-${reportId}.pdf"`);
    res.send(pdfBuffer);

    // Cleanup
    setTimeout(() => unlink(pdfPath).catch(() => {}), 30000);
  } catch (err) {
    console.error("[PDF ERROR]", err);
    res.status(500).json({ error: "Erro ao gerar PDF.", detail: err.message });
  }
});

// ============================================================
// API: Screening + PDF direto
// ============================================================
app.get("/api/screen/pdf", async (req, res) => {
  const chain = String(req.query.chain || "").toLowerCase().trim();
  const address = String(req.query.address || "").trim();

  if (!chain || !address) {
    return res.status(400).json({ error: "Parâmetros 'chain' e 'address' são obrigatórios." });
  }

  const valid = validateAddress(chain, address);
  if (!valid.ok) {
    return res.status(400).json({ error: valid.message });
  }

  try {
    const result = await screenWallet(chain, address);

    const reportId = result.report?.id || `AML-${Date.now().toString(36)}`;
    const pdfPath = path.join(TEMP_DIR, `${reportId}.pdf`);
    const pyScript = path.join(__dirname, "src", "reports", "pdf_generator.py");

    await generatePDF(pyScript, result, pdfPath);

    const pdfBuffer = await readFile(pdfPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-aml-${reportId}.pdf"`);
    res.send(pdfBuffer);

    setTimeout(() => unlink(pdfPath).catch(() => {}), 30000);
  } catch (err) {
    console.error("[SCREEN+PDF ERROR]", err);
    res.status(500).json({ error: "Erro ao processar screening + PDF.", detail: err.message });
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
  res.json({ status: "ok", version: "2.0.0", providers });
});

// ============================================================
// Gerar PDF via Python subprocess
// ============================================================
function generatePDF(scriptPath, data, outputPath) {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [scriptPath, outputPath], {
      cwd: __dirname,
      timeout: 30000,
    });

    let stderr = "";

    py.stdin.write(JSON.stringify(data));
    py.stdin.end();

    py.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    py.on("close", (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`Python exit ${code}: ${stderr}`));
      }
    });

    py.on("error", (err) => reject(err));
  });
}

// ============================================================
// Validação de endereço
// ============================================================
function validateAddress(chain, address) {
  const evmRegex = /^0x[a-fA-F0-9]{40}$/;
  const btcRegex = /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/;
  const tronRegex = /^T[a-zA-HJ-NP-Z0-9]{33}$/;
  const evmChains = ["ethereum", "bsc", "polygon"];

  if (evmChains.includes(chain)) {
    return evmRegex.test(address) ? { ok: true } : { ok: false, message: `Endereço EVM inválido. Esperado: 0x + 40 hex chars.` };
  }
  if (chain === "bitcoin") {
    return btcRegex.test(address) ? { ok: true } : { ok: false, message: `Endereço Bitcoin inválido.` };
  }
  if (chain === "tron") {
    return tronRegex.test(address) ? { ok: true } : { ok: false, message: `Endereço TRON inválido. Esperado: T + 33 chars.` };
  }
  return { ok: false, message: `Rede '${chain}' não suportada.` };
}

app.listen(PORT, () => {
  console.log(`\n🔍 AML Wallet Screening v2 rodando em http://localhost:${PORT}`);
  console.log(`📄 PDF endpoint: POST /api/report/pdf`);
  console.log(`📄 Screening + PDF direto: GET /api/screen/pdf?chain=...&address=...\n`);
});
