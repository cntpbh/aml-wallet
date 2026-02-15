// src/providers/ibedis-integration.js — Integração IBEDIS Token (CommonJS)
// API Docs: token.ibedis.com.br — Registro blockchain, IPFS, certificado PDF
// Endpoints públicos (sem auth) + Integration Key (sem custo/quota)

const IBEDIS_BASE = "https://token.ibedis.com.br";

/**
 * Registrar relatório AML com carimbo + certificado PDF
 * Prioridade: /api/integration/register (com API Key, sem custo)
 * Fallback 1: /api/documentos/register-with-stamp (carimba + certificado)
 * Fallback 2: /api/documentos/registrar (registro simples)
 *
 * @param {Buffer} pdfBuffer - PDF do relatório
 * @param {Object} reportData - Dados do relatório { report: {...} }
 * @returns {Object} { success, certificado, hash, verificacao_url, ipfs, files }
 */
async function registerReport(pdfBuffer, reportData) {
  const apiKey = process.env.IBEDIS_INTEGRATION_KEY || "";
  const report = reportData.report || reportData;
  const crypto = require("crypto");

  // 1. Hash SHA-256 do PDF
  const hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

  // 2. Metadados
  const titulo = `Relatório AML — ${report.id || "N/A"}`;
  const addr = report.address || report.input?.address || "N/A";
  const chain = report.network || report.input?.chain || "N/A";
  const descricao = [
    `Rede: ${chain}`,
    `Endereço: ${addr}`,
    `Risco: ${report.decision?.level || "N/A"} (${report.decision?.score || 0}/100)`,
    `Data: ${report.timestamp || new Date().toISOString()}`,
  ].join(" | ");
  const filename = `relatorio-aml-${report.id || "report"}.pdf`;
  const email = process.env.CONTACT_EMAIL || "cntpnegocios@gmail.com";

  try {
    // === Rota 1: Integration Key (sem custo, sem quota) ===
    if (apiKey) {
      const result = await callRegisterAPI(
        `${IBEDIS_BASE}/api/integration/register`,
        { "X-API-Key": apiKey },
        buildStampForm(pdfBuffer, filename, hash, titulo, email, descricao)
      );
      if (result.success) return normalizeResponse(result, hash);
      console.warn("[IBEDIS] Integration key falhou, tentando público...");
    }

    // === Rota 2: register-with-stamp (carimba PDF + gera certificado) ===
    const stampResult = await callRegisterAPI(
      `${IBEDIS_BASE}/api/documentos/register-with-stamp`,
      {},
      buildStampForm(pdfBuffer, filename, hash, titulo, email, descricao)
    );
    if (stampResult.success) return normalizeResponse(stampResult, hash);

    // === Rota 3: registro simples (hash + IPFS) ===
    const simpleResult = await callRegisterAPI(
      `${IBEDIS_BASE}/api/documentos/registrar`,
      {},
      buildSimpleForm(pdfBuffer, filename, hash, titulo, email, descricao)
    );
    if (simpleResult.success) return normalizeResponse(simpleResult, hash);

    return { success: false, error: "Nenhum endpoint respondeu com sucesso", hash };
  } catch (err) {
    console.error("[IBEDIS] Exceção:", err.message);
    return { success: false, error: err.message, hash };
  }
}

/**
 * Verificar documento na blockchain IBEDIS
 * POST /api/documents/verify — Pública, sem autenticação
 * Aceita { hash } ou { documentId }
 */
