# AML Wallet Screening v2 — Compliance Report System

Sistema completo de screening AML/KYT para carteiras crypto com **relatório PDF profissional**, detecção de **mixer/bridge/DEX**, avaliação **KYC obrigatória**, **trilha de auditoria** e **prova de reservas**.

## O que o sistema detecta

| Cenário | Detecção | Ação |
|---------|----------|------|
| Wallet sancionada (OFAC) | CRITICAL | BLOQUEAR + SAR/COAF |
| Fundos via Tornado Cash/mixer | CRITICAL/HIGH | BLOQUEAR + EDD |
| DEX + Bridge + Mixer combinados | HIGH | BLOQUEAR — padrão de ofuscação |
| Wallet recente (< 7 dias) | HIGH | EDD obrigatório |
| Múltiplos saltos opacos | MEDIUM/HIGH | Revisão manual |
| Relay wallet (saldo zero, muitas txs) | MEDIUM | CDD reforçado |
| Concentração de stablecoins | MEDIUM | Monitorar |

## Relatório PDF inclui

1. **KYC Obrigatório** — nível de due diligence, documentos exigidos, ações
2. **AML/KYT Ativo** — fontes consultadas, cobertura, status
3. **Cooperação Regulatória** — obrigações legais (BACEN, COAF, FATF, OFAC)
4. **Trilha de Auditoria** — log imutável com hash de integridade
5. **Monitoramento On-Chain** — métricas, exposição DeFi, alertas
6. **Prova de Reservas / Transparência** — score de rastreabilidade

## Redes Suportadas

Ethereum, TRON (USDT-TRC20), BSC, Polygon, Bitcoin

## Instalação

```bash
git clone https://github.com/SEU-USUARIO/aml-wallet-screening.git
cd aml-wallet-screening

# Node.js
npm install

# Python (para geração de PDF)
pip install reportlab

# Configurar API keys
cp .env.example .env

# (Opcional) Atualizar lista OFAC
npm run update-ofac

# Iniciar
npm start
```

Acesse: `http://localhost:3000`

## API Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/screen?chain=...&address=...` | GET | Screening completo (JSON) |
| `/api/screen/pdf?chain=...&address=...` | GET | Screening + PDF direto |
| `/api/report/pdf` | POST | Gerar PDF de resultado existente |
| `/api/health` | GET | Status dos providers |

## Estrutura

```
├── server.js                    # Express server + rotas
├── public/index.html            # Interface web
├── src/
│   ├── risk-engine.js           # Motor de risco
│   ├── providers/
│   │   ├── ofac.js              # Lista de sanções
│   │   ├── explorer.js          # Etherscan/Tronscan/Blockchair
│   │   ├── defi-analysis.js     # Detecção mixer/bridge/DEX
│   │   ├── onchain-heuristics.js
│   │   ├── chainabuse.js
│   │   └── blocksec.js
│   ├── compliance/
│   │   └── kyc-assessment.js    # Avaliação KYC/AML/regulatório
│   └── reports/
│       └── pdf_generator.py     # Gerador de PDF (reportlab)
├── Dockerfile
└── .env.example
```

## Requisitos

- Node.js >= 18
- Python 3 + reportlab (`pip install reportlab`)
- API keys gratuitas: Etherscan, BscScan, PolygonScan (opcional mas recomendado)

## Licença

MIT
