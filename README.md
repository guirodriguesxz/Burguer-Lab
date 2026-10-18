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

## Roadmap

- [x] Fase 1: API, banco, estoque, máquina de estados, totem integrado
- [x] Fase 2: WebSocket (cozinha em tempo real), painel admin com login/RBAC, relatórios
- [ ] Fase 3: Pix em modo teste com webhook, modo offline (PWA), cupons e upsell
- [ ] Fase 4: testes de integração/E2E, CI, Docker da aplicação e deploy
