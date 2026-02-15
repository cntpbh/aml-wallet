// src/providers/flash-detection.js — Detecção de USDT/USDC Flash (Fake Tokens)
//
// "Flash USDT" são tokens falsos que imitam o USDT real.
// Parecem legítimos na carteira por minutos/horas, mas:
//   - Vêm de contratos falsos (não é o contrato oficial do Tether)
//   - Não têm liquidez — impossível trocar ou transferir
//   - Desaparecem após tempo ou falham ao tentar enviar
//
// Detecção: comparar o contract address de cada token TRC-20/ERC-20
// recebido contra os contratos oficiais verificados.

// === CONTRATOS OFICIAIS VERIFICADOS ===
const OFFICIAL_STABLECOINS = {
  // TRON
  "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t": { symbol: "USDT", chain: "tron", issuer: "Tether (oficial)" },
  "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8": { symbol: "USDC", chain: "tron", issuer: "Circle (oficial)" },
  "TMwFHYXLJaRoK54fi9RDnj6Ys7aEwN5ch9": { symbol: "USDD", chain: "tron", issuer: "TRON DAO (oficial)" },
  "TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4": { symbol: "TUSD", chain: "tron", issuer: "TrueUSD (oficial)" },

  // Ethereum
  "0xdAC17F958D2ee523a2206206994597C13D831ec7": { symbol: "USDT", chain: "ethereum", issuer: "Tether (oficial)" },
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": { symbol: "USDC", chain: "ethereum", issuer: "Circle (oficial)" },
  "0x6B175474E89094C44Da98b954EedeAC495271d0F": { symbol: "DAI", chain: "ethereum", issuer: "MakerDAO (oficial)" },
  "0x4Fabb145d64652a948d72533023f6E7A623C7C53": { symbol: "BUSD", chain: "ethereum", issuer: "Paxos (oficial)" },

  // BSC
  "0x55d398326f99059fF775485246999027B3197955": { symbol: "USDT", chain: "bsc", issuer: "Tether (oficial BSC)" },
  "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d": { symbol: "USDC", chain: "bsc", issuer: "Circle (oficial BSC)" },
  "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56": { symbol: "BUSD", chain: "bsc", issuer: "Paxos (oficial BSC)" },

  // Polygon
  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": { symbol: "USDT", chain: "polygon", issuer: "Tether (oficial Polygon)" },
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": { symbol: "USDC", chain: "polygon", issuer: "Circle (oficial Polygon)" },
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": { symbol: "USDC", chain: "polygon", issuer: "Circle USDC Native (oficial)" },
};

// Normalizar para lookup case-insensitive
const OFFICIAL_LOOKUP = new Map();
for (const [addr, info] of Object.entries(OFFICIAL_STABLECOINS)) {
  OFFICIAL_LOOKUP.set(addr.toLowerCase(), info);
}

// Símbolos que scammers imitam com frequência
const IMITATED_SYMBOLS = new Set([
  "USDT", "USDC", "BUSD", "DAI", "TUSD", "USDD", "USDJ", "USDP",
  "Tether", "USD Tether", "TetherUSD", "USDT.e", "USDT.b",
]);

/**
 * Analisa transações e saldos de tokens para detectar Flash USDT
 * @param {object} explorerData - dados do explorer (balance, tokenBalances, recentTransactions)
 * @param {string} chain - rede (tron, ethereum, bsc, polygon)
 * @returns {object} resultado da análise flash
 */
