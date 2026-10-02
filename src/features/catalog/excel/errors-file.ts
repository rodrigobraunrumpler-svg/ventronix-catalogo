import 'server-only'
import ExcelJS from 'exceljs'
import { templateTitles } from '../import/options'
import type { ImportColumn } from '../import/types'
import type { Cell } from './normalize'
import { COLORS, FONT, styleBodyRow, styleHeaderRow } from './theme'

export type ErrorRow = {
  line: number
  cells: Partial<Record<ImportColumn, Cell>>
  errors: string[]
}

const WIDTHS: Record<ImportColumn, number> = {
  code: 16,
  name: 40,
  description: 50,
  category: 24,
  price: 18,
}

// Lo que traía la celda, tal cual, para corregirlo aquí mismo.
function shownValue(cell: Cell | undefined): ExcelJS.CellValue {
  if (!cell) return null
  switch (cell.kind) {
    case 'empty':
      return null
    case 'error':
      return cell.shown
    default:
      return cell.value
  }
}

// Filas con errores (spec §9.2): las columnas del archivo, la fila de origen y el motivo en rojo. Se
// corrige aquí y se vuelve a subir: «Fila» y «Motivo» no son columnas de la plantilla, así que el
// importador las ignora.
export async function buildErrorsFile(rows: ErrorRow[], columns: ImportColumn[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  const titles = templateTitles()
  const sheet = workbook.addWorksheet('Filas con errores', {
    properties: { tabColor: { argb: COLORS.danger } },
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = [
    ...columns.map((column) => ({ width: WIDTHS[column] })),
    { width: 8 },
    { width: 70 },
  ]
  // El código como texto, igual que en la plantilla: al corregirlo, Excel no convierte «00123».
  const code = columns.indexOf('code')
  if (code >= 0) sheet.getColumn(code + 1).numFmt = '@'
  const header = sheet.getRow(1)
  header.values = [...columns.map((column) => titles[column]), 'Fila', 'Motivo']
  styleHeaderRow(header)
  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 2)
    excelRow.values = [
      ...columns.map((column) => shownValue(row.cells[column])),
      row.line,
      row.errors.join('\n'),
    ]
    styleBodyRow(excelRow, index)
    const reason = excelRow.getCell(columns.length + 2)
    reason.font = { name: FONT, size: 11, bold: true, color: { argb: COLORS.danger } }
    reason.alignment = { wrapText: true, vertical: 'top' }
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
