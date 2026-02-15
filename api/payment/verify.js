// api/payment/verify.js — Endpoint de pagamento USDT TRC-20
const { generatePaymentCode, checkPayment } = require("../../src/providers/payment-verify.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET — Gerar código de pagamento
  if (req.method === "GET") {
    const sessionId = req.query.session || Date.now().toString();
    const payment = generatePaymentCode(sessionId);
    return res.status(200).json({ success: true, payment });
  }

  // POST — Verificar pagamento
  if (req.method === "POST") {
    const { amount } = req.body || {};
    if (!amount) return res.status(400).json({ error: "Informe o 'amount' esperado." });

    const result = await checkPayment(String(amount));
    return res.status(200).json({
      success: result.found,
      verified: result.found,
      ...result,
    });
  }

  return res.status(405).json({ error: "GET ou POST apenas." });
};