function detectFlashTokens(explorerData, chain) {
  const result = {
    checked: true,
    flashTokensDetected: false,
    officialTokensFound: [],
    suspiciousTokens: [],
    findings: [],
    summary: "",
  };

  if (!explorerData) {
    result.checked = false;
    result.summary = "Dados do explorer indisponíveis para verificação de tokens flash.";
    return result;
  }

  // === 1. Verificar saldos de tokens ===
  if (explorerData.tokenBalances?.length) {
    for (const tok of explorerData.tokenBalances) {
      const contract = (tok.contract || "").toLowerCase();
      const symbol = (tok.symbol || "").toUpperCase().trim();

      // Tem contrato? Verificar se é oficial
      if (contract) {
        const official = OFFICIAL_LOOKUP.get(contract);
        if (official) {
          result.officialTokensFound.push({
            symbol: official.symbol,
            contract: tok.contract,
            balance: tok.balance,
            status: "OFICIAL",
            issuer: official.issuer,
          });
        } else if (isImitatedSymbol(symbol)) {
          // Contrato NÃO está na lista oficial, mas usa símbolo de stablecoin
          result.suspiciousTokens.push({
            symbol: tok.symbol,
            contract: tok.contract,
            balance: tok.balance,
            status: "SUSPEITO — POSSÍVEL FLASH",
            reason: `Token "${tok.symbol}" vem de contrato ${shortAddr(tok.contract)} que NÃO é o contrato oficial.`,
          });
          result.flashTokensDetected = true;
        }
      } else if (isImitatedSymbol(symbol)) {
        // Sem contrato identificado mas símbolo suspeito
        result.suspiciousTokens.push({
          symbol: tok.symbol,
          balance: tok.balance,
          status: "NÃO VERIFICÁVEL",
          reason: `Token "${tok.symbol}" sem endereço de contrato verificável.`,
        });
      }
    }
  }

  // === 2. Verificar transações recentes de tokens ===
  if (explorerData.recentTransactions?.length) {
    for (const tx of explorerData.recentTransactions) {
      if (!tx.token) continue; // Só analisar transferências de token

      const symbol = (tx.token || "").toUpperCase().trim();
      if (!isImitatedSymbol(symbol)) continue;

      // Verificar se veio do contrato oficial
      // Na TRON, o "to" de uma TRC-20 transfer é o destinatário, não o contrato
      // O contrato geralmente está em tx.contractAddress ou inferido pelo token
      const contractAddr = (tx.contractAddress || tx.to || "").toLowerCase();

      // Se a tx tem campo token mas o endereço não bate com oficial
      // Isso é mais difícil de detectar só com tx data, mas podemos verificar
      // patterns como:
      // - Valor muito grande (>100k USDT) de endereço desconhecido
      // - Primeira transação recebida é um valor alto de stablecoin
      if (tx.direction === "IN" && symbol === "USDT" || symbol === "USDC") {
        const amount = parseFloat(tx.value) || 0;
        if (amount > 50000) {
          // Grande recebimento — precisa de verificação extra
          const isOfficialContract = checkOfficialContract(contractAddr, chain, symbol);
          if (!isOfficialContract) {
            result.suspiciousTokens.push({
              symbol: tx.token,
              hash: tx.hash,
              value: tx.value,
              from: tx.from,
              status: "REQUER VERIFICAÇÃO",
              reason: `Recebimento grande de ${tx.value} — verificar se é do contrato oficial.`,
            });
          }
        }
      }
    }
  }

  // === 3. Gerar findings ===
  if (result.flashTokensDetected) {
    const fakeList = result.suspiciousTokens
      .filter(t => t.status.includes("FLASH"))
      .map(t => `${t.symbol} (${shortAddr(t.contract)})`)
      .join(", ");

    result.findings.push({
      source: "Flash Token Detection",
      severity: "CRITICAL",
      category: "flash_token",
      detail: `FLASH TOKEN DETECTADO: ${fakeList}. Token(s) de contrato(s) NÃO oficial(is). Não transferível/vendável.`,
    });

    result.summary = `ALERTA: ${result.suspiciousTokens.length} token(s) suspeito(s) detectado(s). ` +
      `Contrato(s) não corresponde(m) ao(s) emissor(es) oficial(is). ` +
      `Possível golpe Flash USDT — NÃO aceitar como pagamento.`;
  } else if (result.officialTokensFound.length > 0) {
    result.summary = `${result.officialTokensFound.length} token(s) verificado(s) como oficial(is). Nenhum flash token detectado.`;
  } else {
    result.summary = "Nenhum token de stablecoin encontrado para verificação.";
  }

  // Warning for suspicious (not confirmed flash)
  const unverifiable = result.suspiciousTokens.filter(t => t.status === "NÃO VERIFICÁVEL" || t.status === "REQUER VERIFICAÇÃO");
  if (unverifiable.length > 0 && !result.flashTokensDetected) {
    result.findings.push({
      source: "Flash Token Detection",
      severity: "MEDIUM",
      category: "flash_token_warning",
      detail: `${unverifiable.length} token(s) não verificável(is). Recomenda-se confirmar o contrato no explorer.`,
    });
  }

  return result;
}

// === Helpers ===

function isImitatedSymbol(symbol) {
  if (!symbol) return false;
  const upper = symbol.toUpperCase().trim();
  if (IMITATED_SYMBOLS.has(upper)) return true;
  // Variações comuns de scam
  if (upper.includes("USDT") || upper.includes("TETHER")) return true;
  if (upper.includes("USDC") || upper.includes("USD COIN")) return true;
  return false;
}

function checkOfficialContract(addr, chain, symbol) {
  if (!addr) return false;
  const info = OFFICIAL_LOOKUP.get(addr.toLowerCase());
  if (!info) return false;
  return info.chain === chain && info.symbol === symbol.toUpperCase();
}

function shortAddr(addr) {
  if (!addr) return "???";
  if (addr.length <= 16) return addr;
  return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
}

module.exports = { detectFlashTokens, OFFICIAL_STABLECOINS };
