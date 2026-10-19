import { defineConfig } from '@playwright/test'

export const PORT = 3100
export const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://burger:burger@localhost:5432/burgerlab_e2e?schema=public'

// O E2E roda contra o artefato de produção: a API compilada servindo totem e admin compilados.
// Antes: `npm run build` (front-ends + API).
export default defineConfig({
  testDir: './tests',
  // Um banco compartilhado: os testes rodam em sequência.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Usa um navegador já instalado (no GitHub Actions o Chrome vem nas imagens), sem baixar nada.
    // Localmente dá para trocar: E2E_CHANNEL=msedge (o Edge já vem no Windows).
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    locale: 'pt-BR',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node support/start-server.mjs',
    url: `http://localhost:${PORT}/api/menu`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: E2E_DB,
      PORT: String(PORT),
      NODE_ENV: 'test',
      JWT_SECRET: 'e2e-jwt-secret',
      PIX_WEBHOOK_SECRET: 'e2e-webhook-secret',
      LOGIN_RATE_LIMIT: '1000',
      RATE_LIMIT: '100000',
    },
  },
})
