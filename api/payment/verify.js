// api/payment/verify.js — Endpoint de pagamento USDT TRC-20
// GET ?session=X&package=starter|pro → gerar código
// POST { amount } → verificar pagamento (persiste no Supabase se configurado)
const { generatePaymentCode, checkPayment, PACKAGES } = require("../../src/providers/payment-verify.js");
const supabase = require("../../src/providers/supabase.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET — Gerar código de pagamento
  if (req.method === "GET") {
    // Return packages list if no session
    if (req.query.packages === "true") {
      return res.status(200).json({ packages: PACKAGES });
    }

    const sessionId = req.query.session || Date.now().toString();
    const packageId = req.query.package || "starter";
    const payment = generatePaymentCode(sessionId, packageId);
    return res.status(200).json({ success: true, payment });
  }

  // POST — Verificar pagamento
  if (req.method === "POST") {
    const { amount } = req.body || {};
    if (!amount) return res.status(400).json({ error: "Informe o 'amount' esperado." });

    const result = await checkPayment(String(amount));

    // If payment found and Supabase configured, persist credits
    if (result.found && supabase.isConfigured()) {
      // Check duplicate
      if (result.txHash) {
        const used = await supabase.isPaymentUsed(result.txHash);
        if (used) {
          return res.status(200).json({
            success: false,
            verified: false,
            error: "Este pagamento já foi processado anteriormente.",
            txHash: result.txHash,
          });
        }
      }

      // Resolve user from auth token
      const userId = await resolveUser(req);
      if (userId) {
        await supabase.addCredits(userId, result.creditsGranted, result.txHash, parseFloat(amount));
      }
    }

    return res.status(200).json({
      success: result.found,
      verified: result.found,
      ...result,
    });
  }

  return res.status(405).json({ error: "GET ou POST apenas." });
};

async function resolveUser(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  if (!token) return null;
  const client = supabase.getAnonClient();
  if (!client) return null;
  const { user } = await client.getUser(token);
  return user?.id || null;
}
