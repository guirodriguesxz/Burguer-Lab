/**
 * Origens permitidas (HTTP e WebSocket).
 * - CORS_ORIGIN (lista separada por vírgula) sempre vence.
 * - Produção sem CORS_ORIGIN: nenhuma origem externa (o totem e o admin são servidos pela própria API).
 * - Desenvolvimento/testes: qualquer origem (o Vite roda em outra porta).
 */
export function corsOrigin(): string[] | boolean {
  if (process.env.CORS_ORIGIN) return process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  return process.env.NODE_ENV !== 'production'
}
