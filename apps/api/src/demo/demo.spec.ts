import { demoLogins, isDemoMode } from './demo'

describe('modo demonstração', () => {
  it('só liga com DEMO_MODE=true', () => {
    expect(isDemoMode({})).toBe(false)
    expect(isDemoMode({ DEMO_MODE: 'yes' })).toBe(false)
    expect(isDemoMode({ DEMO_MODE: 'true' })).toBe(true)
  })

  it('nunca liga com Pix real, para o simulador não confirmar pagamento sem dinheiro', () => {
    expect(isDemoMode({ DEMO_MODE: 'true', PIX_PROVIDER: 'mercadopago' })).toBe(false)
  })

  it('lê as contas de teste e ignora entradas malformadas', () => {
    const env = { DEMO_MODE: 'true', DEMO_LOGINS: 'Admin|a@x.com|senha1; Cozinha|c@x.com|senha2;quebrada|so-dois' }
    expect(demoLogins(env)).toEqual([
      { label: 'Admin', email: 'a@x.com', password: 'senha1' },
      { label: 'Cozinha', email: 'c@x.com', password: 'senha2' },
    ])
  })

  it('não expõe conta nenhuma fora do modo demo', () => {
    expect(demoLogins({ DEMO_LOGINS: 'Admin|a@x.com|senha1' })).toEqual([])
  })
})
