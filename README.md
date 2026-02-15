# AML Wallet Screening — Sistema de Compliance Cripto

Sistema de screening AML (Anti-Money Laundering) para carteiras de criptomoedas. Consulta múltiplas fontes de inteligência e gera relatórios de risco consolidados.

## Redes Suportadas

| Rede | Tokens | Explorer |
|------|--------|----------|
| Ethereum | ETH, USDT, USDC (ERC-20) | Etherscan |
| TRON | TRX, USDT (TRC-20) | Tronscan |
| BSC | BNB, USDT (BEP-20) | BscScan |
| Polygon | MATIC, USDT | PolygonScan |
| Bitcoin | BTC | Blockchair |

## Fontes de Risco

| Fonte | Tipo | Custo | Descrição |
|-------|------|-------|-----------|
| **OFAC/SDN** | Sanções | Gratuito | Lista de endereços sancionados pelo governo dos EUA |
| **On-Chain Heuristics** | Análise local | Gratuito | Detecta padrões suspeitos (carteira nova, relay, bot, etc.) |
| **Etherscan/BscScan/PolygonScan** | Dados on-chain | Free tier | Saldo, transações, tokens, idade da carteira |
| **Blockchair** | Bitcoin data | Free tier | Dados on-chain de BTC |
| **Tronscan** | TRON data | Gratuito | Dados on-chain de TRX/TRC-20 |
| **Chainabuse** | Scam reports | Free/Premium | Base de denúncias de golpes e abusos |
| **Blocksec/MetaSleuth** | Risk Score | Premium | Score de risco profissional (0-100) |

## Instalação

### Requisitos
- Node.js >= 18

### Setup

```bash
# Clone o repositório
git clone https://github.com/SEU-USUARIO/aml-wallet-screening.git
cd aml-wallet-screening

# Instale dependências
npm install

# Configure suas API keys
cp .env.example .env
# Edite .env com suas chaves

# (Opcional) Baixe a lista OFAC atualizada
npm run update-ofac

# Inicie o servidor
npm start
```

Acesse: `http://localhost:3000`

### API Keys (como obter)

**Gratuitas (recomendado configurar):**
- **Etherscan**: Crie conta em [etherscan.io](https://etherscan.io/apis) → My API Keys → Add
- **BscScan**: Crie conta em [bscscan.com](https://bscscan.com/apis) → My API Keys → Add
- **PolygonScan**: Crie conta em [polygonscan.com](https://polygonscan.com/apis) → My API Keys → Add

**Premium (opcional, melhora precisão):**
- **Chainabuse**: Solicite acesso em [chainabuse.com](https://docs.chainabuse.com)
- **Blocksec/MetaSleuth**: Planos em [blocksec.com](https://docs.metasleuth.io)

## Uso

### Via Interface Web

1. Selecione a rede (Ethereum, TRON, BSC, Polygon, Bitcoin)
2. Cole o endereço da carteira
3. Clique em "Analisar Risco"
4. O relatório mostra: nível de risco, findings, dados on-chain, fontes consultadas

### Via API

```bash
# Screening de carteira
curl "http://localhost:3000/api/screen?chain=ethereum&address=0x..."

# Health check (verifica quais providers estão ativos)
curl "http://localhost:3000/api/health"
```

### Resposta da API

```json
{
  "report": {
    "id": "AML-M4X5K2-ABC123",
    "timestamp": "2025-06-15T14:30:00.000Z",
    "input": { "chain": "ethereum", "address": "0x..." },
    "decision": {
      "level": "HIGH",
      "score": 70,
      "recommendation": "REVIEW",
      "summary": "Indicador de alto risco detectado. Requer revisão manual (EDD)."
    },
    "findings": [
      {
        "source": "On-Chain Heuristics",
        "severity": "HIGH",
        "detail": "Carteira muito nova (criada há 3 dia(s))."
      }
    ],
    "sources": { ... },
    "disclaimer": "Screening automatizado (MVP). ..."
  }
}
```

## Níveis de Risco

| Nível | Score | Recomendação | Ação |
|-------|-------|-------------|------|
| LOW | 0-30 | APPROVE | Prosseguir com a operação |
| MEDIUM | 31-60 | REVIEW | Solicitar documentos adicionais (CDD/EDD) |
| HIGH | 61-85 | REVIEW/BLOCK | Revisão manual obrigatória |
| CRITICAL | 100 | BLOCK | Endereço sancionado — operação PROIBIDA |

## Heurísticas On-Chain

O sistema analisa automaticamente (sem API externa):

- **Idade da carteira** — carteiras < 7 dias = alto risco
- **Volume de transações** — > 50 tx/dia = possível bot/mixer
- **Proporção de stablecoins** — > 90% stablecoin = padrão OTC/P2P
- **Saldo vs histórico** — saldo zero + muitas txs = relay wallet
- **Concentração** — poucos counterparties = suspeito
- **Interações com contratos** — alto % = uso intenso DeFi
- **Reativação dormant** — carteira antiga com poucas txs recentes

## Deploy

### Railway / Render / Fly.io

```bash
# Configure variáveis de ambiente no dashboard do provedor
# Deploy direto do GitHub
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## Estrutura do Projeto

```
aml-wallet-screening/
├── server.js                          # Express server + API routes
├── package.json
├── .env.example                       # Template de configuração
├── public/
│   └── index.html                     # Interface web
├── src/
│   ├── risk-engine.js                 # Motor de risco consolidado
│   ├── providers/
│   │   ├── ofac.js                    # Verificação OFAC/SDN
│   │   ├── explorer.js                # Etherscan/BscScan/PolygonScan/Blockchair/Tronscan
│   │   ├── chainabuse.js              # Base de scam reports
│   │   ├── blocksec.js                # Risk Score API
│   │   └── onchain-heuristics.js      # Análise heurística local
│   └── utils/
│       └── update-ofac.js             # Atualiza lista OFAC
└── data/
    └── sdn_list.json                  # Lista OFAC (gerada pelo update-ofac)
```

## Limitações

- **Sem API de KYT**: screening parcial (sanções + scams + heurísticas). Score completo requer Chainalysis/TRM/Blocksec.
- **Rate limits**: APIs gratuitas têm limites (Etherscan: 5 req/s, Blockchair: 30 req/min).
- **Falsos positivos**: heurísticas podem flagrar carteiras legítimas (exchanges, DeFi power users).
- **Cobertura**: não cobre todas as chains (Solana, Avalanche, etc. podem ser adicionadas).

## Licença

MIT
