import type { CookieOptions, Response } from 'express'

export const SESSION_COOKIE = 'bl_session'
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000

/** Lê os cookies do cabeçalho (sem depender de cookie-parser). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const key = part.slice(0, i).trim()
    const value = part.slice(i + 1).trim()
    if (!key) continue
    try {
      out[key] = decodeURIComponent(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

/**
 * Cookie de sessão: HttpOnly (o JavaScript da página não consegue ler, então um XSS não rouba o token),
 * SameSite=Strict (o navegador não o envia em requisições vindas de outros sites) e Secure em produção.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  }
}

export const setSessionCookie = (res: Response, token: string) => res.cookie(SESSION_COOKIE, token, sessionCookieOptions())

export const clearSessionCookie = (res: Response) => {
  const { maxAge: _maxAge, ...opts } = sessionCookieOptions()
  res.clearCookie(SESSION_COOKIE, opts)
}

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>
}

/** O token pode vir do cookie (navegador) ou de "Authorization: Bearer" (clientes de API e testes). */
export function readToken(req: RequestLike): { token: string; via: 'cookie' | 'bearer' } | null {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return { token: auth.slice(7), via: 'bearer' }
  const cookie = parseCookies(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined)[SESSION_COOKIE]
  return cookie ? { token: cookie, via: 'cookie' } : null
}

/** Valor exigido no cabeçalho X-Requested-With das requisições que alteram dados quando a sessão vem do cookie. */
export const CSRF_HEADER_VALUE = 'XMLHttpRequest'
