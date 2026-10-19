// Teste do dicionário (sem DOM): garante que os dois idiomas estão completos e coerentes.
import { describe, expect, it } from 'vitest'
import { friendlyError, pick, translate } from './i18n'

describe('i18n do totem', () => {
  it('substitui variáveis e mantém a chave visível quando falta valor', () => {
    expect(translate('pt', 'menu.total', { n: 3 })).toBe('Total (3)')
    expect(translate('en', 'pay.couponApplied', { code: 'ABC', amount: 'R$ 5,00' })).toBe('Coupon ABC applied: −R$ 5,00')
    expect(translate('en', 'menu.total')).toBe('Total ({n})') // não some em silêncio
  })

  it('cada mensagem tem as mesmas variáveis nos dois idiomas', () => {
    // Importa o dicionário pelas traduções de uma amostra grande de chaves com variáveis.
    const keys = ['menu.total', 'menu.without', 'menu.live.many', 'custom.title', 'custom.add', 'pay.couponApplied', 'pay.couponMin', 'pay.subtotal', 'pay.pixScan', 'pay.pixExpires', 'done.cashNote', 'done.new', 'print.total', 'banner.queued'] as const
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const k of keys) expect(vars(translate('en', k))).toEqual(vars(translate('pt', k)))
  })

  it('texto do cardápio cai para o português quando não há tradução', () => {
    expect(pick('en', 'Clássico', 'Classic')).toBe('Classic')
    expect(pick('en', 'Clássico', null)).toBe('Clássico')
    expect(pick('en', 'Clássico', '')).toBe('Clássico')
    expect(pick('pt', 'Clássico', 'Classic')).toBe('Clássico')
  })

  it('erro do servidor: em português mostra o texto dele; em inglês, uma mensagem genérica pelo tipo', () => {
    const t = (k: Parameters<typeof translate>[1]) => translate('en', k)
    const conflict = Object.assign(new Error('Estoque insuficiente de Brownie'), { status: 409 })
    expect(friendlyError(conflict, 'pt', t, 'x')).toBe('Estoque insuficiente de Brownie')
    expect(friendlyError(conflict, 'en', t, 'x')).toBe(translate('en', 'err.unavailable'))
    expect(friendlyError(Object.assign(new Error('x'), { status: 429 }), 'en', t, 'x')).toBe(translate('en', 'err.slow'))
    expect(friendlyError(new Error('rede'), 'en', t, 'x')).toBe(translate('en', 'err.generic'))
    expect(friendlyError('qualquer', 'pt', t, 'padrão')).toBe('padrão')
  })
})
