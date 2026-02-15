// api/auth.js — Authentication (Supabase Auth)
// POST body { action: 'register'|'login', email, password }
// GET with Authorization header → session check
const { getAnonClient, getServiceClient, ensureUserRecord, addCredits, isConfigured } = require("../src/providers/supabase.js");

const FREE_CREDITS = 1; // 1 free report on signup

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!isConfigured()) {
    return res.status(200).json({
      configured: false,
      message: "Supabase não configurado. Sistema operando em modo local (localStorage).",
    });
  }

  const client = getAnonClient();

  // GET — Check session / get user info
  if (req.method === "GET") {
    const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
    if (!token) return res.status(200).json({ authenticated: false });

    const { user, error } = await client.getUser(token);
    if (error || !user) return res.status(200).json({ authenticated: false });

    return res.status(200).json({
      authenticated: true,
      user: { id: user.id, email: user.email },
    });
  }

  // POST — Register or Login
  if (req.method === "POST") {
    const { action, email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha são obrigatórios." });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres." });
    }

    if (action === "register") {
      const { user, session, error } = await client.signUp(email, password);
      if (error) return res.status(400).json({ error: String(error) });

      // Create user record + free credits
      const userId = user?.id || user?.identities?.[0]?.user_id;
      if (userId) {
        await ensureUserRecord(userId, email);
        await addCredits(userId, FREE_CREDITS, null, 0);
      }

      return res.status(200).json({
        success: true,
        message: "Conta criada! Verifique seu email se necessário.",
        user: { id: userId, email },
        session: session || null,
        freeCredits: FREE_CREDITS,
      });
    }

    if (action === "login") {
      const { user, session, error } = await client.signIn(email, password);
      if (error) return res.status(401).json({ error: String(error) });

      if (user?.id) await ensureUserRecord(user.id, email);

      return res.status(200).json({
        success: true,
        user: { id: user.id, email: user.email },
        session,
      });
    }

    return res.status(400).json({ error: "Action deve ser 'register' ou 'login'." });
  }

  return res.status(405).json({ error: "GET ou POST." });
};
