// src/utils/update-ofac.js — Atualiza lista OFAC/SDN (endereços crypto)
// Roda: node src/utils/update-ofac.js
// Fonte: https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists

import { writeFile, mkdir } from "fs/promises";
import fetch from "node-fetch";

const SDN_CSV_URL = "https://www.treasury.gov/ofac/downloads/sdn.csv";
const SDN_ADVANCED_URL = "https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml";
const OUTPUT_FILE = "./data/sdn_list.json";

// Regex para detectar endereços crypto
const CRYPTO_PATTERNS = [
  /\b(0x[a-fA-F0-9]{40})\b/g,                     // EVM (ETH, BSC, Polygon)
  /\b(T[a-zA-HJ-NP-Z0-9]{33})\b/g,                // TRON
  /\b((1|3)[a-zA-HJ-NP-Z0-9]{25,34})\b/g,         // Bitcoin Legacy
  /\b(bc1[a-z0-9]{39,59})\b/g,                     // Bitcoin Bech32
  /\b(ltc1[a-z0-9]{39,59})\b/g,                    // Litecoin
];

async function main() {
  console.log("[OFAC] Baixando lista SDN...");

  const addresses = new Set();

  // Tenta baixar o CSV
  try {
    const res = await fetch(SDN_CSV_URL, { signal: AbortSignal.timeout(30000) });
    if (res.ok) {
      const text = await res.text();
      extractAddresses(text, addresses);
      console.log(`[OFAC] CSV processado. ${addresses.size} endereços encontrados até agora.`);
    } else {
      console.warn(`[OFAC] CSV HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[OFAC] Erro ao baixar CSV:", err.message);
  }

  // Tenta baixar o XML avançado (tem mais detalhes de digital currency)
  try {
    const res = await fetch(SDN_ADVANCED_URL, { signal: AbortSignal.timeout(60000) });
    if (res.ok) {
      const text = await res.text();
      extractAddresses(text, addresses);
      console.log(`[OFAC] XML processado. ${addresses.size} endereços encontrados no total.`);
    } else {
      console.warn(`[OFAC] XML HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[OFAC] Erro ao baixar XML:", err.message);
  }

  if (addresses.size === 0) {
    console.error("[OFAC] Nenhum endereço extraído. Verifique conectividade.");
    process.exit(1);
  }

  // Salvar
  await mkdir("./data", { recursive: true });
  const sorted = [...addresses].sort();
  await writeFile(OUTPUT_FILE, JSON.stringify(sorted, null, 2));

  console.log(`\n[OFAC] ✅ ${sorted.length} endereços salvos em ${OUTPUT_FILE}\n`);
}

function extractAddresses(text, addressSet) {
  for (const pattern of CRYPTO_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern.source, "g"));
    for (const match of matches) {
      const addr = match[1] || match[0];
      addressSet.add(addr.toLowerCase());
    }
  }
}

main().catch((err) => {
  console.error("[OFAC] Erro fatal:", err);
  process.exit(1);
});
