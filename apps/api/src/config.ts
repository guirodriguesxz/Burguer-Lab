/**
 * Segredos: em produção é obrigatório configurar (falha ao iniciar, em vez de rodar com um padrão público).
 * Fora de produção usa um valor de desenvolvimento.
 */
export function requireSecret(name: string, devDefault: string): string {
  const value = process.env[name]
  if (value) return value
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Variável de ambiente obrigatória em produção: ${name}`)
  }
  return devDefault
}
