import type * as Sentry from '@sentry/node'
import { initSentry, scrubSentryEvent } from './error-reporter'

describe('scrubSentryEvent', () => {
  const event = (): Sentry.ErrorEvent =>
    ({
      type: undefined,
      message: 'boom',
      server_name: 'maquina-do-dono',
      user: { id: 'u1', email: 'maria@loja.com', username: 'maria', ip_address: '1.2.3.4' },
      request: {
        url: 'https://loja.com/api/orders?reset=tok123',
        method: 'POST',
        headers: { authorization: 'Bearer x', cookie: 'bl_session=y' },
        cookies: { bl_session: 'y' },
        data: { password: 'senha' },
        query_string: 'reset=tok123',
      },
    }) as Sentry.ErrorEvent

  it('remove cabeçalhos, cookies, corpo, query string e dados pessoais; mantém só o id do usuário', () => {
    const out = scrubSentryEvent(event())
    expect(out.request).toEqual({ url: 'https://loja.com/api/orders', method: 'POST' })
    expect(out.user).toEqual({ id: 'u1' })
    expect(out.server_name).toBeUndefined()
    expect(JSON.stringify(out)).not.toMatch(/maria|senha|bl_session|Bearer|tok123|1\.2\.3\.4|maquina/)
    expect(out.message).toBe('boom')
  })

  it('aceita evento sem request nem usuário, e usuário anônimo some', () => {
    expect(scrubSentryEvent({ message: 'x' } as Sentry.ErrorEvent)).toEqual({ message: 'x' })
    expect(scrubSentryEvent({ user: { email: 'a@b.com' } } as Sentry.ErrorEvent).user).toBeUndefined()
  })
})

describe('initSentry', () => {
  it('sem SENTRY_DSN não faz nada (nada sai da aplicação)', () => {
    expect(initSentry({} as NodeJS.ProcessEnv)).toBe(false)
  })
})
