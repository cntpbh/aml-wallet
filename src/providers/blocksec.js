// src/providers/blocksec.js — Consulta Risk Score via Blocksec/MetaSleuth
import fetch from "node-fetch";

// Mapeamento de chains para o formato do MetaSleuth
const CHAIN_MAP = {
  ethereum: "eth",
  bsc: "bsc",
  polygon: "polygon",
  bitcoin: "btc",
  tron: "tron",
};

/**
 * Consulta Risk Score da carteira via API MetaSleuth/Blocksec
 * Requer BLOCKSEC_API_KEY
 * Docs: https://docs.metasleuth.io/blocksec-aml-api/wallet-screening-api
 */
export async function checkBlocksec(chain, address) {
  const apiKey = process.env.BLOCKSEC_API_KEY;

  if (!apiKey) {
    return { enabled: false, score: null, labels: [], note: "BLOCKSEC_API_KEY não configurada." };
  }

  const chainId = CHAIN_MAP[chain];
  if (!chainId) {
    return { enabled: false, score: null, labels: [], note: `Chain '${chain}' não suportada pelo Blocksec.` };
  }

  try {
    const url = "https://aml.blocksec.com/api/aml/v2/address";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "API-KEY": apiKey,
      },
      body: JSON.stringify({
        chain: chainId,
        address: address,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401 || res.status === 403) {
      return { enabled: true, score: null, labels: [], error: "API key inválida." };
    }

    if (!res.ok) {
      return { enabled: true, score: null, labels: [], error: `HTTP ${res.status}` };
    }

    const json = await res.json();

    // O formato pode variar — adapte conforme a resposta real
    const score = json?.data?.risk_score ?? json?.risk_score ?? null;
    const labels = json?.data?.labels ?? json?.labels ?? [];
    const riskLevel = json?.data?.risk_level ?? json?.risk_level ?? null;

    return {
      enabled: true,
      score: typeof score === "number" ? score : null,
      labels: Array.isArray(labels) ? labels : [],
      riskLevel,
    };
  } catch (err) {
    return { enabled: true, score: null, labels: [], error: err.message };
  }
}
