// api/credits.js — Credits Management
// GET with Authorization → get balance
// POST { action: 'use' } → consume 1 credit
const { getCredits, useCredit, isConfigured, getAnonClient } = require("../src/providers/supabase.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!isConfigured()) {
    return res.status(200).json({ mode: "local", credits: -1, message: "Modo local — créditos no navegador." });
  }

  // Resolve user from token
  const userId = await resolveUser(req);
  if (!userId) return res.status(401).json({ error: "Faça login para gerenciar créditos." });

  // GET — Get credit balance
  if (req.method === "GET") {
    const { credits, error } = await getCredits(userId);
    return res.status(200).json({ credits, userId, error: error || undefined });
  }

  // POST — Use credit
  if (req.method === "POST") {
    const { action } = req.body || {};

    if (action === "use") {
      const result = await useCredit(userId);
      return res.status(result.ok ? 200 : 402).json({
        success: result.ok,
        remaining: result.remaining,
        error: result.error || undefined,
      });
    }

    return res.status(400).json({ error: "Action: 'use'" });
  }

  return res.status(405).json({ error: "GET ou POST." });
};

async function resolveUser(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return null;

  const client = require("../src/providers/supabase.js").getAnonClient();
  if (!client) return null;

  const { user } = await client.getUser(token);
  return user?.id || null;
}
