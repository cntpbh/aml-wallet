// src/providers/payment-verify.js — Verificação de pagamento USDT TRC-20 (CommonJS)
// Suporta 2 pacotes: 1 USDT = 15 consultas, 10 USDT = 200 consultas
// Persiste créditos no Supabase quando configurado

const RECEIVE_WALLET = process.env.PAYMENT_WALLET || "TYFH8hMCWoXxbCdHH9kjEwxwmftk1Rc1uQ";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const PACKAGES = [
  { id: "starter", price: 1, credits: 15, label: "Starter — 15 consultas" },
  { id: "pro", price: 10, credits: 200, label: "Profissional — 200 consultas" },
];

/**
 * Gerar código de pagamento único
 * @param {string} sessionId — identificador da sessão
 * @param {string} packageId — 'starter' ou 'pro'
 * @returns {Object} payment info
 */
function generatePaymentCode(sessionId, packageId) {
  const pkg = PACKAGES.find((p) => p.id === packageId) || PACKAGES[0];

  // Centavos únicos baseados no sessionId (identifica pagamento)
  const hash = simpleHash(sessionId + Date.now().toString());
  const cents = (hash % 89) + 10; // 10-98
  const amount = pkg.price + cents / 10000;

  return {
    amount: amount.toFixed(4),
    amountDisplay: `${amount.toFixed(4)} USDT`,
    paymentCode: `PAY-${cents}`,
    wallet: RECEIVE_WALLET,
    network: "TRON (TRC-20)",
    package: pkg,
    instructions: [
      `Envie exatamente ${amount.toFixed(4)} USDT (TRC-20)`,
      `Para: ${RECEIVE_WALLET}`,
      `O valor exato identifica seu pagamento automaticamente`,
      `Créditos ativados em ~30 segundos após confirmação`,
    ],
    creditsGranted: pkg.credits,
    expiresIn: "30 minutos",
  };
}

/**
 * Verificar pagamento na blockchain
 * @param {string} expectedAmount — valor esperado
 * @param {number} maxAgeMinutes — janela de tempo
 * @returns {Object} { found, txHash, amount, from, creditsGranted }
 */
async function checkPayment(expectedAmount, maxAgeMinutes = 30) {
  const targetAmount = parseFloat(expectedAmount);
  const tolerance = 0.00005;
  const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;

  // Determine package by base price
  const basePrice = Math.floor(targetAmount);
  const pkg = PACKAGES.find((p) => p.price === basePrice) || PACKAGES[0];

  try {
    const url = `https://apilist.tronscanapi.com/api/token_trc20/transfers?toAddress=${RECEIVE_WALLET}&start=0&limit=20&contract_address=${USDT_CONTRACT}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { found: false, error: `TronScan HTTP ${res.status}` };

    const data = await res.json();
    if (!data.token_transfers?.length) return { found: false, error: "Nenhuma transferência encontrada" };

    for (const tx of data.token_transfers) {
      const txTime = tx.block_ts || 0;
      if (txTime < cutoff) continue;

      const txAmount = parseFloat(tx.quant || 0) / 1e6;
      const diff = Math.abs(txAmount - targetAmount);

      if (diff < tolerance) {
        return {
          found: true,
          txHash: tx.transaction_id,
          amount: txAmount.toFixed(4),
          from: tx.from_address,
          to: tx.to_address,
          timestamp: new Date(txTime).toISOString(),
          confirmed: tx.confirmed || tx.block > 0,
          creditsGranted: pkg.credits,
          packageId: pkg.id,
        };
      }
    }

    return { found: false, error: "Pagamento não encontrado na janela de tempo" };
  } catch (err) {
    return { found: false, error: err.message };
  }
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

module.exports = { generatePaymentCode, checkPayment, RECEIVE_WALLET, PACKAGES };
