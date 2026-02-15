// api/report/pdf.js — Gerar PDF de relatório AML (PDFKit, Vercel Serverless)
const PDFDocument = require("pdfkit");

// Colors
const C = {
  dark: "#0f172a", accent: "#0891b2", green: "#059669", yellow: "#d97706",
  red: "#dc2626", critical: "#991b1b", text: "#1e293b", muted: "#64748b",
  lightRed: "#fef2f2", lightYellow: "#fffbeb", lightGreen: "#ecfdf5", lightBlue: "#ecfeff",
  border: "#e2e8f0", bg: "#f8fafc",
};

const RISK_COLOR = { LOW: C.green, MEDIUM: C.yellow, HIGH: C.red, CRITICAL: C.critical };
const RISK_BG = { LOW: C.lightGreen, MEDIUM: C.lightYellow, HIGH: C.lightRed, CRITICAL: C.lightRed };

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const data = req.body;
  if (!data?.report) return res.status(400).json({ error: "Dados do relatório não fornecidos." });

  try {
    const pdfBuffer = await generatePDF(data);
    const rid = data.report.id || "AML-REPORT";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-aml-${rid}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("[PDF ERROR]", err);
    res.status(500).json({ error: "Erro ao gerar PDF.", detail: err.message });
  }
};

function generatePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margins: { top: 70, bottom: 60, left: 50, right: 50 } });
      const buffers = [];
      doc.on("data", (b) => buffers.push(b));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const r = data.report;
      const c = data.compliance || {};
      const W = 495; // usable width

      // ========== HEADER ==========
      drawHeader(doc, r);

      // ========== RISK SUMMARY ==========
      drawRiskSummary(doc, r.decision, W);

      // ========== FINDINGS ==========
      drawSection(doc, "1. INDICADORES DE RISCO DETECTADOS", W);
      if (!r.findings?.length) {
        doc.fontSize(10).fillColor(C.green).text("Nenhum indicador de risco detectado.", { align: "center" });
      } else {
        for (const f of r.findings) {
          checkPage(doc, 50);
          const sc = RISK_COLOR[f.severity] || C.text;
          doc.fontSize(8).fillColor(sc).font("Helvetica-Bold").text(`[${f.severity}] `, { continued: true });
          doc.font("Helvetica-Bold").fillColor(C.text).text(f.source + ": ", { continued: true });
          doc.font("Helvetica").fillColor(C.muted).text(f.detail);
          doc.moveDown(0.3);
        }
      }

      // ========== DEFI ANALYSIS ==========
      const defi = r.defiAnalysis;
      if (defi) {
        doc.moveDown(0.5);
        drawSection(doc, "2. ANALISE DeFi — MIXER / BRIDGE / DEX", W);

        const mx = defi.mixerInteractions?.length || 0;
        const bx = defi.bridgeInteractions?.length || 0;
        const dx = defi.dexInteractions?.length || 0;
        const hp = defi.opaqueHops || 0;

        doc.fontSize(9).fillColor(C.text).font("Helvetica");
        doc.text(`Mixers: ${mx}  |  Bridges: ${bx}  |  DEX Swaps: ${dx}  |  Saltos Opacos: ${hp}`);

        if (defi.summary?.patternDescription) {
          doc.moveDown(0.3);
          doc.font("Helvetica-Bold").fillColor(C.red).fontSize(9).text(`PADRAO DETECTADO: ${defi.summary.patternDescription}`);
        }

        if (defi.mixerInteractions?.length) {
          doc.moveDown(0.3);
          doc.font("Helvetica-Bold").fillColor(C.text).fontSize(8).text("Mixers:");
          for (const m of defi.mixerInteractions.slice(0, 5)) {
            doc.font("Helvetica").fillColor(C.muted).fontSize(8).text(`  - ${m.name} (${m.direction}) — ${(m.hash || "").substring(0, 20)}...`);
          }
        }
        if (defi.bridgeInteractions?.length) {
          doc.moveDown(0.2);
          doc.font("Helvetica-Bold").fillColor(C.text).fontSize(8).text("Bridges:");
          for (const b of defi.bridgeInteractions.slice(0, 5)) {
            doc.font("Helvetica").fillColor(C.muted).fontSize(8).text(`  - ${b.name} (${b.direction})`);
          }
        }
      }

      // ========== KYC ==========
      if (c.kyc) {
        checkPage(doc, 120);
        doc.moveDown(0.5);
        drawSection(doc, "3. KYC — DUE DILIGENCE OBRIGATORIA", W);

        doc.fontSize(9).font("Helvetica-Bold").fillColor(C.red).text(`Status: ${c.kyc.status}`);
        doc.font("Helvetica").fillColor(C.text).text(`Nivel: ${c.kyc.requirement}`);
        doc.moveDown(0.3);

        if (c.kyc.actions?.length) {
          doc.font("Helvetica-Bold").fontSize(8).fillColor(C.text).text("Acoes obrigatorias:");
          for (let i = 0; i < c.kyc.actions.length; i++) {
            checkPage(doc, 20);
            doc.font("Helvetica").fillColor(C.muted).text(`  ${i + 1}. ${c.kyc.actions[i]}`);
          }
        }

        if (c.kyc.documentsRequired?.length) {
          doc.moveDown(0.3);
          doc.font("Helvetica-Bold").fontSize(8).fillColor(C.text).text("Documentos exigidos:");
          for (const d of c.kyc.documentsRequired) {
            checkPage(doc, 16);
            const tag = d.required ? " [OBRIGATORIO]" : " [Recomendado]";
            const clr = d.required ? C.red : C.muted;
            doc.font("Helvetica").fillColor(C.muted).fontSize(8).text(`  - ${d.name}`, { continued: true });
            doc.fillColor(clr).font("Helvetica-Bold").text(tag);
          }
        }
      }

      // ========== AML/KYT ==========
      if (c.amlKyt) {
        checkPage(doc, 80);
        doc.moveDown(0.5);
        drawSection(doc, "4. AML/KYT — MONITORAMENTO", W);
        const a = c.amlKyt;
        const sc = a.status === "ACTIVE" ? C.green : a.status === "PARTIAL" ? C.yellow : C.red;
        doc.fontSize(9).font("Helvetica-Bold").fillColor(sc).text(`Status: ${a.status} — Cobertura: ${a.coveragePercent}%`);
        doc.font("Helvetica").fillColor(C.muted).fontSize(8).text(a.recommendation || "");
        if (a.activeProviders?.length) {
          doc.moveDown(0.2).font("Helvetica-Bold").fillColor(C.text).text("Fontes ativas:");
          a.activeProviders.forEach(p => doc.font("Helvetica").fillColor(C.green).text(`  + ${p}`));
        }
        if (a.inactiveProviders?.length) {
          doc.moveDown(0.2).font("Helvetica-Bold").fillColor(C.text).text("Nao configuradas:");
          a.inactiveProviders.forEach(p => doc.font("Helvetica").fillColor(C.muted).text(`  - ${p}`));
        }
      }

      // ========== REGULATORY ==========
      if (c.regulatoryCooperation) {
        checkPage(doc, 100);
        doc.moveDown(0.5);
        drawSection(doc, "5. COOPERACAO REGULATORIA", W);
        const reg = c.regulatoryCooperation;
        const sMap = { SAR_REQUIRED: [C.critical, "COMUNICACAO AO COAF OBRIGATORIA"], ENHANCED_MONITORING: [C.yellow, "Monitoramento Reforcado"], STANDARD: [C.green, "Procedimento Padrao"] };
        const [sc, sl] = sMap[reg.status] || [C.text, reg.status];
        doc.fontSize(10).font("Helvetica-Bold").fillColor(sc).text(sl);
        doc.moveDown(0.3);

        if (reg.obligations?.length) {
          // Table header
          doc.fontSize(7).font("Helvetica-Bold").fillColor(C.muted);
          const cols = [140, 180, 60, 60];
          let x = 50;
          ["REGULACAO", "ACAO", "PRAZO", "PRIORIDADE"].forEach((h, i) => { doc.text(h, x, doc.y, { width: cols[i] }); x += cols[i] + 5; });
          doc.moveDown(0.5);

          for (const o of reg.obligations) {
            checkPage(doc, 25);
            const y = doc.y;
            x = 50;
            doc.font("Helvetica").fillColor(C.text).fontSize(7);
            doc.text(o.regulation || "", x, y, { width: cols[0] }); x += cols[0] + 5;
            doc.text(o.action || "", x, y, { width: cols[1] }); x += cols[1] + 5;
            doc.text(o.deadline || "", x, y, { width: cols[2] }); x += cols[2] + 5;
            const pc = (o.priority === "IMEDIATA" || o.priority === "CRITICA" || o.priority === "CRÍTICA") ? C.red : o.priority === "ALTA" ? C.yellow : C.green;
            doc.fillColor(pc).font("Helvetica-Bold").text(o.priority || "", x, y, { width: cols[3] });
            doc.moveDown(0.3);
            // Move to the lowest y
            if (doc.y < y + 14) doc.y = y + 14;
          }
        }

        if (reg.jurisdictions?.length) {
          doc.moveDown(0.2).fontSize(7).font("Helvetica").fillColor(C.muted).text(`Jurisdicoes: ${reg.jurisdictions.join(", ")}`);
        }
      }

      // ========== ON-CHAIN MONITORING ==========
      const exp = r.sources?.explorer?.data;
      if (exp) {
        checkPage(doc, 80);
        doc.moveDown(0.5);
        drawSection(doc, "6. MONITORAMENTO ON-CHAIN", W);
        const items = [
          ["Saldo", exp.balance], ["Transacoes", exp.txCount], ["Token Txs", exp.tokenTxCount],
          ["Stablecoin Txs", exp.stablecoinTxCount], ["Primeira Tx", fmtDate(exp.firstTransaction)],
          ["Ultima Tx", fmtDate(exp.lastTransaction)], ["Counterparties", exp.uniqueCounterparties],
          ["Interacoes Contrato", exp.contractInteractions],
        ];
        const colW = 120;
        let x = 50, row = 0;
        for (const [label, val] of items) {
          doc.fontSize(7).font("Helvetica").fillColor(C.muted).text(label.toUpperCase(), x, doc.y, { width: colW });
          doc.fontSize(9).font("Helvetica-Bold").fillColor(C.text).text(String(val ?? "N/A"), x, doc.y, { width: colW });
          doc.moveDown(0.1);
          x += colW + 10;
          row++;
          if (row % 4 === 0) { x = 50; doc.moveDown(0.5); }
        }
      }

      // ========== TRANSPARENCY ==========
      if (c.proofOfReserves) {
        checkPage(doc, 80);
        doc.moveDown(0.5);
        drawSection(doc, "7. PROVA DE RESERVAS / TRANSPARENCIA", W);
        const p = c.proofOfReserves;
        const tMap = { TRANSPARENT: C.green, PARTIALLY_OPAQUE: C.yellow, OPAQUE: C.red, UNTRACEABLE: C.critical };
        const tLbl = { TRANSPARENT: "Transparente", PARTIALLY_OPAQUE: "Parcialmente Opaco", OPAQUE: "Opaco", UNTRACEABLE: "Irrastreavel" };
        doc.fontSize(10).font("Helvetica-Bold").fillColor(tMap[p.status] || C.text).text(`Score: ${p.score}/100 — ${tLbl[p.status] || p.status}`);
        doc.moveDown(0.2).fontSize(8).font("Helvetica").fillColor(C.text).text(`Rastreabilidade: ${p.fundTraceability || "N/A"}`);

        if (p.factors?.length) {
          doc.moveDown(0.2);
          for (const f of p.factors) {
            const fc = f.impact < -20 ? C.red : f.impact < 0 ? C.yellow : C.green;
            doc.fontSize(8).font("Helvetica-Bold").fillColor(fc).text(`  ${f.factor} (${f.impact > 0 ? "+" : ""}${f.impact}): `, { continued: true });
            doc.font("Helvetica").fillColor(C.muted).text(f.detail);
          }
        }
        if (p.recommendation) {
          doc.moveDown(0.2).fontSize(8).font("Helvetica-Bold").fillColor(C.text).text(`Recomendacao: ${p.recommendation}`);
        }
      }

      // ========== AUDIT TRAIL ==========
      if (c.auditTrail?.entries?.length) {
        checkPage(doc, 100);
        doc.moveDown(0.5);
        drawSection(doc, "8. TRILHA DE AUDITORIA", W);
        for (const e of c.auditTrail.entries) {
          checkPage(doc, 16);
          doc.fontSize(7).font("Courier").fillColor(C.accent).text(e.action, { continued: true });
          doc.font("Helvetica").fillColor(C.muted).text(`  ${(e.detail || "").substring(0, 90)}`);
        }
        doc.moveDown(0.3).fontSize(7).font("Helvetica").fillColor(C.muted);
        doc.text(`Hash: ${c.auditTrail.reportHash || "N/A"} | Retencao: ${c.auditTrail.retentionPolicy || "5 anos"}`);
      }

      // ========== DISCLAIMER ==========
      checkPage(doc, 60);
      doc.moveDown(1);
      drawLine(doc, W);
      doc.moveDown(0.3).fontSize(7).font("Helvetica").fillColor(C.muted);
      doc.text(`DISCLAIMER: ${r.disclaimer || ""}\nEste relatorio e gerado automaticamente e nao constitui parecer juridico. Decisoes de compliance devem ser tomadas por profissional qualificado.`);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ========== HELPERS ==========
