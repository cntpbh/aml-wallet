#!/usr/bin/env python3
"""
AML Wallet Screening — Gerador de Relatório PDF Profissional
Gera relatório de compliance com: KYC, AML/KYT, cooperação regulatória,
trilha de auditoria, monitoramento on-chain, prova de reservas.
"""

import json
import sys
import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.graphics.shapes import Drawing, Rect, String, Circle, Line
from reportlab.graphics.charts.piecharts import Pie


# ============================================================
# COLOR PALETTE
# ============================================================
C_BG_DARK = colors.HexColor("#0a0e17")
C_SURFACE = colors.HexColor("#111827")
C_BORDER = colors.HexColor("#1e2a3e")
C_TEXT = colors.HexColor("#1a1a2e")
C_TEXT_MUTED = colors.HexColor("#6b7280")
C_ACCENT = colors.HexColor("#0891b2")
C_GREEN = colors.HexColor("#059669")
C_YELLOW = colors.HexColor("#d97706")
C_RED = colors.HexColor("#dc2626")
C_CRITICAL = colors.HexColor("#991b1b")
C_LIGHT_GREEN = colors.HexColor("#ecfdf5")
C_LIGHT_YELLOW = colors.HexColor("#fffbeb")
C_LIGHT_RED = colors.HexColor("#fef2f2")
C_LIGHT_BLUE = colors.HexColor("#ecfeff")
C_WHITE = colors.white
C_HEADER_BG = colors.HexColor("#0f172a")

RISK_COLORS = {
    "LOW": C_GREEN,
    "MEDIUM": C_YELLOW,
    "HIGH": C_RED,
    "CRITICAL": C_CRITICAL,
}

RISK_BG = {
    "LOW": C_LIGHT_GREEN,
    "MEDIUM": C_LIGHT_YELLOW,
    "HIGH": C_LIGHT_RED,
    "CRITICAL": C_LIGHT_RED,
}


# ============================================================
# STYLES
# ============================================================
def get_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="ReportTitle",
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=28,
        textColor=C_HEADER_BG,
        spaceAfter=4 * mm,
    ))

    styles.add(ParagraphStyle(
        name="ReportSubtitle",
        fontName="Helvetica",
        fontSize=11,
        leading=14,
        textColor=C_TEXT_MUTED,
        spaceAfter=8 * mm,
    ))

    styles.add(ParagraphStyle(
        name="SectionHeader",
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=C_HEADER_BG,
        spaceBefore=8 * mm,
        spaceAfter=4 * mm,
        borderPadding=(0, 0, 2, 0),
    ))

    styles.add(ParagraphStyle(
        name="SubSection",
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=C_ACCENT,
        spaceBefore=4 * mm,
        spaceAfter=2 * mm,
    ))

    styles.add(ParagraphStyle(
        name="BodyText2",
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=C_TEXT,
        alignment=TA_JUSTIFY,
        spaceAfter=2 * mm,
    ))

    styles.add(ParagraphStyle(
        name="SmallMuted",
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=C_TEXT_MUTED,
    ))

    styles.add(ParagraphStyle(
        name="BulletItem",
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=C_TEXT,
        leftIndent=12,
        spaceAfter=1 * mm,
    ))

    styles.add(ParagraphStyle(
        name="AlertText",
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=13,
        textColor=C_RED,
        spaceAfter=2 * mm,
    ))

    styles.add(ParagraphStyle(
        name="FooterText",
        fontName="Helvetica",
        fontSize=7,
        leading=9,
        textColor=C_TEXT_MUTED,
        alignment=TA_CENTER,
    ))

    styles.add(ParagraphStyle(
        name="TableCell",
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=C_TEXT,
    ))

    styles.add(ParagraphStyle(
        name="TableCellBold",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=C_TEXT,
    ))

    return styles


