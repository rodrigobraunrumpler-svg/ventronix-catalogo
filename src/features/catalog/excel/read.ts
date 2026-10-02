import 'server-only'
import ExcelJS from 'exceljs'
import { FILE_MESSAGES, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '../import/options'
import { IMPORT_COLUMNS, type ImportColumn } from '../import/types'
import { priceColumns } from '../price-columns'
import { readCell, type ReadRow } from './normalize'

// derivedPrice: el título de «Valor sin IGV (S/)» si el archivo lo trae; no se importa.
export type ReadSheet = {
  sheetName: string
  columns: ImportColumn[]
  rows: ReadRow[]
  derivedPrice: string | null
}
export type ReadResult = { ok: true; sheet: ReadSheet } | { ok: false; message: string }

// «Código», «CÓDIGO », «codigo:» → «codigo».
export const headerKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/:$/, '')

// Títulos aceptados, sin tildes ni mayúsculas (spec §9.2). «Valor sin IGV» del reporte no es un
// precio: no está en la lista. El título del precio del catálogo se añade según TAX_CONFIG.
const ALIASES: Record<ImportColumn, string[]> = {
  code: ['codigo', 'cod', 'cod.', 'sku', 'codigo del producto'],
  name: ['nombre', 'producto', 'nombre del producto'],
  description: ['descripcion'],
  category: ['categoria'],
  price: [
    'precio',
    'precio (s/)',
    'precio unitario',
    'precio unitario (s/)',
    'precio con igv',
    'precio con igv (s/)',
    headerKey(priceColumns().catalog),
  ],
}

const COLUMN_BY_TITLE = new Map<string, ImportColumn>(
  IMPORT_COLUMNS.flatMap((column) => ALIASES[column].map((title) => [title, column] as const)),
)

// La otra columna de precio del reporte («Valor sin IGV (S/)») no se importa: se recuerda para avisar.
const derivedLabel = priceColumns().derived?.label
const DERIVED_KEY = derivedLabel ? headerKey(derivedLabel) : null

// Hojas que nunca traen productos para importar (spec §9.2).
const RESERVED = new Set([
  'instrucciones',
  'categorias',
  'resumen',
  'resumen por categoria',
  'cambios',
])
const PRICE_LIST = 'lista de precios'
const HEADER_SCAN = 20
const ZIP = [0x50, 0x4b, 0x03, 0x04]
// Un .xlsx con contraseña (y un .xls) es un archivo OLE, no un ZIP.
const OLE = [0xd0, 0xcf, 0x11, 0xe0]

type Header = { row: number; positions: Map<ImportColumn, number>; derived: string | null }

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, index) => bytes[index] === byte)

// Fila de títulos: la primera de las 20 primeras con al menos dos columnas conocidas. Sirve para la
// plantilla (fila 1), el reporte (fila 8) y la hoja «Para revertir» del comprobante (fila 4).
function findHeader(sheet: ExcelJS.Worksheet): Header | null {
  for (let row = 1; row <= Math.min(HEADER_SCAN, sheet.rowCount); row++) {
    const positions = new Map<ImportColumn, number>()
    let derived: string | null = null
    sheet.getRow(row).eachCell((cell, column) => {
      const key = headerKey(cell.text ?? '')
      const known = COLUMN_BY_TITLE.get(key)
      if (known && !positions.has(known)) positions.set(known, column)
      if (key === DERIVED_KEY) derived = cell.text.trim()
    })
    if (positions.size >= 2) return { row, positions, derived }
  }
  return null
}

// Filas bajo los títulos; las vacías se ignoran y no cuentan (spec §9.4).
function readRows(sheet: ExcelJS.Worksheet, header: Header): ReadResult {
  const columns = IMPORT_COLUMNS.filter((column) => header.positions.has(column))
  const rows: ReadRow[] = []
  let tooMany = false
  sheet.eachRow((row, line) => {
    if (line <= header.row || tooMany) return
    const cells: ReadRow['cells'] = {}
    let empty = true
    for (const [column, position] of header.positions) {
      const cell = readCell(row.getCell(position).value)
      cells[column] = cell
      if (cell.kind !== 'empty') empty = false
    }
    if (empty) return
    if (rows.length === IMPORT_MAX_ROWS) tooMany = true
    else rows.push({ line, cells })
  })
  if (tooMany) return { ok: false, message: FILE_MESSAGES.tooManyRows }
  if (rows.length === 0) return { ok: false, message: FILE_MESSAGES.empty }
  return {
    ok: true,
    sheet: { sheetName: sheet.name, columns, rows, derivedPrice: header.derived },
  }
}

// Lee el .xlsx de la carga masiva: la primera hoja con títulos conocidos, sin las reservadas
// (spec §9.2 y §11). Tamaño, extensión y firma se comprueban otra vez aquí, en el servidor.
export async function readImportFile(data: ArrayBuffer, fileName: string): Promise<ReadResult> {
  const fail = (message: string): ReadResult => ({ ok: false, message })
  if (!fileName.toLowerCase().endsWith('.xlsx')) return fail(FILE_MESSAGES.notXlsx)
  if (data.byteLength > IMPORT_MAX_BYTES) return fail(FILE_MESSAGES.tooBig)
  const head = new Uint8Array(data, 0, Math.min(4, data.byteLength))
  if (!startsWith(head, ZIP)) {
    return fail(startsWith(head, OLE) ? FILE_MESSAGES.unreadable : FILE_MESSAGES.notXlsx)
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(data)
  } catch {
    return fail(FILE_MESSAGES.unreadable)
  }

  let priceList = false
  let missingCode = false
  for (const sheet of workbook.worksheets) {
    const name = headerKey(sheet.name)
    if (name === PRICE_LIST) priceList = true
    if (name === PRICE_LIST || RESERVED.has(name)) continue
    const header = findHeader(sheet)
    if (!header) continue
    if (!header.positions.has('code')) {
      missingCode = true
      continue
    }
    return readRows(sheet, header)
  }
  if (priceList) return fail(FILE_MESSAGES.priceList)
  return fail(missingCode ? FILE_MESSAGES.noCode : FILE_MESSAGES.noColumns)
}