function drawHeader(doc, r) {
  doc.fontSize(18).font("Helvetica-Bold").fillColor(C.dark).text("Relatorio de Screening AML");
  doc.moveDown(0.2);
  const addr = r.input?.address || "N/A";
  const short = addr.length > 30 ? addr.substring(0, 14) + "..." + addr.substring(addr.length - 10) : addr;
  doc.fontSize(9).font("Helvetica").fillColor(C.muted);
  doc.text(`Rede: ${(r.input?.chain || "").toUpperCase()}  |  Endereco: ${short}`);
  doc.text(`Data: ${fmtDateTime(r.timestamp)}  |  ID: ${r.id || "N/A"}`);
  doc.moveDown(0.5);
  drawLine(doc, 495);
  doc.moveDown(0.5);
}

function drawRiskSummary(doc, d, W) {
  const rc = RISK_COLOR[d.level] || C.text;
  doc.fontSize(16).font("Helvetica-Bold").fillColor(rc).text(`RISCO ${d.level}`, { continued: true });
  doc.fontSize(10).fillColor(C.muted).text(`   Score: ${d.score}/100`);
  doc.moveDown(0.2);
  const recMap = { APPROVE: "APROVAR", REVIEW: "REVISAO MANUAL (EDD)", BLOCK: "BLOQUEAR OPERACAO" };
  doc.fontSize(10).font("Helvetica-Bold").fillColor(rc).text(`Recomendacao: ${recMap[d.recommendation] || d.recommendation}`);
  doc.moveDown(0.2);
  doc.fontSize(9).font("Helvetica").fillColor(C.text).text(d.summary || "");
  doc.moveDown(0.5);
}

function drawSection(doc, title, W) {
  drawLine(doc, W);
  doc.moveDown(0.3);
  doc.fontSize(11).font("Helvetica-Bold").fillColor(C.dark).text(title);
  doc.moveDown(0.4);
}

function drawLine(doc, W) {
  doc.strokeColor(C.border).lineWidth(0.5).moveTo(50, doc.y).lineTo(50 + W, doc.y).stroke();
}

function checkPage(doc, needed) {
  if (doc.y + needed > 760) doc.addPage();
}

function fmtDate(iso) {
  if (!iso) return "N/A";
  try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return iso; }
}

function fmtDateTime(iso) {
  if (!iso) return "N/A";
  try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); } catch { return iso; }
}
