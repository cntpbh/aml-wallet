# AML Wallet Screening — Vercel Deploy

Sistema de screening AML/KYT para carteiras crypto com relatório PDF, detecção de mixer/bridge/DEX, avaliação KYC e trilha de auditoria.

## Deploy no Vercel (1 minuto)

1. Faça push deste repositório no GitHub
2. Vá em [vercel.com/new](https://vercel.com/new)
3. Importe o repositório
4. Em **Environment Variables**, adicione suas API keys (opcional):
   - `ETHERSCAN_API_KEY`
   - `BSCSCAN_API_KEY`
   - `POLYGONSCAN_API_KEY`
   - `CHAINABUSE_API_KEY` (premium)
   - `BLOCKSEC_API_KEY` (premium)
5. Clique **Deploy**

O sistema funciona **sem nenhuma API key** (usa OFAC local + heurísticas on-chain). As keys só melhoram a cobertura.

## Estrutura (Vercel Serverless)

```
├── vercel.json              # Configuração de rotas
├── api/
│   ├── screen.js            # GET /api/screen?chain=...&address=...
│   ├── health.js            # GET /api/health
│   └── report/
│       └── pdf.js           # POST /api/report/pdf (gera PDF)
├── public/
│   └── index.html           # Interface web (servida como static)
└── src/
    ├── risk-engine.js        # Motor de risco
    ├── providers/
    │   ├── ofac.js           # Lista OFAC/SDN
    │   ├── explorer.js       # Etherscan/Tronscan/Blockchair
    │   ├── defi-analysis.js  # Detecção mixer/bridge/DEX
    │   ├── onchain-heuristics.js
    │   └── external-apis.js  # Chainabuse + Blocksec
    └── compliance/
        └── kyc-assessment.js # Avaliação KYC/AML/regulatório
```

## O que detecta

- **Tornado Cash / Railgun / Aztec** (CRITICAL — sancionado OFAC)
- **Bridges** (Wormhole, Stargate, Synapse, Across, THORChain, etc.)
- **DEXs** (Uniswap, 1inch, PancakeSwap, SushiSwap, Curve, 0x)
- **Padrão combinado** (Mixer + Bridge + DEX = ofuscação)
- **Saltos opacos** (intermediários não identificados)
- **Wallet nova** (< 7 dias)
- **Relay wallet** (saldo zero + muitas transações)
- **Concentração** de stablecoins ou counterparties

## Relatório PDF inclui

1. KYC obrigatório + documentos exigidos
2. AML/KYT ativo + cobertura
3. Cooperação regulatória (BACEN/COAF/FATF/OFAC)
4. Trilha de auditoria com hash
5. Monitoramento on-chain
6. Score de transparência / prova de reservas

## Redes suportadas

Ethereum, TRON (USDT-TRC20), BSC, Polygon, Bitcoin
