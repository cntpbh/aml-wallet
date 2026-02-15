# Propósito AML — Screening Anti-Lavagem v2.5.0

Sistema de screening AML para ativos digitais com registro blockchain.

## Stack
- **Frontend:** HTML/CSS/JS (landing + app)
- **Backend:** Node.js Vercel Serverless Functions
- **PDF:** PDFKit
- **Blockchain:** IBEDIS Token (Polygon + IPFS)
- **Pagamento:** USDT TRC-20 com verificação TronScan

## Deploy (Vercel)
1. Fork ou push para GitHub
2. Conectar ao Vercel
3. Variáveis de ambiente: ver `.env.example`
4. Deploy automático

## Estrutura
```
public/
  index.html        — Landing page corporativa + verificação blockchain
  app.html          — Plataforma de screening (/app)
  logo_dark.png     — Logo Propósito
api/
  screen.js         — Screening endpoint
  report/pdf.js     — Gerador PDF A4
  blockchain/
    register.js     — Registrar relatório na IBEDIS Token
    verify.js       — Verificar relatório (público)
  payment/
    verify.js       — Pagamento USDT TRC-20
  health.js         — Health check
src/
  risk-engine.js    — Motor de risco
  providers/
    flash-detection.js     — Flash USDT (ativo + passivo)
    ibedis-integration.js  — IBEDIS Token API
    payment-verify.js      — Verificação TronScan
    explorer.js            — Blockchain explorers
    ofac.js                — Lista OFAC/SDN
    defi-analysis.js       — DeFi/mixer detection
    onchain-heuristics.js  — Heurísticas on-chain
    external-apis.js       — APIs externas
  compliance/
    kyc-assessment.js      — KYC/EDD/SAR
```

## Endpoints
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/screen?chain=tron&address=T...` | Screening AML |
| POST | `/api/report/pdf` | Gerar PDF |
| POST | `/api/blockchain/register` | Registrar na IBEDIS |
| GET/POST | `/api/blockchain/verify` | Verificar relatório |
| GET | `/api/payment/verify?session=X` | Gerar código pagamento |
| POST | `/api/payment/verify` | Verificar pagamento |

## Redes Suportadas
TRON, Ethereum, BSC, Polygon, Arbitrum, Bitcoin
