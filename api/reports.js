// api/reports.js — Report Storage
// Supports: Bearer token auth OR X-Device-ID anonymous access
const { getUserReports, saveReport, getReport, isConfigured, getAnonClient } = require("../src/providers/supabase.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Device-ID");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!isConfigured()) {
    return res.status(200).json({ mode: "local", reports: [], message: "Modo local." });
  }

  const userId = await resolveUser(req);
  if (!userId) return res.status(401).json({ error: "Informe X-Device-ID ou faça login." });

  if (req.method === "GET") {
    const reportId = req.query.id;
    if (reportId) {
      const { report, error } = await getReport(reportId);
      if (error || !report) return res.status(404).json({ error: "Relatório não encontrado." });
      return res.status(200).json({ report });
    }
    const { reports, error } = await getUserReports(userId);
    return res.status(200).json({ reports, error: error || undefined });
  }

  if (req.method === "POST") {
    const data = req.body;
    if (!data?.report) return res.status(400).json({ error: "Dados do relatório não fornecidos." });
    const { report, error } = await saveReport(userId, data);
    return res.status(error ? 500 : 200).json({ success: !error, report: report || null, error: error || undefined });
  }

  return res.status(405).json({ error: "GET ou POST." });
};

async function resolveUser(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (token) {
    const client = getAnonClient();
    if (client) {
      const { user } = await client.getUser(token);
      if (user?.id) return user.id;
    }
  }
  const deviceId = (req.headers["x-device-id"] || "").trim();
  if (deviceId && deviceId.length >= 10) return "device:" + deviceId;
  return null;
}
