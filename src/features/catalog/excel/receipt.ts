import 'server-only'
import { format } from 'date-fns'
import ExcelJS from 'exceljs'
import { formatDate, lima } from '@/lib/dates'
import { templateTitles } from '../import/options'
import type { DataColumn, ImportColumn } from '../import/types'
import { COLORS, FONT, MONEY_FORMAT, styleBodyRow, styleHeaderRow } from './theme'

export type ReceiptChange = {
  code: string
  product: string
  action: 'created' | 'updated'
  field: DataColumn | null
  before: string | null
  after: string | null
}

export type PreviousValues = {
  code: string
  name: string
  description: string | null
  category: string
  price: string
}

export type ReceiptInput = {
  kind: 'receipt' | 'simulation'
  fileName: string
  generatedAt: Date
  counts: { created: number; updated: number; unchanged: number; skipped: number; errors: number }
  categoriesCreated: string[]
  changes: ReceiptChange[]
  previous: PreviousValues[]
  // Columnas del archivo importado: «Para revertir» trae solo esas, así que revierte solo lo cambiado.
  columns: ImportColumn[]
}

export const REVERT_SHEET = 'Para revertir'
const REVERT_HEADER_ROW = 4

const WIDTHS: Record<ImportColumn, number> = {
  code: 16,
  name: 40,
  description: 50,
  category: 24,
  price: 18,
}

function writeSummary(sheet: ExcelJS.Worksheet, input: ReceiptInput) {
  const simulation = input.kind === 'simulation'
  const { counts } = input
  sheet.columns = [{ width: 44 }, { width: 14 }]
  const put = (row: number, value: string, font: Partial<ExcelJS.Font> = {}) => {
    const cell = sheet.getCell(row, 1)
    cell.value = value
    cell.font = { name: FONT, size: 11, color: { argb: COLORS.ink }, ...font }
  }
  put(1, simulation ? 'Simulación: todavía no se guardó nada' : 'Comprobante de importación', {
    size: 16,
    bold: true,
  })
  const at = input.generatedAt
  put(
    2,
    `${simulation ? 'Simulado' : 'Importado'} el ${formatDate(at)} a las ${format(at, 'HH:mm', { in: lima })} (hora de Lima)`,
    { color: { argb: COLORS.muted } },
  )
  put(3, `Archivo: ${input.fileName}`, { color: { argb: COLORS.muted } })
  const lines: [string, number][] = simulation
    ? [
        ['Productos que se crearían', counts.created],
        ['Productos que se actualizarían', counts.updated],
        ['Sin cambios', counts.unchanged],
        ['Filas omitidas por el modo', counts.skipped],
        ['Filas con errores (no se importarían)', counts.errors],
      ]
    : [
        ['Productos creados', counts.created],
        ['Productos actualizados', counts.updated],
        ['Sin cambios', counts.unchanged],
        ['Filas omitidas por el modo', counts.skipped],
        ['Filas con errores (no se importaron)', counts.errors],
      ]
  lines.forEach(([label, value], index) => {
    const row = sheet.getRow(5 + index)
    row.values = [label, value]
    styleBodyRow(row, index)
  })
  const label = simulation ? 'Categorías que se crearían' : 'Categorías nuevas'
  put(
    6 + lines.length,
    input.categoriesCreated.length > 0
      ? `${label}: ${input.categoriesCreated.join(', ')}`
      : 'Sin categorías nuevas.',
  )
}

function writeChanges(sheet: ExcelJS.Worksheet, input: ReceiptInput) {
  const simulation = input.kind === 'simulation'
  const titles = templateTitles()
  sheet.columns = [
    { width: 16 },
    { width: 40 },
    { width: 16 },
    { width: 22 },
    { width: 40 },
    { width: 40 },
  ]
  const header = sheet.getRow(1)
  header.values = ['Código', 'Producto', 'Acción', 'Dato', 'Antes', 'Después']
  styleHeaderRow(header)
  input.changes.forEach((change, index) => {
    const row = sheet.getRow(index + 2)
    const price = change.field === 'price'
    const value = (text: string | null) => (price && text !== null ? Number(text) : text)
    const action =
      change.action === 'created'
        ? simulation
          ? 'Se creará'
          : 'Creado'
        : simulation
          ? 'Se actualizará'
          : 'Actualizado'
    row.values = [
      change.code,
      change.product,
      action,
      change.field ? titles[change.field] : '',
      value(change.before),
      value(change.after),
    ]
    styleBodyRow(row, index)
    for (const column of [5, 6]) {
      row.getCell(column).alignment = { wrapText: true, vertical: 'top' }
      if (price) row.getCell(column).numFmt = MONEY_FORMAT
    }
  })
  if (input.changes.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } }
  }
}

// «Para revertir» (spec §6.10): los productos actualizados con sus valores anteriores, en formato de
// plantilla y solo con las columnas del archivo importado. Subirla es una actualización parcial más.
function writeRevert(sheet: ExcelJS.Worksheet, input: ReceiptInput) {
  const titles = templateTitles()
  sheet.columns = input.columns.map((column) => ({ width: WIDTHS[column] }))
  const notes = [
    'Sube esta hoja en Carga masiva para devolver estos productos a como estaban.',
    'Los productos creados no se borran: están en la hoja Cambios.',
    'Súbela tal cual, con «Incluyen IGV»: estos son los precios que tenía el catálogo.',
  ]
  notes.forEach((text, index) => {
    const cell = sheet.getCell(index + 1, 1)
    cell.value = text
    cell.font = {
      name: FONT,
      size: 11,
      bold: index === 0,
      color: { argb: index === 0 ? COLORS.link : COLORS.muted },
    }
  })
  const header = sheet.getRow(REVERT_HEADER_ROW)
  header.values = input.columns.map((column) => titles[column])
  styleHeaderRow(header)
  input.previous.forEach((product, index) => {
    const row = sheet.getRow(REVERT_HEADER_ROW + 1 + index)
    row.values = input.columns.map((column) => {
      switch (column) {
        case 'code':
          return product.code
        case 'name':
          return product.name
        case 'description':
          return product.description ?? ''
        case 'category':
          return product.category
        case 'price':
          return Number(product.price)
      }
    })
    styleBodyRow(row, index)
    const price = input.columns.indexOf('price')
    if (price >= 0) row.getCell(price + 1).numFmt = MONEY_FORMAT
  })
}

// Comprobante de la importación y simulación (spec §6.6 y §6.10): «Resumen», «Cambios» y, si se
// actualizó algo, «Para revertir».
export async function buildReceipt(input: ReceiptInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  workbook.created = input.generatedAt
  writeSummary(
    workbook.addWorksheet('Resumen', { properties: { tabColor: { argb: COLORS.ink } } }),
    input,
  )
  writeChanges(
    workbook.addWorksheet('Cambios', {
      properties: { tabColor: { argb: COLORS.primary } },
      views: [{ state: 'frozen', ySplit: 1 }],
    }),
    input,
  )
  if (input.kind === 'receipt' && input.previous.length > 0) {
    writeRevert(
      workbook.addWorksheet(REVERT_SHEET, {
        properties: { tabColor: { argb: COLORS.warning } },
        views: [{ state: 'frozen', ySplit: REVERT_HEADER_ROW }],
      }),
      input,
    )
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
