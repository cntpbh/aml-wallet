// src/providers/flash-detection.js — Detecção Flash USDT v2 (CommonJS)
//
// Melhorias v2:
//   1. Consulta ativa de TODOS os tokens via TronScan / Blockscout / Solscan
//   2. Verificação de holders e status VIP do contrato
//   3. Detecção de tokens com nome/símbolo imitando stablecoins
//   4. Fallback: análise passiva dos tokenBalances do explorer
//
// Flash USDT = token falso que imita USDT. Aparece na carteira mas:
//   - Vem de contrato não-oficial
//   - Tem poucos holders (< 1000)
//   - Não é verificado/VIP no explorer
//   - Não pode ser transferido nem vendido

// =============================================
// CONTRATOS OFICIAIS VERIFICADOS
// =============================================
const OFFICIAL_CONTRACTS = {
  // TRON
  "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t": { symbol: "USDT", chain: "tron", issuer: "Tether (oficial)", decimals: 6 },
  "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8": { symbol: "USDC", chain: "tron", issuer: "Circle (oficial)", decimals: 6 },
  "TMwFHYXLJaRoK54fi9RDnj6Ys7aEwN5ch9": { symbol: "USDD", chain: "tron", issuer: "TRON DAO (oficial)", decimals: 18 },
  "TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4": { symbol: "TUSD", chain: "tron", issuer: "TrueUSD (oficial)", decimals: 18 },

  // Ethereum
  "0xdAC17F958D2ee523a2206206994597C13D831ec7": { symbol: "USDT", chain: "ethereum", issuer: "Tether (oficial)", decimals: 6 },
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": { symbol: "USDC", chain: "ethereum", issuer: "Circle (oficial)", decimals: 6 },
  "0x6B175474E89094C44Da98b954EedeAC495271d0F": { symbol: "DAI", chain: "ethereum", issuer: "MakerDAO (oficial)", decimals: 18 },
  "0x4Fabb145d64652a948d72533023f6E7A623C7C53": { symbol: "BUSD", chain: "ethereum", issuer: "Paxos (oficial)", decimals: 18 },

  // BSC
  "0x55d398326f99059fF775485246999027B3197955": { symbol: "USDT", chain: "bsc", issuer: "Tether (oficial BSC)", decimals: 18 },
  "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d": { symbol: "USDC", chain: "bsc", issuer: "Circle (oficial BSC)", decimals: 18 },
  "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56": { symbol: "BUSD", chain: "bsc", issuer: "Paxos (oficial BSC)", decimals: 18 },

  // Polygon
  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F": { symbol: "USDT", chain: "polygon", issuer: "Tether (oficial Polygon)", decimals: 6 },
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174": { symbol: "USDC", chain: "polygon", issuer: "Circle (oficial Polygon)", decimals: 6 },
  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359": { symbol: "USDC", chain: "polygon", issuer: "Circle USDC Native", decimals: 6 },

  // Arbitrum
  "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9": { symbol: "USDT", chain: "arbitrum", issuer: "Tether (oficial Arbitrum)", decimals: 6 },
  "0xaf88d065e77c8cC2239327C5EDb3A432268e5831": { symbol: "USDC", chain: "arbitrum", issuer: "Circle (oficial Arbitrum)", decimals: 6 },
};

// Lookup case-insensitive
const OFFICIAL_LOOKUP = new Map();
for (const [addr, info] of Object.entries(OFFICIAL_CONTRACTS)) {
  OFFICIAL_LOOKUP.set(addr.toLowerCase(), info);
}

// Padrões que scammers imitam
function looksLikeStablecoin(name, symbol) {
  if (!name && !symbol) return false;
  const n = (name || "").toLowerCase();
  const s = (symbol || "").toLowerCase();
  return (
    s === "usdt" || s === "usdc" || s === "busd" || s === "dai" || s === "tusd" ||
    s.includes("usdt") || s.includes("tether") ||
    n.includes("usdt") || n.includes("tether") || n.includes("usd coin") ||
    n.includes("tether usd") || n.includes("tethertoken")
  );
}

// =============================================
// BLOCKSCOUT URLs (EVM — sem API key)
// =============================================
const BLOCKSCOUT = {
  ethereum: "https://eth.blockscout.com",
  bsc: "https://bsc.blockscout.com",
  polygon: "https://polygon.blockscout.com",
  arbitrum: "https://arbitrum.blockscout.com",
};

// =============================================
// DETECÇÃO PRINCIPAL
// =============================================

