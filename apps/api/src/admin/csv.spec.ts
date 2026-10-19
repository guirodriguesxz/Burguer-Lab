import { csvCell, csvFile, csvRow, moneyBr } from './csv'

describe('csv', () => {
  it('escapa separador, aspas e quebras de linha', () => {
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""')
    expect(csvCell('linha1\nlinha2')).toBe('"linha1\nlinha2"')
    expect(csvCell('simples')).toBe('simples')
    expect(csvCell(null)).toBe('')
    expect(csvCell(42)).toBe('42')
  })

  it('neutraliza fórmulas (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+55 11 9999')).toBe("'+55 11 9999")
    expect(csvCell('-1+1')).toBe("'-1+1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\t=1')).toBe("'\t=1")
    expect(csvCell('café com leite')).toBe('café com leite') // texto normal não é alterado
  })

  it('monta linhas, arquivo com BOM e dinheiro em formato brasileiro', () => {
    expect(csvRow(['a', 'b;c', 3])).toBe('a;"b;c";3')
    const file = csvFile([['x', 'y'], [1, 2]])
    expect(file.startsWith('﻿')).toBe(true)
    expect(file).toBe('﻿x;y\r\n1;2\r\n')
    expect(moneyBr(1490)).toBe('14,90')
    expect(moneyBr(5)).toBe('0,05')
  })
})
