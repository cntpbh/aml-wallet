// api/blockchain/register.js — Registrar relatório AML na blockchain IBEDIS Token
// Gera o mesmo PDF do relatório, calcula hash, registra via API IBEDIS
const { registerReport } = require("../../src/providers/ibedis-integration.js");
const { generatePDF } = require("../report/pdf.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const data = req.body;
  if (!data?.report) return res.status(400).json({ error: "Dados do relatório não fornecidos." });

  try {
    // 1. Gerar o mesmo PDF completo do relatório (mesma função do /api/report/pdf)
    const pdfBuffer = await generatePDF(data);

    // 2. Registrar na blockchain via IBEDIS Token
    //    Tenta: integration/register → register-with-stamp → registrar
    const result = await registerReport(pdfBuffer, data);

    return res.status(200).json({
      success: result.success,
      blockchain: {
        certificado: result.certificado,
        hash: result.hash,
        verificacao_url: result.verificacao_url,
        ipfs: result.ipfs,
        files: result.files, // { original_url, stamped_url, certificate_url }
        registro_id: result.registro_id,
        status: result.status,
      },
      error: result.error || null,
    });
  } catch (err) {
    console.error("[BLOCKCHAIN REGISTER ERROR]", err);
    return res.status(500).json({ error: "Erro ao registrar.", detail: err.message });
  }
};
