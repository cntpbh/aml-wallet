# AML Wallet Screening MVP (HTML + Node/Express)

MVP para triagem de risco AML/KYT de carteira (wallet) com geração de relatório básico consolidado.

## O que faz
- Front-end (HTML) para colar endereço + escolher rede
- Back-end (Node/Express) como proxy de compliance (não expõe chaves)
- Integração opcional com:
  - Chainabuse (reports de scam)
  - Provedor de Risk Score (ex.: Blocksec/MetaSleuth) **placeholder**: ajuste o endpoint conforme seu contrato

## Estrutura
- `public/index.html` — interface
- `server.js` — API `/api/screen`
- `package.json` — dependências e scripts

## Requisitos
- Node.js 18+ (ou 20+)

## Como rodar local
```bash
npm install
npm run dev
```

Abra: http://localhost:3000

## Variáveis de ambiente
Crie um `.env` (ou exporte no shell):

```bash
export CHAINABUSE_API_KEY="sua-chave"
export BLOCKSEC_API_KEY="sua-chave"
```

> Observação: o módulo `BLOCKSEC_API_KEY` está apontando para um endpoint placeholder. Você deve adequar o endpoint e o payload conforme a documentação do seu provedor.

## Publicação no GitHub
```bash
git init
git add .
git commit -m "feat: AML wallet screening MVP"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

## Próximos upgrades (roadmap)
- Exportar relatório em PDF
- Trilha de auditoria (hash do relatório)
- Suporte a múltiplos provedores (plugins)
- Cache e rate limit
- Tela de “evidências” (txs suspeitas, hops, labels)
