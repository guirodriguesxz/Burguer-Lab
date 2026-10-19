import { parseCookies, readToken, sessionCookieOptions } from './cookies'

describe('cookies de sessão', () => {
  it('lê cookies do cabeçalho, com espaços, valores codificados e sinal de igual no valor', () => {
    expect(parseCookies('a=1; bl_session=abc.def.ghi; theme=dark')).toEqual({ a: '1', bl_session: 'abc.def.ghi', theme: 'dark' })
    expect(parseCookies('x=a%20b; y=c=d')).toEqual({ x: 'a b', y: 'c=d' })
    expect(parseCookies(undefined)).toEqual({})
    expect(parseCookies('semvalor; =vazio; ok=1')).toEqual({ ok: '1' })
  })

  it('prefere o Bearer e cai para o cookie', () => {
    expect(readToken({ headers: { authorization: 'Bearer t1', cookie: 'bl_session=t2' } })).toEqual({ token: 't1', via: 'bearer' })
    expect(readToken({ headers: { cookie: 'bl_session=t2' } })).toEqual({ token: 't2', via: 'cookie' })
    expect(readToken({ headers: { authorization: 'Basic xxx' } })).toBeNull()
    expect(readToken({ headers: {} })).toBeNull()
  })

  it('o cookie é HttpOnly e SameSite=Strict; Secure só em produção (ou se configurado)', () => {
    const env = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'production'
      expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'strict', secure: true, path: '/' })
      process.env.NODE_ENV = 'development'
      expect(sessionCookieOptions().secure).toBe(false)
    } finally {
      process.env.NODE_ENV = env
    }
  })
})