async function detectFlashTokens(explorerData, chain, address) {
  const result = {
    checked: true,
    flashTokensDetected: false,
    officialTokensFound: [],
    suspiciousTokens: [],
    contractVerification: null,
    findings: [],
    summary: "",
    checks: [],
  };

  // ========================================
  // FASE 1: Consulta ativa de TODOS os tokens via API
  //         (mais confiável que depender do explorerData)
  // ========================================
  let activeTokens = null;

  if (address) {
    try {
      if (chain === "tron") {
        activeTokens = await fetchTronTokens(address);
      } else if (BLOCKSCOUT[chain]) {
        activeTokens = await fetchBlockscoutTokens(chain, address);
      }
    } catch (e) {
      console.log("[FLASH] Consulta ativa falhou:", e.message);
    }
  }

  // ========================================
  // FASE 2: Analisar tokens encontrados
  // ========================================
  const tokensToAnalyze = activeTokens || buildFromExplorer(explorerData);

  if (!tokensToAnalyze || tokensToAnalyze.length === 0) {
    result.summary = "Nenhum token encontrado para verificação.";
    result.checks.push({ name: "Listagem de Tokens", status: "warn", detail: "Nenhum token na carteira" });
    return result;
  }

  for (const tok of tokensToAnalyze) {
    const contract = (tok.contract || "").toLowerCase();
    const name = tok.name || "";
    const symbol = tok.symbol || "";
    const balance = tok.balance || 0;

    const official = contract ? OFFICIAL_LOOKUP.get(contract) : null;

    if (official) {
      // Token OFICIAL verificado
      result.officialTokensFound.push({
        symbol: official.symbol,
        contract: tok.contract,
        balance: balance,
        status: "OFICIAL",
        issuer: official.issuer,
      });
      result.checks.push({ name: `${official.symbol} — Contrato Oficial`, status: "pass", detail: official.issuer });
    } else if (looksLikeStablecoin(name, symbol)) {
      // Parece stablecoin mas NÃO é contrato oficial → SUSPEITO
      result.suspiciousTokens.push({
        symbol: symbol || name,
        name: name,
        contract: tok.contract || "desconhecido",
        balance: balance,
        holders: tok.holders || null,
        status: "SUSPEITO — POSSÍVEL FLASH",
        reason: `Token "${symbol || name}" de contrato ${shortAddr(tok.contract)} NÃO é oficial. Possível Flash USDT.`,
      });
      result.flashTokensDetected = true;
      result.checks.push({
        name: `${symbol || name} — FALSO`,
        status: "fail",
        detail: `Contrato ${shortAddr(tok.contract)} não é oficial`,
      });
    }
  }

  // Nenhum token falso e nenhum oficial? Limpo
  if (!result.flashTokensDetected && result.officialTokensFound.length === 0) {
    result.checks.push({ name: "Tokens Falsos", status: "pass", detail: "Nenhum token imitando stablecoin encontrado" });
  }

  // ========================================
  // FASE 3: Verificar contrato oficial (holders, VIP)
  //         Só para TRON por enquanto (API pública)
  // ========================================
  if (chain === "tron") {
    try {
      const cv = await verifyTronContract("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
      if (cv) {
        result.contractVerification = cv;
        result.checks.push({
          name: "Verificação Tether (TronScan)",
          status: cv.isVip ? "pass" : "warn",
          detail: cv.isVip ? `Verificado — ${fmtNum(cv.holders)} holders` : "Não verificado como VIP",
        });
      }
    } catch (e) { /* silenciar */ }

    // Verificar holders dos tokens suspeitos (se tiver contrato)
    for (const sus of result.suspiciousTokens) {
      if (sus.contract && sus.contract !== "desconhecido") {
        try {
          const cv = await verifyTronContract(sus.contract);
          if (cv) {
            sus.holders = cv.holders;
            sus.isVip = cv.isVip;
            // Token real tem milhões de holders. Flash tem poucos
            if (cv.holders < 1000) {
              sus.reason += ` Apenas ${cv.holders} holders (USDT real tem milhões).`;
            }
          }
        } catch (e) { /* silenciar */ }
      }
    }
  }

  // ========================================
  // FASE 4: Gerar findings para o risk engine
  // ========================================
  if (result.flashTokensDetected) {
    const fakeList = result.suspiciousTokens.map(t => {
      const holders = t.holders ? ` (${t.holders} holders)` : "";
      return `${t.symbol} [${shortAddr(t.contract)}]${holders}`;
    }).join(", ");

    result.findings.push({
      source: "Flash Token Detection",
      severity: "CRITICAL",
      category: "flash_token",
      detail: `FLASH TOKEN DETECTADO: ${fakeList}. Contrato(s) NÃO oficial(is). Token falso — não transferível/vendável.`,
    });

    result.summary = `ALERTA: ${result.suspiciousTokens.length} token(s) falso(s) detectado(s). ` +
      `Contrato(s) não corresponde(m) ao(s) emissor(es) oficial(is). ` +
      `Possível golpe Flash USDT — NÃO aceitar como pagamento.`;
  } else if (result.officialTokensFound.length > 0) {
    result.summary = `${result.officialTokensFound.length} token(s) verificado(s) como oficial(is). Nenhum flash token detectado.`;
  } else {
    result.summary = "Nenhum token de stablecoin encontrado para verificação.";
  }

  // Warning para não-verificáveis
  const unverifiable = result.suspiciousTokens.filter(t => !t.holders);
  if (unverifiable.length > 0 && !result.flashTokensDetected) {
    result.findings.push({
      source: "Flash Token Detection",
      severity: "MEDIUM",
      category: "flash_token_warning",
      detail: `${unverifiable.length} token(s) não verificável(is). Confirmar contrato no explorer.`,
    });
  }

  return result;
}

// =============================================
// APIs DE LISTAGEM DE TOKENS
// =============================================

/**
 * TronScan — lista TODOS os TRC-20 da carteira
 * Retorna: [{ name, symbol, contract, balance, holders }]
 */
async function fetchTronTokens(address) {
  // API 1: TronScan account/tokens (lista completa)
  const res = await fetchJSON(
    `https://apilist.tronscanapi.com/api/account/tokens?address=${address}&start=0&limit=50`,
    { "Accept": "application/json" }
  );

  if (!res?.data) return null;

  return res.data
    .filter(t => t.tokenType === "trc20" || t.tokenId?.startsWith("T"))
    .map(t => ({
      name: t.tokenName || "",
      symbol: t.tokenAbbr || "",
      contract: t.tokenId || "",
      balance: parseFloat(t.balance || 0) / Math.pow(10, t.tokenDecimal || 6),
      holders: null, // será preenchido depois se suspeito
    }));
}

/**
 * Blockscout — lista TODOS os tokens ERC-20/BEP-20 da carteira
 * Funciona sem API key
 */
async function fetchBlockscoutTokens(chain, address) {
  const base = BLOCKSCOUT[chain];
  if (!base) return null;

  const res = await fetchJSON(`${base}/api/v2/addresses/${address}/tokens`, {
    "Accept": "application/json",
  });

  if (!res?.items) return null;

  return res.items.map(t => ({
    name: t.token?.name || "",
    symbol: t.token?.symbol || "",
    contract: t.token?.address || "",
    balance: parseFloat(t.value || 0) / Math.pow(10, parseInt(t.token?.decimals) || 18),
    holders: parseInt(t.token?.holders) || null,
  }));
}

/**
 * Verificar contrato TRON — holders, VIP status, total supply
 */
async function verifyTronContract(contract) {
  const res = await fetchJSON(
    `https://apilist.tronscanapi.com/api/token_trc20?contract=${contract}`,
    { "Accept": "application/json" }
  );

  if (!res?.trc20_tokens?.[0]) return null;

  const info = res.trc20_tokens[0];
  return {
    name: info.name || "",
    symbol: info.symbol || "",
    holders: info.holders_count || 0,
    totalSupply: info.total_supply_with_decimals || 0,
    isVip: !!info.vip,
    issuer: info.issuer_addr || "",
  };
}

// =============================================
// FALLBACK: Construir lista do explorerData
// =============================================
function buildFromExplorer(explorerData) {
  if (!explorerData?.tokenBalances?.length) return null;
  return explorerData.tokenBalances.map(t => ({
    name: t.symbol || "",
    symbol: t.symbol || "",
    contract: t.contract || "",
    balance: parseFloat(t.balance) || 0,
    holders: null,
  }));
}

// =============================================
// Helpers
// =============================================
async function fetchJSON(url, headers) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AML-Screening/2.3", ...(headers || {}) },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}

function shortAddr(addr) {
  if (!addr) return "???";
  if (addr.length <= 16) return addr;
  return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
}

function fmtNum(n) {
  if (!n) return "0";
  return n.toLocaleString("pt-BR");
}

module.exports = { detectFlashTokens, OFFICIAL_CONTRACTS };
