// api/screen.js (Vercel Function)
//
// Objetivo: triagem AML básica (MVP) com fontes plugáveis.
// Configure chaves no Vercel: Settings > Environment Variables
//
// CHAINABUSE_API_KEY (opcional)
// AML_PROVIDER_API_KEY (opcional)  -> para provedores de risk score (TRM/Chainalysis/Blocksec etc.)
// AML_PROVIDER_URL (opcional)      -> endpoint do provedor contratado

const CHAINABUSE_API_KEY = process.env.CHAINABUSE_API_KEY || "";
const AML_PROVIDER_API_KEY = process.env.AML_PROVIDER_API_KEY || "";
const AML_PROVIDER_URL = process.env.AML_PROVIDER_URL || ""; // ex.: https://.../risk_score

function normalizeRisk({ chainabuseHits, providerScore }) {
  let level = "LOW";
  const reasons = [];

  if (chainabuseHits?.length) {
    level = "HIGH";
    reasons.push(`Endereço reportado em base de scams: ${chainabuseHits.length} ocorrência(s).`);
  }

  if (typeof providerScore === "number") {
    if (providerScore >= 70) {
      level = "HIGH";
      reasons.push(`Score do provedor alto (${providerScore}).`);
    } else if (providerScore >= 40 && level !== "HIGH") {
      level = "MEDIUM";
      reasons.push(`Score do provedor moderado (${providerScore}).`);
    } else {
      reasons.push(`Score do provedor baixo (${providerScore}).`);
    }
  } else {
    reasons.push("Score de provedor não consultado (não configurado).");
  }

  return { level, reasons };
}

async function screenChainabuse({ chain, address }) {
  if (!CHAINABUSE_API_KEY) return { enabled: false, hits: [] };

  // OBS: ajuste o endpoint conforme o seu plano/contrato.
  const url = new URL("https://api.chainabuse.com/v1/reports");
  url.searchParams.set("chain", chain);
  url.searchParams.set("address", address);

  const r = await fetch(url.toString(), { headers: { "X-API-KEY": CHAINABUSE_API_KEY } });
  if (!r.ok) return { enabled: true, error: `Chainabuse HTTP ${r.status}`, hits: [] };

  const json = await r.json();
  const hits = Array.isArray(json?.reports) ? json.reports : [];
  return { enabled: true, hits };
}

async function screenProvider({ chain, address }) {
  if (!AML_PROVIDER_API_KEY || !AML_PROVIDER_URL) return { enabled: false, score: null, raw: null };

  const r = await fetch(AML_PROVIDER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${AML_PROVIDER_API_KEY}`
    },
    body: JSON.stringify({ chain, address })
  });

  if (!r.ok) return { enabled: true, error: `Provider HTTP ${r.status}`, score: null, raw: null };

  const json = await r.json();
  const score = typeof json?.riskScore === "number" ? json.riskScore : (typeof json?.score === "number" ? json.score : null);
  return { enabled: true, score, raw: json };
}

export default async function handler(req, res) {
  const chain = String(req.query.chain || "").toLowerCase();
  const address = String(req.query.address || "");

  if (!chain || !address) {
    res.status(400).json({ error: "chain e address são obrigatórios." });
    return;
  }

  const [ca, prov] = await Promise.all([
    screenChainabuse({ chain, address }),
    screenProvider({ chain, address })
  ]);

  const decision = normalizeRisk({ chainabuseHits: ca.hits, providerScore: prov.score });

  res.status(200).json({
    input: { chain, address },
    sources: {
      chainabuse: { enabled: ca.enabled, error: ca.error || null, hits_sample: (ca.hits || []).slice(0, 5) },
      provider: { enabled: prov.enabled, error: prov.error || null, score: prov.score, raw: prov.raw ? "available" : null }
    },
    decision,
    recommendations: [
      "Se nível HIGH: solicitar comprovação de origem (KYC do pagador, contrato/invoice, TXID) antes de aceitar.",
      "Se nível MEDIUM: coletar evidências adicionais e monitorar a conversão/saque.",
      "Se nível LOW: manter trilha documental e registrar o TXID no dossiê."
    ],
    disclaimer: "Triagem automatizada. Pode haver falso positivo/negativo. Decisões devem considerar documentação e contexto econômico."
  });
}
