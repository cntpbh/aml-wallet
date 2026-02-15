// api/credits.js — Credit Management
// Supports: Bearer token auth OR X-Device-ID anonymous access
const { getCredits, useCredit, isConfigured, getAnonClient } = require("../src/providers/supabase.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Device-ID");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!isConfigured()) return res.status(200).json({ credits: -1, mode: "local" });

  const userId = await resolveUser(req);
  if (!userId) return res.status(401).json({ error: "Informe X-Device-ID ou faça login." });

  if (req.method === "GET") {
    const { credits, error } = await getCredits(userId);
    return res.status(200).json({ credits, error: error || undefined });
  }

  if (req.method === "POST") {
    const { action } = req.body || {};
    if (action === "use") {
      const { ok, remaining, error } = await useCredit(userId);
      return res.status(200).json({ ok, remaining, error: error || undefined });
    }
    return res.status(400).json({ error: "action required" });
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