async function verifyDocument(hashOrId) {
  try {
    const isHash = /^[a-f0-9]{64}$/i.test(hashOrId);
    const payload = isHash ? { hash: hashOrId } : { documentId: hashOrId };

    const res = await fetchWithTimeout(`${IBEDIS_BASE}/api/documents/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { valid: false, error: `HTTP ${res.status}`, detail: text.substring(0, 200) };
    }

    const data = await res.json();
    return {
      valid: data.valid || false,
      status: data.status || null,
      documentTitle: data.documentTitle || null,
      finalHash: data.finalHash || null,
      originalHash: data.originalHash || null,
      blockchainTx: data.blockchainTx || null,
      createdAt: data.createdAt || null,
      signers: data.signers || [],
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Consultar certificado por código
 * GET /api/documents/certificate?code=DOC-XXXXX ou SIGN-XXXXX
 * Pública, sem autenticação
 */
async function getCertificate(code) {
  try {
    const res = await fetchWithTimeout(
      `${IBEDIS_BASE}/api/documents/certificate?code=${encodeURIComponent(code)}`
    );
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };

    const data = await res.json();
    return {
      success: data.success || false,
      certificate_code: data.certificate_code || code,
      document_title: data.document_title || null,
      ipfs_document_url: data.ipfs_document_url || null,
      created_at: data.created_at || null,
      completed_at: data.completed_at || null,
      blockchain_tx_hash: data.blockchain_tx_hash || null,
      final_hash: data.final_hash || null,
      certifiedPdfUrl: data.certifiedPdfUrl || null,
      signers: data.signers || [],
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================
// Multipart FormData builders (Node.js nativo, zero dependências)
// =============================================================

/** Build form for /api/documentos/register-with-stamp */
function buildStampForm(pdfBuffer, filename, hash, titulo, email, descricao) {
  const boundary = "----IBEDISBoundary" + Date.now();
  const parts = [];
  parts.push(field(boundary, "documentHash", hash));
  parts.push(field(boundary, "documentTitle", titulo));
  parts.push(field(boundary, "requesterName", "Propósito Participações LTDA"));
  parts.push(field(boundary, "requesterEmail", email));
  parts.push(field(boundary, "requesterCpfCnpj", process.env.COMPANY_CNPJ || ""));
  parts.push(field(boundary, "documentCategory", "compliance"));
  parts.push(field(boundary, "documentDescription", descricao));
  parts.push(fileField(boundary, "file", filename, pdfBuffer));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

/** Build form for /api/documentos/registrar */
function buildSimpleForm(pdfBuffer, filename, hash, titulo, email, descricao) {
  const boundary = "----IBEDISBoundary" + Date.now();
  const parts = [];
  parts.push(field(boundary, "hash", hash));
  parts.push(field(boundary, "titulo", titulo));
  parts.push(field(boundary, "nome", "Propósito Participações LTDA"));
  parts.push(field(boundary, "email", email));
  parts.push(field(boundary, "cpfCnpj", process.env.COMPANY_CNPJ || ""));
  parts.push(field(boundary, "categoria", "compliance"));
  parts.push(field(boundary, "descricao", descricao));
  parts.push(fileField(boundary, "file", filename, pdfBuffer));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), boundary };
}

async function callRegisterAPI(url, extraHeaders, formData) {
  const headers = {
    "Content-Type": `multipart/form-data; boundary=${formData.boundary}`,
    ...extraHeaders,
  };
  const res = await fetchWithTimeout(url, { method: "POST", headers, body: formData.body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[IBEDIS] ${url} => HTTP ${res.status}:`, text.substring(0, 200));
    return { success: false, error: `HTTP ${res.status}` };
  }
  return await res.json();
}

/** Normalize different endpoint responses to unified format */
function normalizeResponse(data, hash) {
  // register-with-stamp response
  if (data.registration) {
    const code = data.registration.certificate_code || "";
    return {
      success: true,
      certificado: code,
      hash,
      verificacao_url: data.verificacao_url || `${IBEDIS_BASE}/certificado-documento/${code}`,
      ipfs: data.ipfs || null,
      files: data.files || null,
      registro_id: data.registration.id || null,
      status: data.registration.status || "pending",
    };
  }
  // /api/documentos/registrar response
  if (data.registro) {
    const code = data.registro.certificado || "";
    return {
      success: true,
      certificado: code,
      hash,
      verificacao_url: data.verificacao_url || `${IBEDIS_BASE}/certificado-documento/${code}`,
      ipfs: data.ipfs || null,
      files: null,
      registro_id: data.registro.id || null,
      status: data.registro.status || "pending",
    };
  }
  // Generic
  return {
    success: true,
    certificado: data.certificado || data.certificate_code || null,
    hash,
    verificacao_url: data.verificacao_url || null,
    ipfs: data.ipfs || null,
    files: data.files || null,
    registro_id: data.id || null,
    status: "registered",
  };
}

// =============================================================
// Helpers
// =============================================================
function field(boundary, name, value) {
  return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
}
function fileField(boundary, name, filename, data) {
  const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`);
  return Buffer.concat([header, data]);
}
async function fetchWithTimeout(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) { clearTimeout(timer); throw err; }
}

module.exports = { registerReport, verifyDocument, getCertificate, IBEDIS_BASE };