# ============================================================
# PDF BUILDER
# ============================================================
class AMLReportPDF:
    def __init__(self, data, output_path):
        self.data = data
        self.report = data.get("report", data)
        self.compliance = data.get("compliance", {})
        self.output_path = output_path
        self.styles = get_styles()
        self.story = []

    def build(self):
        doc = SimpleDocTemplate(
            self.output_path,
            pagesize=A4,
            rightMargin=18 * mm,
            leftMargin=18 * mm,
            topMargin=20 * mm,
            bottomMargin=20 * mm,
        )

        self._add_header()
        self._add_risk_summary()
        self._add_findings()
        self._add_defi_analysis()
        self._add_kyc_section()
        self._add_aml_kyt_section()
        self._add_regulatory_section()
        self._add_onchain_monitoring()
        self._add_transparency_section()
        self._add_audit_trail()
        self._add_disclaimer()

        doc.build(self.story, onFirstPage=self._page_header_footer, onLaterPages=self._page_header_footer)
        return self.output_path

    # ============================================================
    # PAGE HEADER / FOOTER
    # ============================================================
    def _page_header_footer(self, canvas, doc):
        canvas.saveState()
        w, h = A4

        # Top line
        canvas.setStrokeColor(C_ACCENT)
        canvas.setLineWidth(2)
        canvas.line(18 * mm, h - 12 * mm, w - 18 * mm, h - 12 * mm)

        # Header text
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(C_TEXT_MUTED)
        canvas.drawString(18 * mm, h - 10 * mm, "AML WALLET SCREENING — RELATÓRIO DE COMPLIANCE")

        report_id = self.report.get("id", "N/A")
        canvas.drawRightString(w - 18 * mm, h - 10 * mm, f"ID: {report_id}")

        # Footer
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(C_TEXT_MUTED)
        canvas.drawString(18 * mm, 10 * mm, f"Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M:%S')} — Documento confidencial")
        canvas.drawRightString(w - 18 * mm, 10 * mm, f"Página {doc.page}")

        # Bottom line
        canvas.setStrokeColor(C_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, 14 * mm, w - 18 * mm, 14 * mm)

        canvas.restoreState()

    # ============================================================
    # SECTIONS
    # ============================================================
    def _add_header(self):
        self.story.append(Spacer(1, 8 * mm))
        self.story.append(Paragraph("Relatório de Screening AML", self.styles["ReportTitle"]))

        inp = self.report.get("input", {})
        chain = inp.get("chain", "N/A").upper()
        address = inp.get("address", "N/A")
        ts = self.report.get("timestamp", "N/A")

        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            ts_fmt = dt.strftime("%d/%m/%Y %H:%M:%S UTC")
        except Exception:
            ts_fmt = ts

        self.story.append(Paragraph(
            f"Rede: <b>{chain}</b> &nbsp;|&nbsp; Endereço: <font face='Courier' size='9'>{address}</font><br/>"
            f"Data: {ts_fmt} &nbsp;|&nbsp; ID: <b>{self.report.get('id', 'N/A')}</b>",
            self.styles["ReportSubtitle"]
        ))

        self.story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=4 * mm))

    def _add_risk_summary(self):
        dec = self.report.get("decision", {})
        level = dec.get("level", "N/A")
        score = dec.get("score", 0)
        rec = dec.get("recommendation", "N/A")
        summary = dec.get("summary", "")

        risk_color = RISK_COLORS.get(level, C_TEXT)
        risk_bg = RISK_BG.get(level, C_WHITE)

        rec_labels = {"APPROVE": "APROVAR", "REVIEW": "REVISAO MANUAL (EDD)", "BLOCK": "BLOQUEAR OPERACAO"}
        rec_label = rec_labels.get(rec, rec)

        # Risk badge table
        badge_data = [[
            Paragraph(f"<font color='{risk_color.hexval()}'><b>RISCO {level}</b></font>", self.styles["SectionHeader"]),
            Paragraph(f"<b>Score: {score}/100</b>", self.styles["SubSection"]),
            Paragraph(f"<font color='{risk_color.hexval()}'><b>{rec_label}</b></font>", self.styles["SubSection"]),
        ]]

        badge_table = Table(badge_data, colWidths=[60 * mm, 40 * mm, 70 * mm])
        badge_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), risk_bg),
            ("BOX", (0, 0), (-1, -1), 1, risk_color),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ]))

        self.story.append(badge_table)
        self.story.append(Spacer(1, 3 * mm))
        self.story.append(Paragraph(summary, self.styles["BodyText2"]))

    def _add_findings(self):
        findings = self.report.get("findings", [])
        self.story.append(Paragraph("1. Indicadores de Risco Detectados", self.styles["SectionHeader"]))

        if not findings:
            self.story.append(Paragraph(
                "<font color='#059669'>Nenhum indicador de risco detectado nas fontes consultadas.</font>",
                self.styles["BodyText2"]
            ))
            return

        table_data = [
            [Paragraph("<b>Severidade</b>", self.styles["TableCellBold"]),
             Paragraph("<b>Fonte</b>", self.styles["TableCellBold"]),
             Paragraph("<b>Detalhe</b>", self.styles["TableCellBold"])]
        ]

        for f in findings:
            sev = f.get("severity", "N/A")
            sev_color = RISK_COLORS.get(sev, C_TEXT)
            table_data.append([
                Paragraph(f"<font color='{sev_color.hexval()}'><b>{sev}</b></font>", self.styles["TableCell"]),
                Paragraph(f.get("source", ""), self.styles["TableCell"]),
                Paragraph(f.get("detail", ""), self.styles["TableCell"]),
            ])

        t = Table(table_data, colWidths=[25 * mm, 35 * mm, 110 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), C_HEADER_BG),
            ("TEXTCOLOR", (0, 0), (-1, 0), C_WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, colors.HexColor("#f8fafc")]),
        ]))

        self.story.append(t)

    def _add_defi_analysis(self):
        defi = self.report.get("defiAnalysis", self.compliance.get("onChainMonitoring", {}).get("defiExposure", {}))
        if not defi:
            return

        self.story.append(Paragraph("2. Análise DeFi — Mixer / Bridge / DEX", self.styles["SectionHeader"]))

        summary = defi.get("summary", defi)
        mixer_count = len(defi.get("mixerInteractions", [])) if isinstance(defi.get("mixerInteractions"), list) else defi.get("mixers", 0)
        bridge_count = len(defi.get("bridgeInteractions", [])) if isinstance(defi.get("bridgeInteractions"), list) else defi.get("bridges", 0)
        dex_count = len(defi.get("dexInteractions", [])) if isinstance(defi.get("dexInteractions"), list) else defi.get("dexSwaps", 0)
        hops = defi.get("opaqueHops", 0)

        # Summary table
        data = [[
            Paragraph(f"<b>Mixers</b><br/><font color='{C_RED.hexval() if mixer_count > 0 else C_GREEN.hexval()}'><b>{mixer_count}</b></font>", self.styles["TableCell"]),
            Paragraph(f"<b>Bridges</b><br/><font color='{C_YELLOW.hexval() if bridge_count > 0 else C_GREEN.hexval()}'><b>{bridge_count}</b></font>", self.styles["TableCell"]),
            Paragraph(f"<b>DEX Swaps</b><br/><b>{dex_count}</b>", self.styles["TableCell"]),
            Paragraph(f"<b>Saltos Opacos</b><br/><font color='{C_RED.hexval() if hops >= 3 else C_TEXT.hexval()}'><b>{hops}</b></font>", self.styles["TableCell"]),
        ]]

        t = Table(data, colWidths=[42 * mm, 42 * mm, 42 * mm, 42 * mm])
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, C_BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, C_BORDER),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        self.story.append(t)

        pattern = summary.get("patternDescription", defi.get("pattern")) if isinstance(summary, dict) else None
        if pattern and pattern != "Nenhum padrão suspeito detectado":
            self.story.append(Spacer(1, 2 * mm))
            self.story.append(Paragraph(
                f"<font color='{C_RED.hexval()}'><b>PADRÃO DETECTADO:</b></font> {pattern}",
                self.styles["AlertText"]
            ))

        # Mixer details
        mixer_list = defi.get("mixerInteractions", [])
        if isinstance(mixer_list, list) and len(mixer_list) > 0:
            self.story.append(Paragraph("Interações com Mixers:", self.styles["SubSection"]))
            for m in mixer_list[:5]:
                self.story.append(Paragraph(
                    f"&bull; <b>{m.get('name', 'Unknown')}</b> — {m.get('direction', '')} — Hash: <font face='Courier' size='7'>{m.get('hash', 'N/A')[:20]}...</font>",
                    self.styles["BulletItem"]
                ))

        # Bridge details
        bridge_list = defi.get("bridgeInteractions", [])
        if isinstance(bridge_list, list) and len(bridge_list) > 0:
            self.story.append(Paragraph("Interações com Bridges:", self.styles["SubSection"]))
            for b in bridge_list[:5]:
                self.story.append(Paragraph(
                    f"&bull; <b>{b.get('name', 'Unknown')}</b> — {b.get('direction', '')}",
                    self.styles["BulletItem"]
                ))

    def _add_kyc_section(self):
        kyc = self.compliance.get("kyc", {})
        if not kyc:
            return

        self.story.append(PageBreak())
        self.story.append(Paragraph("3. Avaliação KYC — Due Diligence Obrigatória", self.styles["SectionHeader"]))

        status = kyc.get("status", "N/A")
        req = kyc.get("requirement", "N/A")

        status_colors = {
            "MANDATORY_BLOCK": C_CRITICAL,
            "MANDATORY_EDD": C_RED,
            "REQUIRED_CDD_PLUS": C_YELLOW,
            "STANDARD": C_GREEN,
        }
        status_color = status_colors.get(status, C_TEXT)

        self.story.append(Paragraph(
            f"<font color='{status_color.hexval()}'><b>Status: {status}</b></font><br/>"
            f"Nível de diligência: <b>{req}</b>",
            self.styles["BodyText2"]
        ))

        # Actions
        actions = kyc.get("actions", [])
        if actions:
            self.story.append(Paragraph("Ações obrigatórias:", self.styles["SubSection"]))
            for i, action in enumerate(actions, 1):
                self.story.append(Paragraph(f"<b>{i}.</b> {action}", self.styles["BulletItem"]))

        # Required documents
        docs = kyc.get("documentsRequired", [])
        if docs:
            self.story.append(Paragraph("Documentos exigidos:", self.styles["SubSection"]))
            doc_data = [
                [Paragraph("<b>Documento</b>", self.styles["TableCellBold"]),
                 Paragraph("<b>Obrigatório</b>", self.styles["TableCellBold"])]
            ]
            for d in docs:
                required = d.get("required", False)
                req_text = f"<font color='{C_RED.hexval()}'><b>SIM</b></font>" if required else "Recomendado"
                doc_data.append([
                    Paragraph(d.get("name", ""), self.styles["TableCell"]),
                    Paragraph(req_text, self.styles["TableCell"]),
                ])

            t = Table(doc_data, colWidths=[130 * mm, 35 * mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), C_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), C_WHITE),
                ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, colors.HexColor("#f8fafc")]),
            ]))
            self.story.append(t)

    def _add_aml_kyt_section(self):
        aml = self.compliance.get("amlKyt", {})
        if not aml:
            return

        self.story.append(Paragraph("4. AML/KYT — Status do Monitoramento", self.styles["SectionHeader"]))

        status = aml.get("status", "N/A")
        coverage = aml.get("coveragePercent", 0)

        status_map = {"ACTIVE": ("Ativo", C_GREEN), "PARTIAL": ("Parcial", C_YELLOW), "INSUFFICIENT": ("Insuficiente", C_RED)}
        s_label, s_color = status_map.get(status, (status, C_TEXT))

        self.story.append(Paragraph(
            f"Status: <font color='{s_color.hexval()}'><b>{s_label}</b></font> — Cobertura: <b>{coverage}%</b><br/>"
            f"Tipo: {aml.get('screeningType', 'N/A')} | Frequência: {aml.get('frequency', 'N/A')}",
            self.styles["BodyText2"]
        ))

        # Providers
        active = aml.get("activeProviders", [])
        inactive = aml.get("inactiveProviders", [])

        if active:
            self.story.append(Paragraph("Fontes ativas:", self.styles["SubSection"]))
            for p in active:
                self.story.append(Paragraph(f"<font color='{C_GREEN.hexval()}'>&bull;</font> {p}", self.styles["BulletItem"]))

        if inactive:
            self.story.append(Paragraph("Fontes não configuradas:", self.styles["SubSection"]))
            for p in inactive:
                self.story.append(Paragraph(f"<font color='{C_TEXT_MUTED.hexval()}'>&bull;</font> {p}", self.styles["BulletItem"]))

    def _add_regulatory_section(self):
        reg = self.compliance.get("regulatoryCooperation", {})
        if not reg:
            return

        self.story.append(Paragraph("5. Cooperação Regulatória", self.styles["SectionHeader"]))

        status = reg.get("status", "N/A")
        status_map = {
            "SAR_REQUIRED": ("COMUNICAÇÃO AO COAF OBRIGATÓRIA", C_CRITICAL),
            "ENHANCED_MONITORING": ("Monitoramento Reforçado", C_YELLOW),
            "STANDARD": ("Procedimento Padrão", C_GREEN),
        }
        s_label, s_color = status_map.get(status, (status, C_TEXT))

        self.story.append(Paragraph(
            f"<font color='{s_color.hexval()}'><b>{s_label}</b></font>",
            self.styles["BodyText2"]
        ))

        obligations = reg.get("obligations", [])
        if obligations:
            obl_data = [
                [Paragraph("<b>Regulação</b>", self.styles["TableCellBold"]),
                 Paragraph("<b>Ação</b>", self.styles["TableCellBold"]),
                 Paragraph("<b>Prazo</b>", self.styles["TableCellBold"]),
                 Paragraph("<b>Prioridade</b>", self.styles["TableCellBold"])]
            ]
            for o in obligations:
                pri = o.get("priority", "")
                pri_color = C_RED if pri in ("IMEDIATA", "CRÍTICA") else C_YELLOW if pri == "ALTA" else C_TEXT
                obl_data.append([
                    Paragraph(o.get("regulation", ""), self.styles["TableCell"]),
                    Paragraph(o.get("action", ""), self.styles["TableCell"]),
                    Paragraph(o.get("deadline", ""), self.styles["TableCell"]),
                    Paragraph(f"<font color='{pri_color.hexval()}'><b>{pri}</b></font>", self.styles["TableCell"]),
                ])

            t = Table(obl_data, colWidths=[45 * mm, 65 * mm, 25 * mm, 25 * mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), C_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), C_WHITE),
                ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, colors.HexColor("#f8fafc")]),
            ]))
            self.story.append(t)

        # Jurisdictions
        jurisdictions = reg.get("jurisdictions", [])
        if jurisdictions:
            self.story.append(Spacer(1, 2 * mm))
            self.story.append(Paragraph(
                f"<b>Jurisdições aplicáveis:</b> {', '.join(jurisdictions)}",
                self.styles["SmallMuted"]
            ))

    def _add_onchain_monitoring(self):
        mon = self.compliance.get("onChainMonitoring", {})
        if not mon:
            return

        self.story.append(Paragraph("6. Monitoramento On-Chain", self.styles["SectionHeader"]))

        metrics = mon.get("metrics", {})
        if metrics:
            m_data = [[
                Paragraph("<b>Métrica</b>", self.styles["TableCellBold"]),
                Paragraph("<b>Valor</b>", self.styles["TableCellBold"]),
                Paragraph("<b>Métrica</b>", self.styles["TableCellBold"]),
                Paragraph("<b>Valor</b>", self.styles["TableCellBold"]),
            ]]

            items = list(metrics.items())
            labels = {
                "balance": "Saldo",
                "totalTransactions": "Total Txs",
                "tokenTransactions": "Token Txs",
                "stablecoinTransactions": "Stablecoin Txs",
                "firstActivity": "Primeira Atividade",
                "lastActivity": "Última Atividade",
                "uniqueCounterparties": "Counterparties",
                "contractInteractions": "Interações Contrato",
            }

            for i in range(0, len(items), 2):
                row = []
                for j in range(2):
                    if i + j < len(items):
                        k, v = items[i + j]
                        label = labels.get(k, k)
                        val = str(v)[:30]
                        row.extend([
                            Paragraph(label, self.styles["TableCell"]),
                            Paragraph(f"<b>{val}</b>", self.styles["TableCell"]),
                        ])
                    else:
                        row.extend([Paragraph("", self.styles["TableCell"]), Paragraph("", self.styles["TableCell"])])

                m_data.append(row)

            t = Table(m_data, colWidths=[38 * mm, 45 * mm, 38 * mm, 45 * mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]))
            self.story.append(t)

        # Continuous monitoring rec
        cm_rec = mon.get("continuousMonitoring", {})
        if cm_rec:
            self.story.append(Spacer(1, 2 * mm))
            self.story.append(Paragraph(
                f"<b>Monitoramento contínuo:</b> {cm_rec.get('frequency', 'N/A')}",
                self.styles["BodyText2"]
            ))

    def _add_transparency_section(self):
        por = self.compliance.get("proofOfReserves", {})
        if not por:
            return

        self.story.append(Paragraph("7. Prova de Reservas / Transparência", self.styles["SectionHeader"]))

        score = por.get("score", 0)
        status = por.get("status", "N/A")
        traceability = por.get("fundTraceability", "N/A")

        status_map = {
            "TRANSPARENT": ("Transparente", C_GREEN),
            "PARTIALLY_OPAQUE": ("Parcialmente Opaco", C_YELLOW),
            "OPAQUE": ("Opaco", C_RED),
            "UNTRACEABLE": ("Irrastreável", C_CRITICAL),
        }
        s_label, s_color = status_map.get(status, (status, C_TEXT))

        self.story.append(Paragraph(
            f"Score de Transparência: <font color='{s_color.hexval()}'><b>{score}/100</b></font> — "
            f"Status: <font color='{s_color.hexval()}'><b>{s_label}</b></font>",
            self.styles["BodyText2"]
        ))

        self.story.append(Paragraph(f"<b>Rastreabilidade:</b> {traceability}", self.styles["BodyText2"]))

        factors = por.get("factors", [])
        if factors:
            self.story.append(Paragraph("Fatores de impacto:", self.styles["SubSection"]))
            for f in factors:
                impact = f.get("impact", 0)
                color = C_RED if impact < -20 else C_YELLOW if impact < 0 else C_GREEN
                self.story.append(Paragraph(
                    f"&bull; <b>{f.get('factor', '')}</b> (<font color='{color.hexval()}'>{impact:+d}</font>): {f.get('detail', '')}",
                    self.styles["BulletItem"]
                ))

        rec = por.get("recommendation", "")
        if rec:
            self.story.append(Spacer(1, 2 * mm))
            self.story.append(Paragraph(f"<b>Recomendação:</b> {rec}", self.styles["BodyText2"]))

    def _add_audit_trail(self):
        audit = self.compliance.get("auditTrail", {})
        if not audit:
            return

        self.story.append(PageBreak())
        self.story.append(Paragraph("8. Trilha de Auditoria", self.styles["SectionHeader"]))

        entries = audit.get("entries", [])
        if entries:
            trail_data = [
                [Paragraph("<b>Ação</b>", self.styles["TableCellBold"]),
                 Paragraph("<b>Detalhe</b>", self.styles["TableCellBold"]),
                 Paragraph("<b>Ator</b>", self.styles["TableCellBold"])]
            ]

            for e in entries:
                trail_data.append([
                    Paragraph(e.get("action", ""), self.styles["TableCell"]),
                    Paragraph(str(e.get("detail", ""))[:100], self.styles["TableCell"]),
                    Paragraph(e.get("actor", ""), self.styles["TableCell"]),
                ])

            t = Table(trail_data, colWidths=[40 * mm, 105 * mm, 20 * mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), C_HEADER_BG),
                ("TEXTCOLOR", (0, 0), (-1, 0), C_WHITE),
                ("GRID", (0, 0), (-1, -1), 0.5, C_BORDER),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_WHITE, colors.HexColor("#f8fafc")]),
            ]))
            self.story.append(t)

        report_hash = audit.get("reportHash", "N/A")
        retention = audit.get("retentionPolicy", "N/A")
        self.story.append(Spacer(1, 3 * mm))
        self.story.append(Paragraph(
            f"<b>Hash de integridade:</b> <font face='Courier'>{report_hash}</font><br/>"
            f"<b>Política de retenção:</b> {retention}",
            self.styles["SmallMuted"]
        ))

    def _add_disclaimer(self):
        self.story.append(Spacer(1, 8 * mm))
        self.story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=4 * mm))

        disclaimer = self.report.get("disclaimer", "")
        self.story.append(Paragraph(
            f"<b>DISCLAIMER:</b> {disclaimer}<br/><br/>"
            "Este relatório é gerado automaticamente e não constitui parecer jurídico. "
            "Decisões de compliance devem ser tomadas por profissional qualificado. "
            "A precisão depende das fontes consultadas e seus respectivos limites. "
            "Resultados de fontes gratuitas podem ter cobertura parcial.",
            self.styles["SmallMuted"]
        ))


