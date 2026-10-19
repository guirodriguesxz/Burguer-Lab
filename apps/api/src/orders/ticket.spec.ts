import { businessDate, businessDayStart } from './ticket'

describe('dia de operação (fuso de São Paulo)', () => {
  it('a virada do dia é à meia-noite de São Paulo, não de UTC', () => {
    expect(businessDate(new Date('2026-10-19T02:59:00Z'))).toBe('2026-10-18') // 23:59 em SP
    expect(businessDate(new Date('2026-10-19T03:00:00Z'))).toBe('2026-10-19') // 00:00 em SP
    expect(businessDate(new Date('2026-10-19T15:00:00Z'))).toBe('2026-10-19')
  })

  it('o início do dia é a meia-noite de São Paulo (03:00 UTC)', () => {
    expect(businessDayStart(new Date('2026-10-19T15:00:00Z')).toISOString()).toBe('2026-10-19T03:00:00.000Z')
    expect(businessDayStart(new Date('2026-10-19T02:00:00Z')).toISOString()).toBe('2026-10-18T03:00:00.000Z')
  })
})
