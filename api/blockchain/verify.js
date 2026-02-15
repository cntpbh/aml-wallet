// api/blockchain/verify.js — Verificar relatório AML na blockchain IBEDIS Token
// Endpoint público — sem autenticação
// Aceita hash SHA-256 (POST) ou código de certificado (GET)
const { verifyDocument, getCertificate } = require("../../src/providers/ibedis-integration.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET — verificar por código de certificado (DOC-XXXXX ou SIGN-XXXXX)
  if (req.method === "GET") {
    const code = req.query.code;
    if (!code) return res.status(400).json({ error: "Informe '?code=DOC-XXXXXXXX-XXXX'" });

    const cert = await getCertificate(code);
    if (!cert || !cert.success) {
      return res.status(404).json({ valid: false, error: "Certificado não encontrado." });
    }

    return res.status(200).json({
      valid: true,
      certificate: {
        code: cert.certificate_code,
        title: cert.document_title,
        ipfs_url: cert.ipfs_document_url,
        created_at: cert.created_at,
        completed_at: cert.completed_at,
        blockchain_tx: cert.blockchain_tx_hash,
        hash: cert.final_hash,
        certified_pdf: cert.certifiedPdfUrl,
        signers: cert.signers,
      },
    });
  }

  // POST — verificar por hash SHA-256 ou documentId
  if (req.method === "POST") {
    const { hash, documentId } = req.body || {};
    const query = hash || documentId;
    if (!query) return res.status(400).json({ error: "Informe 'hash' (SHA-256) ou 'documentId'." });

    const result = await verifyDocument(query);

    return res.status(200).json({
      valid: result.valid,
      document: result.valid
        ? {
            status: result.status,
            title: result.documentTitle,
            hash: result.finalHash || result.originalHash,
            blockchain_tx: result.blockchainTx,
            created_at: result.createdAt,
            signers: result.signers,
          }
        : null,
      error: result.valid ? null : result.error || "Documento não encontrado na blockchain.",
    });
  }

  return res.status(405).json({ error: "GET ou POST." });
};
