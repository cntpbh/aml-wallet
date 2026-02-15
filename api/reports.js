// api/reports.js — Report Storage
// GET with Authorization → list user reports
// POST with Authorization + body → save report
const { getUserReports, saveReport, getReport, isConfigured, getAnonClient } = require("../src/providers/supabase.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!isConfigured()) {
    return res.status(200).json({ mode: "local", reports: [], message: "Modo local." });
  }

  const userId = await resolveUser(req);
  if (!userId) return res.status(401).json({ error: "Faça login para acessar relatórios." });

  // GET — List reports or get specific one
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

  // POST — Save report
  if (req.method === "POST") {
    const data = req.body;
    if (!data?.report) return res.status(400).json({ error: "Dados do relatório não fornecidos." });

    const { report, error } = await saveReport(userId, data);
    return res.status(error ? 500 : 200).json({
      success: !error,
      report: report || null,
      error: error || undefined,
    });
  }

  return res.status(405).json({ error: "GET ou POST." });
};

async function resolveUser(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return null;
  const client = getAnonClient();
  if (!client) return null;
  const { user } = await client.getUser(token);
  return user?.id || null;
}
