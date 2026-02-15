# AML Wallet Screening (Vercel-ready)

Projeto pronto para Vercel (estático + Serverless Functions).

## Estrutura
- `index.html` (raiz) + `assets/` (sem scripts inline — compatível com CSP mais restritivo)
- `api/screen.js` triagem AML (Chainabuse + provedor plugável)
- `api/profile.js` perfil on-chain (EVM via explorers; BTC via Blockstream; TRON via TronGrid)

## Deploy na Vercel
1. Suba para o GitHub
2. Vercel > New Project > Import
3. Configure Environment Variables:

### (Opcional) Scam reports
- CHAINABUSE_API_KEY

### (Opcional) Risk score provider (TRM/Chainalysis/Blocksec etc.)
- AML_PROVIDER_URL
- AML_PROVIDER_API_KEY

### (Opcional) Explorers (EVM)
- ETHERSCAN_API_KEY
- BSCSCAN_API_KEY
- POLYGONSCAN_API_KEY

### (Opcional) TRON
- TRONGRID_API_KEY

## Rotas
- / -> UI
- /api/screen?chain=ethereum&address=0x...
- /api/profile?chain=ethereum&address=0x...

## Roadmap recomendado (produção)
- Cache por (chain,address) 30–120s
- Rate limit por IP
- Export PDF e hash do relatório (cadeia de custódia)
- Plugin de provedores KYT/AML + regras por política interna
