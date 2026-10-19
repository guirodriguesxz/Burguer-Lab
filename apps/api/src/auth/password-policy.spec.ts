import { checkPassword } from './password-policy'

describe('política de senha', () => {
  it('aceita senha forte', () => {
    expect(checkPassword('lanche-2026-ok')).toEqual({ ok: true })
  })

  it('recusa curta, só letras, só números e maior que 72 bytes', () => {
    expect(checkPassword('abc123').ok).toBe(false)
    expect(checkPassword('somenteletrasaqui').ok).toBe(false)
    expect(checkPassword('1234567890123').ok).toBe(false)
    expect(checkPassword('a1'.repeat(40)).ok).toBe(false) // 80 bytes
  })

  it('recusa senha que contém a parte local do e-mail', () => {
    expect(checkPassword('dono-da-loja-2026', 'dono-da-loja@x.com').ok).toBe(false)
    expect(checkPassword('outra-senha-2026', 'dono-da-loja@x.com').ok).toBe(true)
  })
})
