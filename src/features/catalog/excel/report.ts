import 'server-only'
import { format } from 'date-fns'
import ExcelJS from 'exceljs'
import { formatDate, lima } from '@/lib/dates'
import { limaDay } from '../list-options'
import { priceColumns } from '../price-columns'
import type { ProductListItem } from '../types'
import { summarizeByCategory } from './category-summary'
import {
  addLogo,
  COLORS,
  DATE_FORMAT,
  excelDay,
  FONT,
  MONEY_FORMAT,
  styleBodyRow,
  styleHeaderRow,
} from './theme'

export type ReportInput = {
  rows: ProductListItem[]
  companyName: string | null
  logo: Buffer | null
  generatedAt: Date
  filtersText: string
  viewUrl: string | null
  truncatedAt: number | null
}

// La tabla empieza aquí: arriba van el logotipo y la cabecera (spec del Excel §5.2).
export const REPORT_TABLE_ROW = 8

// 10000 → «10 000», como en los textos de la spec.
const spaced = (count: number) => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

function writeHeader(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, input: ReportInput) {
  addLogo(workbook, sheet, input.logo)
  const put = (address: string, value: ExcelJS.CellValue, font: Partial<ExcelJS.Font>) => {
    const cell = sheet.getCell(address)
    cell.value = value
    cell.font = { name: FONT, ...font }
  }
  const total = input.rows.length
  const muted = { size: 10, color: { argb: COLORS.muted } }
  put('C1', input.companyName ?? 'Catálogo de productos', {
    size: 16,
    bold: true,
    color: { argb: COLORS.ink },
  })
  put('C2', 'Reporte de productos', { size: 13, bold: true, color: { argb: COLORS.link } })
  put(
    'C3',
    `Generado el ${formatDate(input.generatedAt)} a las ${format(input.generatedAt, 'HH:mm', { in: lima })} (hora de Lima)`,
    muted,
  )
  put('C4', input.filtersText, muted)
  put('C5', `${spaced(total)} ${total === 1 ? 'producto' : 'productos'}`, {
    size: 11,
    bold: true,
    color: { argb: COLORS.ink },
  })
  if (input.viewUrl) {
    put(
      'C6',
      { text: 'Abrir esta vista en la app', hyperlink: input.viewUrl },
      { size: 10, underline: true, color: { argb: COLORS.link } },
    )
  }
  if (input.truncatedAt !== null) {
    put('C7', `Este reporte muestra los primeros ${spaced(input.truncatedAt)} productos.`, {
      size: 10,
      bold: true,
      color: { argb: COLORS.warning },
    })
  }
}

function writeSummary(workbook: ExcelJS.Workbook, rows: ProductListItem[]) {
  const summary = summarizeByCategory(rows)
  const sheet = workbook.addWorksheet('Resumen por categoría', {
    properties: { tabColor: { argb: COLORS.ink } },
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = [{ width: 28 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }]
  const header = sheet.getRow(1)
  header.values = ['Categoría', 'Productos', 'Precio mínimo', 'Precio máximo', 'Precio promedio']
  styleHeaderRow(header)
  const lines = summary.total ? [...summary.categories, summary.total] : []
  lines.forEach((line, index) => {
    const row = sheet.getRow(2 + index)
    row.values = [
      line.category,
      line.count,
      Number(line.min),
      Number(line.max),
      Number(line.average),
    ]
    styleBodyRow(row, index)
    for (const column of [3, 4, 5]) row.getCell(column).numFmt = MONEY_FORMAT
    if (line === summary.total) row.font = { name: FONT, bold: true }
  })
  if (summary.categories.length > 0) {
    // ExcelJS pinta la barra con `color` aunque sus tipos no lo declaren: por eso va en una variable.
    const dataBar = {
      type: 'dataBar' as const,
      priority: 1,
      cfvo: [{ type: 'num' as const, value: 0 }, { type: 'max' as const }],
      color: { argb: COLORS.primary },
      gradient: false,
    }
    sheet.addConditionalFormatting({
      ref: `B2:B${1 + summary.categories.length}`,
      rules: [dataBar],
    })
  }
}

// Reporte completo (spec del Excel §5.2): para uso interno; se puede volver a subir en la carga
// masiva. Los textos van siempre como texto, nunca como fórmula.
export async function buildProductsReport(input: ReportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  workbook.created = input.generatedAt
  const prices = priceColumns()
  const headers = [
    'N°',
    'Código',
    'Nombre',
    'Descripción',
    'Categoría',
    prices.catalog,
    ...(prices.derived ? [prices.derived.label] : []),
    'Fecha de registro',
    'Última modificación',
  ]
  const widths = [6, 16, 40, 60, 20, 18, ...(prices.derived ? [16] : []), 14, 16]
  const sheet = workbook.addWorksheet('Productos', {
    properties: { tabColor: { argb: COLORS.primary } },
    views: [{ state: 'frozen', ySplit: REPORT_TABLE_ROW }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${REPORT_TABLE_ROW}:${REPORT_TABLE_ROW}`,
    },
  })
  sheet.columns = widths.map((width) => ({ width }))
  writeHeader(workbook, sheet, input)

  const header = sheet.getRow(REPORT_TABLE_ROW)
  header.values = headers
  styleHeaderRow(header)
  const priceColumn = 6
  input.rows.forEach((product, index) => {
    const row = sheet.getRow(REPORT_TABLE_ROW + 1 + index)
    row.values = [
      index + 1,
      product.code,
      product.name,
      product.description ?? '',
      product.category_name,
      Number(product.unit_price),
      ...(prices.derived ? [Number(prices.derived.from(product.unit_price))] : []),
      excelDay(limaDay(new Date(product.created_at))),
      excelDay(limaDay(new Date(product.updated_at))),
    ]
    styleBodyRow(row, index)
    row.getCell(4).alignment = { vertical: 'top', wrapText: true }
    row.getCell(priceColumn).numFmt = MONEY_FORMAT
    if (prices.derived) row.getCell(priceColumn + 1).numFmt = MONEY_FORMAT
    row.getCell(headers.length - 1).numFmt = DATE_FORMAT
    row.getCell(headers.length).numFmt = DATE_FORMAT
  })
  sheet.autoFilter = {
    from: { row: REPORT_TABLE_ROW, column: 1 },
    to: { row: REPORT_TABLE_ROW, column: headers.length },
  }

  writeSummary(workbook, input.rows)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
