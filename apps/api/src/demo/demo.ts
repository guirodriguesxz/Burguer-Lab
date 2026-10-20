/**
 * Modo demonstração (vitrine do portfólio): com DEMO_MODE=true o simulador de Pix funciona também em produção
 * e a tela de login da equipe mostra contas de teste. Nunca vale com um provedor Pix real: o simulador
 * confirmaria pagamentos sem dinheiro.
 */
export interface DemoLogin {
  label: string
  email: string
  password: string
}

export function isDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEMO_MODE === 'true' && env.PIX_PROVIDER !== 'mercadopago'
}

/** DEMO_LOGINS="Admin|admin@x.com|senha;Cozinha|cozinha@x.com|senha" */
export function demoLogins(env: NodeJS.ProcessEnv = process.env): DemoLogin[] {
  if (!isDemoMode(env)) return []
  return (env.DEMO_LOGINS ?? '')
    .split(';')
    .map((entry) => entry.split('|').map((p) => p.trim()))
    .filter((p) => p.length === 3 && p.every(Boolean))
    .map(([label, email, password]) => ({ label, email, password }))
}
