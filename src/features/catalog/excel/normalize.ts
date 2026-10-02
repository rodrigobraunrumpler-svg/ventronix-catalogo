import { tz } from '@date-fns/tz'
import { format } from 'date-fns'
import type { CellValue } from 'exceljs'
import type { ImportColumn } from '../import/types'
import { unitPriceSchema } from '../money'

// Lo que hay en una celda, sin las variantes de ExcelJS (spec del Excel §9.3). Es la principal
// fuente de errores al importar: cada tipo tiene su regla.
export type Cell =
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'date'; value: Date }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'error'; message: string; shown: string }

// Una fila del archivo, con las celdas de las columnas que entendemos.
export type ReadRow = { line: number; cells: Partial<Record<ImportColumn, Cell>> }

export const EMPTY_CELL: Cell = { kind: 'empty' }

export function readCell(value: CellValue | undefined): Cell {
  if (value === null || value === undefined) return EMPTY_CELL
  if (typeof value === 'string')
    return cleanLine(value) === '' ? EMPTY_CELL : { kind: 'text', value }
  if (typeof value === 'number') return { kind: 'number', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (value instanceof Date) return { kind: 'date', value }
  if ('richText' in value) return readCell(value.richText.map((part) => part.text).join(''))
  if ('error' in value) {
    const shown = String(value.error)
    return { kind: 'error', message: `La celda tiene un error de Excel (${shown}).`, shown }
  }
  if ('formula' in value || 'sharedFormula' in value) {
    if (value.result === undefined) {
      return {
        kind: 'error',
        message: 'Fórmula sin calcular. Abre el archivo en Excel y guárdalo de nuevo.',
        shown: '',
      }
    }
    return readCell(value.result)
  }
  if ('hyperlink' in value) return readCell(value.text as CellValue)
  return EMPTY_CELL
}

// Caracteres invisibles que llegan al copiar de una web o un PDF: «LAP-001\u200b» se vería igual que
// «LAP-001» y crearía otro producto. Las tildes se unen a su letra (NFC), como al escribirlas.
const invisible = (text: string) =>
  text.normalize('NFC').replace(/[\u200b-\u200d\u2060\ufeff]/g, '')

// Espacios no separables y repetidos a uno, sin espacios en los extremos; los saltos de línea pasan
// a espacio. Para código, nombre y categoría.
export const cleanLine = (text: string) => invisible(text).replace(/\s+/g, ' ').trim()

// La descripción conserva sus saltos de línea.
export const cleanText = (text: string) =>
  invisible(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .trim()

export type Parsed = { ok: true; value: string } | { ok: false; error: string }

// Excel guarda las fechas como días en UTC: se escriben en UTC para no correr el día.
const utc = tz('UTC')

// Texto de una celda para código, nombre, descripción o categoría. Un número entero se escribe sin
// notación científica: 123456789012 → «123456789012».
export function cellText(
  cell: Cell,
  options: { multiline?: boolean; integerOnly?: boolean } = {},
): Parsed {
  switch (cell.kind) {
    case 'empty':
      return { ok: true, value: '' }
    case 'text':
      return { ok: true, value: options.multiline ? cleanText(cell.value) : cleanLine(cell.value) }
    case 'number':
      if (Number.isInteger(cell.value)) return { ok: true, value: cell.value.toFixed(0) }
      return options.integerOnly
        ? { ok: false, error: 'No puede tener decimales. Escríbelo como texto.' }
        : { ok: true, value: String(cell.value) }
    case 'date':
      return { ok: true, value: format(cell.value, 'dd/MM/yyyy', { in: utc }) }
    case 'boolean':
      return { ok: true, value: cell.value ? 'VERDADERO' : 'FALSO' }
    case 'error':
      return { ok: false, error: cell.message }
  }
}

// «S/ 1,250.50», «1.250,50», «1250,5» → «1250.50» (spec §9.3). Con los dos separadores, el último es
// el decimal; con uno solo seguido de exactamente 3 dígitos, es de miles.
export function priceText(text: string) {
  const value = text.replace(/S\/\.?/gi, '').replace(/\s+/g, '')
  const dot = value.lastIndexOf('.')
  const comma = value.lastIndexOf(',')
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? '.' : ','
    return value
      .split(decimal === '.' ? ',' : '.')
      .join('')
      .replace(decimal, '.')
  }
  if (dot < 0 && comma < 0) return value
  const parts = value.split(dot >= 0 ? '.' : ',')
  return parts.length > 2 || parts.at(-1)?.length === 3 ? parts.join('') : parts.join('.')
}

// La regla del formulario (unitPriceSchema), con mensajes claros para los casos más comunes. Van
// tras «Precio: », así que no repiten «El precio».
export function checkPrice(text: string): Parsed {
  if (text.startsWith('-') || /^0+(?:[.,]0+)?$/.test(text)) {
    return { ok: false, error: 'Debe ser mayor que cero.' }
  }
  if (/^\d{11,}/.test(text)) return { ok: false, error: 'No puede pasar de 9,999,999,999.99.' }
  const parsed = unitPriceSchema.safeParse(text)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: parsed.error.issues[0].message }
}

// Precio de una celda, con dos decimales; '' si está vacía.
export function cellPrice(cell: Cell): Parsed {
  switch (cell.kind) {
    case 'empty':
      return { ok: true, value: '' }
    case 'number': {
      // 1299.8999999 es un resto de coma flotante y vale 1299.90; con más decimales de verdad, error.
      const rounded = Math.round(cell.value * 100) / 100
      if (Math.abs(cell.value - rounded) >= 0.000001) {
        return { ok: false, error: 'Tiene más de dos decimales.' }
      }
      return checkPrice(rounded.toFixed(2))
    }
    case 'text':
      return checkPrice(priceText(cell.value))
    case 'error':
      return { ok: false, error: cell.message }
    default:
      return { ok: false, error: 'Escribe el precio como número, por ejemplo 1250.50.' }
  }
}
