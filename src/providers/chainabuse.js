// src/providers/chainabuse.js — Consulta base de scams Chainabuse
import fetch from "node-fetch";

/**
 * Verifica se endereço possui reports na base Chainabuse
 * Requer CHAINABUSE_API_KEY (plano gratuito disponível)
 * Docs: https://docs.chainabuse.com
 */
export async function checkChainabuse(chain, address) {
  const apiKey = process.env.CHAINABUSE_API_KEY;

  if (!apiKey) {
    return { enabled: false, hits: [], note: "CHAINABUSE_API_KEY não configurada." };
  }

  try {
    // Endpoint de screening — verifique a versão mais recente da API
    const url = new URL("https://api.chainabuse.com/v0/reports");
    url.searchParams.set("address", address);

    const res = await fetch(url.toString(), {
      headers: {
        "X-API-KEY": apiKey,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401 || res.status === 403) {
      return { enabled: true, hits: [], error: "API key inválida ou sem permissão." };
    }

    if (!res.ok) {
      return { enabled: true, hits: [], error: `HTTP ${res.status}` };
    }

    const json = await res.json();

    // O formato pode variar conforme o plano — ajuste conforme sua resposta real
    const reports = Array.isArray(json?.reports)
      ? json.reports
      : Array.isArray(json)
        ? json
        : [];

    const hits = reports.map((r) => ({
      category: r.category || r.scamType || "unknown",
      description: r.description?.substring(0, 200) || "",
      createdAt: r.createdAt || r.created_at || null,
    }));

    return { enabled: true, hits };
  } catch (err) {
    return { enabled: true, hits: [], error: err.message };
  }
}
