/**
 * Segredos: em produção é obrigatório configurar (falha ao iniciar, em vez de rodar com um padrão público).
 * Fora de produção usa um valor de desenvolvimento.
 */
/** Variável obrigatória (qualquer ambiente): a funcionalidade escolhida não funciona sem ela. */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente obrigatória: ${name}`)
  return value
}

export function requireSecret(name: string, devDefault: string): string {
  const value = process.env[name]
  if (value) return value
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Variável de ambiente obrigatória em produção: ${name}`)
  }
  return devDefault
}
