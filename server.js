import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Chaves em variáveis de ambiente (NUNCA no front)
const CHAINABUSE_API_KEY = process.env.CHAINABUSE_API_KEY || "";
const BLOCKSEC_API_KEY = process.env.BLOCKSEC_API_KEY || ""; // exemplo / placeholder

function normalizeRisk({ chainabuseHits, riskScore }) {
  // Política simples (você pode sofisticar depois)
  let level = "LOW";
  const reasons = [];

  if (chainabuseHits?.length) {
    level = "HIGH";
    reasons.push(`Endereço reportado em base de scams (Chainabuse): ${chainabuseHits.length} ocorrência(s).`);
  }

  if (typeof riskScore === "number") {
    if (riskScore >= 70) {
      level = "HIGH";
      reasons.push(`Risk Score elevado (${riskScore}).`);
    } else if (riskScore >= 40 && level !== "HIGH") {
      level = "MEDIUM";
      reasons.push(`Risk Score moderado (${riskScore}).`);
    } else {
      reasons.push(`Risk Score baixo (${riskScore}).`);
    }
  } else {
    reasons.push("Risk Score não consultado (sem chave ou provedor não configurado).");
  }

  return { level, reasons };
}

async function screenChainabuse({ chain, address }) {
  if (!CHAINABUSE_API_KEY) return { enabled: false, hits: [] };

  // OBS: ajuste o endpoint conforme seu plano/contrato com o provedor.
  // A ideia é: consultar reports associados ao address/chain.
  const url = new URL("https://api.chainabuse.com/v1/reports");
  url.searchParams.set("chain", chain);
  url.searchParams.set("address", address);

  const r = await fetch(url.toString(), {
    headers: { "X-API-KEY": CHAINABUSE_API_KEY }
  });

  if (!r.ok) {
    return { enabled: true, error: `Chainabuse HTTP ${r.status}`, hits: [] };
  }

  const json = await r.json();
  const hits = Array.isArray(json?.reports) ? json.reports : [];
  return { enabled: true, hits };
}

async function screenRiskScoreProvider({ chain, address }) {
  if (!BLOCKSEC_API_KEY) return { enabled: false, score: null, details: null };

  // Exemplo conceitual — ajuste para o endpoint do seu provedor (Blocksec/MetaSleuth/TRM/Chainalysis etc.)
  const url = "https://api.metasleuth.io/aml/v1/risk_score"; // placeholder: confirme no provedor
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BLOCKSEC_API_KEY}`
    },
    body: JSON.stringify({ chain, address })
  });

  if (!r.ok) {
    return { enabled: true, error: `RiskScore HTTP ${r.status}`, score: null, details: null };
  }

  const json = await r.json();
  const score = typeof json?.riskScore === "number" ? json.riskScore : null;
  return { enabled: true, score, details: json };
}

app.get("/api/screen", async (req, res) => {
  const chain = String(req.query.chain || "").toLowerCase();
  const address = String(req.query.address || "");

  if (!chain || !address) {
    return res.status(400).json({ error: "chain e address são obrigatórios." });
  }

  const [ca, rs] = await Promise.all([
    screenChainabuse({ chain, address }),
    screenRiskScoreProvider({ chain, address })
  ]);

  const normalized = normalizeRisk({
    chainabuseHits: ca.hits,
    riskScore: rs.score
  });

  res.json({
    input: { chain, address },
    sources: {
      chainabuse: { enabled: ca.enabled, error: ca.error || null, hits_sample: (ca.hits || []).slice(0, 5) },
      riskScore: { enabled: rs.enabled, error: rs.error || null, score: rs.score, details: rs.details ? "available" : null }
    },
    decision: normalized,
    disclaimer: "Screening automatizado. Pode haver falso positivo/negativo. Recomenda-se coletar evidências adicionais (KYC do pagador, invoice/contrato, hash/txid)."
  });
});

app.use(express.static("public"));

app.listen(PORT, () => console.log(`AML MVP on http://localhost:${PORT}`));
