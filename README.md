# AML Wallet Screening v2.2

Sistema de screening AML/KYT para carteiras crypto com relatório PDF, detecção de mixer/bridge/DEX, avaliação KYC e trilha de auditoria.

## DEPLOY NO VERCEL

### IMPORTANTE: Antes de fazer deploy, garanta que:

1. **NAO existe `server.js` na raiz do repositório** — se existir, DELETE
2. **NAO existe `"type": "module"` no package.json**
3. **NAO existe `Dockerfile` na raiz** — se existir, DELETE

Esses arquivos fazem o Vercel usar o modo "Legacy Server" que NÃO funciona com serverless functions.

### Passo a passo:

```bash
# 1. Clone ou limpe o repositório
cd aml-wallet

# 2. APAGUE arquivos antigos que causam conflito
rm -f server.js Dockerfile

# 3. Copie TODOS os arquivos deste pacote (sobrescreva tudo)
# A estrutura deve ficar EXATAMENTE assim:
#
#   aml-wallet/
#   ├── vercel.json
#   ├── package.json
#   ├── .gitignore
#   ├── api/
#   │   ├── screen.js
#   │   ├── health.js
#   │   └── report/
#   │       └── pdf.js
#   ├── public/
#   │   └── index.html
#   └── src/
#       ├── risk-engine.js
#       ├── providers/
#       │   ├── ofac.js
#       │   ├── explorer.js
#       │   ├── defi-analysis.js
#       │   ├── onchain-heuristics.js
#       │   └── external-apis.js
#       └── compliance/
#           └── kyc-assessment.js

# 4. Commit e push
git add -A
git commit -m "v2.2 serverless - fix deploy"
git push

# 5. O Vercel faz deploy automaticamente
```

### Environment Variables (opcional):
No dashboard do Vercel → Settings → Environment Variables:
- `ETHERSCAN_API_KEY` — [etherscan.io/apis](https://etherscan.io/apis)
- `BSCSCAN_API_KEY` — [bscscan.com/apis](https://bscscan.com/apis)
- `POLYGONSCAN_API_KEY` — [polygonscan.com/apis](https://polygonscan.com/apis)

O sistema funciona **sem nenhuma API key** (OFAC local + heurísticas).

## Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/` | GET | Interface web |
| `/api/screen?chain=ethereum&address=0x...` | GET | Screening (JSON) |
| `/api/report/pdf` | POST | Gerar PDF do resultado |
| `/api/health` | GET | Status |

## Redes suportadas

Ethereum, TRON, BSC, Polygon, Bitcoin
