/**
 * Célula segura de CSV. Valores que começam com = + - @ (ou tab/CR) são interpretados como fórmula pelo
 * Excel/Planilhas ("CSV injection"): recebem um apóstrofo na frente para virarem texto. Aspas, quebras de
 * linha e o separador são escapados conforme o RFC 4180.
 */
export function csvCell(value: unknown, separator = ';'): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(separator)) {
    text = `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** Linha CSV. O padrão é ";" porque o Excel em português usa vírgula como decimal. */
export const csvRow = (cells: unknown[], separator = ';') => cells.map((c) => csvCell(c, separator)).join(separator)

/** Monta o arquivo com BOM UTF-8 (o Excel precisa dele para acentuar certo) e fim de linha CRLF. */
export const csvFile = (rows: unknown[][], separator = ';') => '﻿' + rows.map((r) => csvRow(r, separator)).join('\r\n') + '\r\n'

/** Dinheiro em reais com vírgula, sem símbolo (ex.: 1490 -> "14,90"). */
export const moneyBr = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')