# ============================================================
# MAIN — Recebe JSON via stdin ou arquivo
# ============================================================
def main():
    if "--test" in sys.argv:
        # Gera relatório de teste com dados mock de alto risco
        test_data = generate_test_data()
        output = os.path.join(os.path.dirname(__file__), "..", "..", "data", "test-report.pdf")
        os.makedirs(os.path.dirname(output), exist_ok=True)
        pdf = AMLReportPDF(test_data, output)
        pdf.build()
        print(f"PDF de teste gerado: {output}")
        return

    # Lê JSON da stdin
    try:
        raw = sys.stdin.read()
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON inválido: {str(e)}"}), file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/aml-report.pdf"

    try:
        pdf = AMLReportPDF(data, output_path)
        pdf.build()
        print(json.dumps({"success": True, "path": output_path}))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


def generate_test_data():
    """Dados de teste — cenário de alto risco com mixer + bridge + wallet recente"""
    return {
        "report": {
            "id": "AML-TEST-HIGH-RISK",
            "timestamp": datetime.now().isoformat(),
            "input": {"chain": "ethereum", "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD1e"},
            "decision": {
                "level": "HIGH",
                "score": 85,
                "recommendation": "BLOCK",
                "summary": "Fundos passaram por DEX + Bridge + Mixer. Wallet recente com múltiplos saltos opacos."
            },
            "findings": [
                {"source": "DeFi Analysis", "severity": "CRITICAL", "detail": "Interacao com mixer Tornado Cash detectada. 3 transacoes.", "category": "mixer"},
                {"source": "DeFi Analysis", "severity": "HIGH", "detail": "Uso de bridge cross-chain: Wormhole, Synapse Bridge.", "category": "bridge"},
                {"source": "DeFi Analysis", "severity": "HIGH", "detail": "Fundos passaram por Mixer + Bridge + DEX. Padrao de ofuscacao.", "category": "pattern"},
                {"source": "DeFi Analysis", "severity": "MEDIUM", "detail": "5 salto(s) opaco(s) detectados.", "category": "hops"},
                {"source": "On-Chain Heuristics", "severity": "HIGH", "detail": "Carteira criada ha 2 dia(s). Alto risco de descarte pos-uso."},
                {"source": "On-Chain Heuristics", "severity": "MEDIUM", "detail": "Saldo proximo de zero com 89 transacoes. Possivel relay wallet."},
                {"source": "OFAC/SDN", "severity": "CRITICAL", "detail": "Endereco interagiu com contrato sancionado (Tornado Cash Router)."},
            ],
            "defiAnalysis": {
                "mixerInteractions": [
                    {"name": "Tornado Cash Router", "type": "mixer", "risk": "CRITICAL", "hash": "0xabc...123", "direction": "OUT (deposit)"},
                    {"name": "Tornado Cash 10 ETH", "type": "mixer", "risk": "CRITICAL", "hash": "0xdef...456", "direction": "OUT (deposit)"},
                    {"name": "Tornado Cash 1 ETH", "type": "mixer", "risk": "CRITICAL", "hash": "0xghi...789", "direction": "IN (withdrawal)"},
                ],
                "bridgeInteractions": [
                    {"name": "Wormhole", "hash": "0xjkl...012", "direction": "OUT (bridging)"},
                    {"name": "Synapse Bridge", "hash": "0xmno...345", "direction": "IN (received)"},
                ],
                "dexInteractions": [
                    {"name": "Uniswap V3 Router", "hash": "0xpqr...678"},
                    {"name": "1inch V5 Router", "hash": "0xstu...901"},
                ],
                "opaqueHops": 5,
                "summary": {
                    "usedMixer": True,
                    "usedBridge": True,
                    "usedDex": True,
                    "suspiciousPattern": True,
                    "patternDescription": "Fundos passaram por Mixer + Bridge + DEX. Padrao classico de ofuscacao de origem."
                }
            },
            "sources": {
                "ofac": {"enabled": True, "match": True},
                "explorer": {"enabled": True, "data": {
                    "balance": "0.0001 ETH", "txCount": 89, "tokenTxCount": 45,
                    "stablecoinTxCount": 38, "firstTransaction": "2025-02-13",
                    "lastTransaction": "2025-02-15", "uniqueCounterparties": 12,
                    "contractInteractions": 67
                }},
                "heuristics": {"enabled": True, "score": 70, "flags": []},
                "chainabuse": {"enabled": False},
                "blocksec": {"enabled": False},
            },
            "disclaimer": "Screening automatizado (MVP). Pode haver falso positivo/negativo. Recomenda-se evidencias adicionais."
        },
        "compliance": {
            "kyc": {
                "status": "MANDATORY_BLOCK",
                "requirement": "Enhanced Due Diligence (EDD) + Suspicious Activity Report (SAR)",
                "actions": [
                    "BLOQUEAR transacao imediatamente",
                    "Registrar SAR/COAF (Comunicacao de Operacao Suspeita)",
                    "MIXER DETECTADO - Exigir explicacao detalhada da origem dos fundos",
                    "Preservar toda documentacao para autoridades",
                    "Nao alertar o cliente sobre a investigacao (tipping-off)",
                    "Acionar Compliance Officer para decisao final",
                ],
                "documentsRequired": [
                    {"name": "Documento de identidade (RG/CNH/Passaporte)", "required": True},
                    {"name": "Comprovante de endereco (ultimos 3 meses)", "required": True},
                    {"name": "Declaracao de origem dos fundos (assinada)", "required": True},
                    {"name": "Extratos bancarios (ultimos 6 meses)", "required": True},
                    {"name": "Hash/TXID das transacoes de origem", "required": True},
                    {"name": "Justificativa por escrito do uso de mixer", "required": True},
                    {"name": "Rastreio completo da cadeia de transacoes", "required": True},
                ],
            },
            "amlKyt": {
                "status": "PARTIAL",
                "coveragePercent": 67,
                "activeProviders": ["OFAC/SDN", "Blockchain Explorer", "Heuristicas Comportamentais", "DeFi Protocol Analysis"],
                "inactiveProviders": ["Chainabuse (Scam Reports)", "Blocksec/MetaSleuth (Risk Score)"],
                "screeningType": "Automated Real-Time Screening",
                "frequency": "Per-transaction",
            },
            "regulatoryCooperation": {
                "status": "SAR_REQUIRED",
                "obligations": [
                    {"regulation": "Circular BACEN 3.978/2020", "action": "Comunicacao ao COAF (SISCOAF)", "deadline": "24 horas", "priority": "IMEDIATA"},
                    {"regulation": "FATF Recommendation 20", "action": "Suspicious Transaction Report", "deadline": "Imediatamente", "priority": "IMEDIATA"},
                    {"regulation": "Lei 9.613/1998", "action": "Manter registros por 5 anos", "deadline": "Continuo", "priority": "ALTA"},
                    {"regulation": "OFAC Compliance", "action": "Verificar SDN List (Tornado Cash sancionado)", "deadline": "Antes da operacao", "priority": "CRITICA"},
                ],
                "jurisdictions": ["Brasil (BACEN/COAF)", "EUA (OFAC/FinCEN)", "Internacional (FATF/GAFI)"],
            },
            "auditTrail": {
                "entries": [
                    {"timestamp": "2025-02-15T10:00:00Z", "action": "SCREENING_INITIATED", "detail": "Screening para ETH:0x742d35Cc...", "actor": "SYSTEM"},
                    {"timestamp": "2025-02-15T10:00:01Z", "action": "SOURCE_QUERIED", "detail": "OFAC/SDN consultada. MATCH ENCONTRADO.", "actor": "SYSTEM"},
                    {"timestamp": "2025-02-15T10:00:02Z", "action": "SOURCE_QUERIED", "detail": "Explorer consultado. 89 txs, wallet 2 dias.", "actor": "SYSTEM"},
                    {"timestamp": "2025-02-15T10:00:03Z", "action": "DEFI_ANALYSIS", "detail": "Mixer=TRUE, Bridge=TRUE, DEX=TRUE, Hops=5", "actor": "SYSTEM"},
                    {"timestamp": "2025-02-15T10:00:04Z", "action": "RISK_CALCULATED", "detail": "Level=HIGH, Score=85, Rec=BLOCK", "actor": "SYSTEM"},
                    {"timestamp": "2025-02-15T10:00:05Z", "action": "REPORT_GENERATED", "detail": "Relatorio AML-TEST-HIGH-RISK gerado.", "actor": "SYSTEM"},
                    {"timestamp": "2025-02-15T10:00:05Z", "action": "INTEGRITY_HASH", "detail": "SHA256: 0000a3f2c91b8e74", "actor": "SYSTEM"},
                ],
                "reportHash": "0000a3f2c91b8e74",
                "retentionPolicy": "Minimo 5 anos (Lei 9.613/1998)",
            },
            "onChainMonitoring": {
                "metrics": {
                    "balance": "0.0001 ETH",
                    "totalTransactions": 89,
                    "tokenTransactions": 45,
                    "stablecoinTransactions": 38,
                    "firstActivity": "2025-02-13",
                    "lastActivity": "2025-02-15",
                    "uniqueCounterparties": 12,
                    "contractInteractions": 67,
                },
                "continuousMonitoring": {
                    "frequency": "Diario (HIGH/CRITICAL)",
                },
            },
            "proofOfReserves": {
                "score": 5,
                "status": "UNTRACEABLE",
                "fundTraceability": "Nula - fundos passaram por mixer(s). Origem irrastreavel.",
                "factors": [
                    {"factor": "Uso de mixer/tumbler", "impact": -50, "detail": "Tornado Cash. Rastreabilidade severamente comprometida."},
                    {"factor": "Uso de bridge cross-chain", "impact": -15, "detail": "Wormhole + Synapse. Rastreio multi-chain necessario."},
                    {"factor": "5 saltos opacos", "impact": -25, "detail": "Multiplos intermediarios entre origem e destino."},
                    {"factor": "Historico limitado", "impact": -10, "detail": "Wallet com 2 dias. Impossivel padrão comportamental."},
                ],
                "recommendation": "Exigir prova documental da origem dos fundos (extratos, contratos, invoices).",
            },
        },
    }


if __name__ == "__main__":
    main()
