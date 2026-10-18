import { canTransition } from './order-state'

describe('order state machine', () => {
  it('permite o fluxo feliz', () => {
    expect(canTransition('PAID', 'PREPARING')).toBe(true)
    expect(canTransition('PREPARING', 'READY')).toBe(true)
    expect(canTransition('READY', 'DELIVERED')).toBe(true)
  })
  it('bloqueia pular etapas e sair de estados finais', () => {
    expect(canTransition('PAID', 'READY')).toBe(false)
    expect(canTransition('DELIVERED', 'PREPARING')).toBe(false)
    expect(canTransition('CANCELED', 'PAID')).toBe(false)
  })
  it('não permite cancelar pedido pronto', () => {
    expect(canTransition('READY', 'CANCELED')).toBe(false)
  })
})
