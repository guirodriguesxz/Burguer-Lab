# Burger Lab — Totem de autoatendimento

Projeto de portfólio: simulação de um totem de autoatendimento para lanchonete, com painel de cozinha em tempo real.

## Fluxo

1. **Boas-vindas**: comer aqui ou levar
2. **Cardápio**: categorias, produtos e carrinho lateral
3. **Personalização**: remover ingredientes, adicionais e quantidade
4. **Pagamento** (simulado): Pix ou cartão
5. **Senha do pedido**, com retorno automático à tela inicial
6. **Painel da cozinha** (`#/cozinha`): Preparando → Pronto → Entregue, sincronizado entre abas

## Decisões de projeto

- **UX de totem**: alvos de toque grandes (≥ 56px), sem hover, seleção de texto desativada, foco visível e `aria-label` nos controles.
- **Timeout de inatividade**: 60s sem toque limpa o carrinho e volta ao início.
- **Estado**: `useReducer` para o carrinho; pedidos em `localStorage` com sincronização entre abas via evento `storage` (simula o backend).
- **Tipagem**: TypeScript estrito, modelo de domínio em `src/lib/types.ts`.

## Rodando

```bash
npm install
npm run dev
```

Abra o totem em `/` e o painel da cozinha em `/#/cozinha` em outra aba.

## Próximos passos

- API real (Node + banco) e WebSocket no lugar do `localStorage`
- Integração de pagamento (Pix/maquininha)
- Painel de senhas chamadas para o cliente
- Testes (Vitest + Testing Library) e E2E (Playwright)
- i18n e modo alto contraste
