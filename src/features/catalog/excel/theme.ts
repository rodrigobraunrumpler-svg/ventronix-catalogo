import 'server-only'
import type { Row, Workbook, Worksheet } from 'exceljs'

// Colores de la app (globals.css) en ARGB, para que los Excel se vean de la marca.
export const COLORS = {
  ink: 'FF121511',
  primary: 'FF72CE0B',
  zebra: 'FFF6FBEF',
  border: 'FFE3E7DE',
  muted: 'FF5D6559',
  group: 'FFEEF7E2',
  link: 'FF3F7D0A',
  warning: 'FFB54708',
  white: 'FFFFFFFF',
} as const

// Plus Jakarta Sans no viene con Excel: Calibri se ve igual en todos los equipos.
export const FONT = 'Calibri'
export const MONEY_FORMAT = '"S/" #,##0.00'
export const DATE_FORMAT = 'dd/mm/yyyy'

const hairline = { style: 'thin' as const, color: { argb: COLORS.border } }

export function styleHeaderRow(row: Row) {
  row.height = 22
  row.eachCell((cell) => {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: COLORS.white } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ink } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: COLORS.primary } } }
  })
}

// Filas alternas en verde muy claro y bordes finos.
export function styleBodyRow(row: Row, index: number) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: FONT, size: 11, color: { argb: COLORS.ink } }
    cell.border = { top: hairline, bottom: hairline, left: hairline, right: hairline }
    cell.alignment = { vertical: 'top' }
    if (index % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } }
    }
  })
}

// Un día de Lima como medianoche UTC: Excel muestra justo ese día, sin desfases de huso.
export const excelDay = (day: string) => new Date(`${day}T00:00:00.000Z`)

// El logotipo arriba a la izquierda, con su proporción (900 × 510). ExcelJS tipa los binarios como
// ArrayBuffer: se le pasa una copia exacta del Buffer de Node.
export function addLogo(workbook: Workbook, sheet: Worksheet, logo: Buffer | null) {
  if (!logo) return
  const image = workbook.addImage({ buffer: new Uint8Array(logo).buffer, extension: 'jpeg' })
  sheet.addImage(image, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 85 } })
}
