# Burger Lab: sistema de autoatendimento

Monorepo full-stack de um totem de autoatendimento para lanchonete, com API, banco relacional e painel de cozinha.

## Arquitetura

| Pacote | Descrição |
| --- | --- |
| `apps/kiosk` | Totem do cliente (React + TypeScript + Vite), porta 5173 |
| `apps/admin` | App da equipe: login, cozinha ao vivo (KDS), cardápio/estoque e relatórios, porta 5174 |
| `apps/api` | API REST + WebSocket (NestJS + Prisma + PostgreSQL), porta 3000 |

Usuários de desenvolvimento (criados pelo seed): `admin@burgerlab.dev` / `admin123` e `cozinha@burgerlab.dev` / `cozinha123`.

### Decisões de projeto

- **Preço sempre calculado no servidor**: o cliente envia só IDs e quantidades; valores em centavos (inteiros).
- **Máquina de estados do pedido** (`PAID → PREPARING → READY → DELIVERED`, com cancelamento nas etapas iniciais), com transições inválidas rejeitadas (409) e histórico em `OrderEvent`.
- **Estoque transacional**: baixa condicional na mesma transação do pedido, evitando venda de item esgotado em pedidos concorrentes.
- **Idempotência**: cabeçalho `Idempotency-Key` impede pedido duplicado em retentativas.
- **Validação de entrada** com Zod.
- **Tempo real (Socket.IO)**: pedidos novos e mudanças de status chegam à cozinha sem polling; o handshake autentica o JWT e só staff entra na sala `staff`. Ao reconectar, a cozinha ressincroniza via REST. O totem recebe `menu:changed` e atualiza estoque/preço/pausa na hora.
- **Autenticação e RBAC**: JWT (8h) + guard com papéis `ADMIN` e `KITCHEN`; senhas com bcrypt; mensagem de login única para não revelar e-mails existentes.
- **Relatórios em SQL**: faturamento, ticket médio, pedidos por hora e mais vendidos, com fuso `America/Sao_Paulo`.
- **Pix com webhook** (provedor simulado atrás de uma interface `PixProvider`, trocável por um PSP real): o pedido Pix nasce `CREATED` com cobrança `PENDING` e só chega à cozinha quando o webhook confirma. O webhook valida assinatura HMAC-SHA256 sobre o corpo bruto (comparação em tempo constante), confere o valor e é idempotente. Cobranças não pagas expiram (5 min), cancelam o pedido e devolvem estoque e uso de cupom; webhook tardio em cobrança expirada é recusado (409). Em dev, `POST /api/dev/pix/:txid/pay` faz o papel do banco.
- **Cupons**: regras puras e testadas (`coupon-rules.ts`); a prévia no totem não consome o cupom, e o uso é reservado de forma atômica (`UPDATE ... WHERE usedCount < maxUses`) ao criar o pedido, então dois pedidos simultâneos não passam do limite.
- **Upsell orientado por dados**: para cada categoria complementar que falta no carrinho (bebida, acompanhamento, sobremesa), sugere o item disponível mais vendido nos últimos 30 dias.
- **Offline (PWA)**: service worker guarda o app shell; o cardápio tem cópia local; sem internet o Pix e o cupom ficam indisponíveis e pedidos no cartão entram numa fila local com `Idempotency-Key` e código curto (`clientRef`, exibido ao cliente e no cartão da cozinha). Ao voltar a conexão a fila sincroniza sem duplicar; recusas do servidor (ex.: estoque esgotado) saem da fila e ficam registradas. Limitação conhecida: vendas offline podem esgotar estoque que o totem ainda não sabia.
- **UX de totem**: alvos grandes, timeout de inatividade, itens esgotados desabilitados.

## Rodando

```bash
npm install

# 1. Banco (escolha um)
npm run db:up                           # Docker (docker-compose.yml)
npm run db:local -w @burger-lab/api     # Postgres embutido, sem Docker

# 2. Migração e seed (uma vez)
cd apps/api && npx prisma migrate dev && npx prisma db seed

# 3. API, totem e app da equipe (em terminais separados)
npm run dev:api     # http://localhost:3000/api
npm run dev:kiosk   # http://localhost:5173
npm run dev:admin   # http://localhost:5174
```

Testes da API: `npm test -w @burger-lab/api`.

Variáveis opcionais da API: `JWT_SECRET`, `PIX_WEBHOOK_SECRET`, `PIX_TTL_SECONDS` (padrão 300). Cupons de exemplo do seed: `BEMVINDO10`, `LANCHE5` (mínimo R$ 30), `ULTIMO` (1 uso).

PWA: `npm run build -w @burger-lab/kiosk && npm run preview -w @burger-lab/kiosk` (o service worker só é ativo no build).

## Roadmap

- [x] Fase 1: API, banco, estoque, máquina de estados, totem integrado
- [x] Fase 2: WebSocket (cozinha em tempo real), painel admin com login/RBAC, relatórios
- [x] Fase 3: Pix em modo teste com webhook, modo offline (PWA), cupons e upsell
- [ ] Fase 4: testes de integração/E2E, CI, Docker da aplicação e deploy
