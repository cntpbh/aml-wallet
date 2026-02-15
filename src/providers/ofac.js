// src/providers/ofac.js — Verificação contra lista de sanções OFAC/SDN
import { readFile } from "fs/promises";
import { existsSync } from "fs";

const SDN_FILE = "./data/sdn_list.json";

// Lista de endereços crypto sancionados conhecidos (fallback hardcoded)
// Fonte: https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists
const KNOWN_SANCTIONED = new Set([
  // Tornado Cash (sancionado pelo OFAC em agosto 2022)
  "0x8589427373d6d84e98730d7795d8f6f8731fda16",
  "0x722122df12d4e14e13ac3b6895a86e84145b6967",
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b",
  "0xd96f2b1cf787cf7db4f5946fa12b187a39064b15",
  "0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfbfa9",
  "0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3",
  "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf",
  "0xa160cdab225685da1d56aa342ad8841c3b53f291",
  "0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144",
  "0xf60dd140cff0706bae9cd734ac3683f21623b175",
  "0x22aaa7720ddd5388a3c0a3333430953c68f1849b",
  "0xba214c1c1928a32bffe790263e38b4af9bfcd659",
  "0xb1c8094b234dce6e03f10a5b673c1d8c69739a00",
  "0x527653ea119f3e6a1f5bd18fbf4714081d7b31ce",
  "0x58e8dcc13be9780fc42e8723d8ead4cf46943df2",
  "0xd691f27f38b395864ea86cfc7253969b409c362d",
  "0xaeaac358560e11f52454d997aaff2c5731b6f8a6",
  "0x1356c899d8c9467c7f71c195612f8a395abf2f0a",
  "0xa60c772958a3ed56c1f15dd055ba37ac8e523a0d",
  "0x169ad27a470d064dede56a2d3ff727986b15d52b",
  "0x0836222f2b2b24a3f36f98668ed8f0b38d1a872f",
  "0x178169b423a011fff22b9e3f3abea13a5b3bc24e",
  "0x610b717796ad172b316836ac95a2ffad065ceab4",
  "0xbb93e510bbcd0b7beb5a853875f9ec60275cf498",
  // Blender.io
  "bc1qmfu34w2jsz867kv3nef8algrds5xhukgpvlk3q",
  // Garantex
  "0x5f6c97c6ad7bdd0ae7e0dd4ca33a4ed3fdabd4d7",
  // Sinbad.io mixer addresses
  "bc1ql7v2075zt6mccucefezhze9m8dpsh7g4xqjj9g",
]);

let sdnAddresses = null;

/**
 * Carrega a lista SDN de arquivo JSON (se existir)
 */
async function loadSDNList() {
  if (sdnAddresses) return sdnAddresses;

  sdnAddresses = new Set();

  if (existsSync(SDN_FILE)) {
    try {
      const raw = await readFile(SDN_FILE, "utf-8");
      const list = JSON.parse(raw);
      for (const addr of list) {
        sdnAddresses.add(addr.toLowerCase());
      }
      console.log(`[OFAC] Lista SDN carregada: ${sdnAddresses.size} endereços`);
    } catch (err) {
      console.warn("[OFAC] Erro ao carregar SDN list:", err.message);
    }
  } else {
    console.warn("[OFAC] Arquivo sdn_list.json não encontrado. Usando lista hardcoded.");
  }

  // Merge com hardcoded
  for (const addr of KNOWN_SANCTIONED) {
    sdnAddresses.add(addr.toLowerCase());
  }

  return sdnAddresses;
}

/**
 * Verifica se endereço está na lista OFAC/SDN
 */
export async function checkOFAC(address) {
  const list = await loadSDNList();
  const normalized = address.toLowerCase();
  const match = list.has(normalized);

  return {
    match,
    details: match
      ? "Endereço encontrado na lista OFAC/SDN (Specially Designated Nationals)."
      : null,
  };
}
