# Burger Lab: sistema de autoatendimento

Monorepo full-stack de um totem de autoatendimento para lanchonete, com API, banco relacional e painel de cozinha.

## Arquitetura

| Pacote | Descrição |
| --- | --- |
| `apps/kiosk` | Totem (React + TypeScript + Vite) e tela da cozinha em `#/cozinha` |
| `apps/api` | API REST (NestJS + Prisma + PostgreSQL) |

### Decisões de projeto

- **Preço sempre calculado no servidor**: o cliente envia só IDs e quantidades; valores em centavos (inteiros).
- **Máquina de estados do pedido** (`PAID → PREPARING → READY → DELIVERED`, com cancelamento nas etapas iniciais), com transições inválidas rejeitadas (409) e histórico em `OrderEvent`.
- **Estoque transacional**: baixa condicional na mesma transação do pedido, evitando venda de item esgotado em pedidos concorrentes.
- **Idempotência**: cabeçalho `Idempotency-Key` impede pedido duplicado em retentativas.
- **Validação de entrada** com Zod.
- **UX de totem**: alvos grandes, timeout de inatividade, itens esgotados desabilitados.

## Rodando

```bash
npm install

# 1. Banco (escolha um)
npm run db:up                           # Docker (docker-compose.yml)
npm run db:local -w @burger-lab/api     # Postgres embutido, sem Docker

# 2. Migração e seed (uma vez)
cd apps/api && npx prisma migrate dev && npx prisma db seed

# 3. API (http://localhost:3000/api) e totem (http://localhost:5173)
npm run dev:api
npm run dev:kiosk
```

Testes da API: `npm test -w @burger-lab/api`.

## Roadmap

- [x] Fase 1: API, banco, estoque, máquina de estados, totem integrado
- [ ] Fase 2: WebSocket (cozinha em tempo real), painel admin com login/RBAC, relatórios
- [ ] Fase 3: Pix em modo teste com webhook, modo offline (PWA), cupons e upsell
- [ ] Fase 4: testes de integração/E2E, CI, Docker da aplicação e deploy
