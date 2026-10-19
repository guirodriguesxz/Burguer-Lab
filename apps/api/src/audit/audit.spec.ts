import { diff } from './audit.service'

describe('diff da auditoria', () => {
  it('mostra só os campos que mudaram, com o valor antes e depois', () => {
    const before: Record<string, unknown> = { name: 'Clássico', priceCents: 2490, stock: 10, removable: ['Cebola'], available: true }
    expect(diff(before, { priceCents: 2990, name: 'Clássico', stock: 10 })).toEqual({ priceCents: { de: 2490, para: 2990 } })
    expect(diff(before, { removable: ['Cebola', 'Tomate'], available: false })).toEqual({
      removable: { de: ['Cebola'], para: ['Cebola', 'Tomate'] },
      available: { de: true, para: false },
    })
    expect(diff(before, { stock: null })).toEqual({ stock: { de: 10, para: null } })
  })

  it('não registra nada quando nada mudou', () => {
    expect(diff({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual({})
    expect(diff({ a: 1 }, {})).toEqual({})
  })
})
