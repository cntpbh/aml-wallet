// src/providers/payment-verify.js — Verificação de pagamento USDT TRC-20 (CommonJS)
// Monitora a carteira de recebimento via TronScan API
// Detecta pagamentos pelo valor exato (centavos = ID do pagamento)

const RECEIVE_WALLET = process.env.PAYMENT_WALLET || "TYFH8hMCWoXxbCdHH9kjEwxwmftk1Rc1uQ";
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const PRICE_USDT = 10; // preço base
const CREDITS_PER_PAYMENT = 100;

/**
 * Gerar código de pagamento único
 * Retorna um valor como 10.0037 onde 37 é o ID
 * @param {string} sessionId — identificador da sessão (últimos 4 dígitos)
 * @returns {Object} { amount, paymentCode, wallet, instructions }
 */
function generatePaymentCode(sessionId) {
  // Gerar centavos únicos baseados no sessionId
  const hash = simpleHash(sessionId + Date.now().toString());
  const cents = (hash % 89) + 10; // 10-98 centavos (sempre 2 dígitos)
  const amount = PRICE_USDT + cents / 10000; // 10.0010 a 10.0098

  return {
    amount: amount.toFixed(4),
    amountDisplay: `${amount.toFixed(4)} USDT`,
    paymentCode: `PAY-${cents}`,
    wallet: RECEIVE_WALLET,
    network: "TRON (TRC-20)",
    instructions: [
      `Envie exatamente ${amount.toFixed(4)} USDT (TRC-20)`,
      `Para: ${RECEIVE_WALLET}`,
      `O valor exato é importante para identificar seu pagamento`,
      `Após confirmação na blockchain (~30s), seus créditos são ativados automaticamente`,
    ],
    creditsGranted: CREDITS_PER_PAYMENT,
    expiresIn: "30 minutos",
  };
}

/**
 * Verificar se um pagamento foi recebido
 * Consulta transferências TRC-20 para a carteira de recebimento
 * @param {string} expectedAmount — valor esperado (ex: "10.0037")
 * @param {number} maxAgeMinutes — janela de tempo (default: 30min)
 * @returns {Object} { found, txHash, amount, from, timestamp }
 */
async function checkPayment(expectedAmount, maxAgeMinutes = 30) {
  const targetAmount = parseFloat(expectedAmount);
  const tolerance = 0.00005; // tolerância mínima de arredondamento
  const cutoff = Date.now() - maxAgeMinutes * 60 * 1000;

  try {
    // TronScan API — transferências TRC-20 recebidas
    const url = `https://apilist.tronscanapi.com/api/token_trc20/transfers?toAddress=${RECEIVE_WALLET}&start=0&limit=20&contract_address=${USDT_CONTRACT}`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return { found: false, error: `TronScan HTTP ${res.status}` };

    const data = await res.json();
    if (!data.token_transfers?.length) return { found: false, error: "Nenhuma transferência encontrada" };

    // Procurar transferência com valor exato na janela de tempo
    for (const tx of data.token_transfers) {
      const txTime = tx.block_ts || 0;
      if (txTime < cutoff) continue; // fora da janela

      const txAmount = parseFloat(tx.quant || 0) / 1e6; // USDT = 6 decimais
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
          creditsGranted: CREDITS_PER_PAYMENT,
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

module.exports = { generatePaymentCode, checkPayment, RECEIVE_WALLET, CREDITS_PER_PAYMENT };
