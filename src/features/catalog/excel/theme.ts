import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { format } from 'date-fns'
import { formatDate, lima } from '@/lib/dates'
import type { CellValue, Font, Row, Workbook, Worksheet } from 'exceljs'

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
  danger: 'FFB42318',
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

// La tabla de los reportes empieza aquí: arriba van el logotipo y la cabecera (spec del Excel §5.2).
export const REPORT_TABLE_ROW = 8

// Se incluye en las funciones de /products, /products/import y /proformas (next.config.ts).
const REPORT_LOGO = path.join(process.cwd(), 'public/brand/ventronix-logo-proforma.jpg')
export const readReportLogo = () => readFile(REPORT_LOGO).catch(() => null)

// 10000 → «10 000», como en los textos de la spec.
export const spaced = (count: number) => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export type ReportHeader = {
  logo: Buffer | null
  companyName: string
  title: string
  generatedAt: Date
  filtersText: string
  countText: string
  viewUrl: string | null
  truncatedText: string | null
}

// Cabecera de los reportes (spec del Excel §5.2): empresa, título, fecha y hora de Lima, filtros,
// cuántas filas, el enlace a la misma vista y, si se recortó, el aviso.
export function writeReportHeader(workbook: Workbook, sheet: Worksheet, header: ReportHeader) {
  addLogo(workbook, sheet, header.logo)
  const put = (address: string, value: CellValue, font: Partial<Font>) => {
    const cell = sheet.getCell(address)
    cell.value = value
    cell.font = { name: FONT, ...font }
  }
  const muted = { size: 10, color: { argb: COLORS.muted } }
  put('C1', header.companyName, { size: 16, bold: true, color: { argb: COLORS.ink } })
  put('C2', header.title, { size: 13, bold: true, color: { argb: COLORS.link } })
  put(
    'C3',
    `Generado el ${formatDate(header.generatedAt)} a las ${format(header.generatedAt, 'HH:mm', { in: lima })} (hora de Lima)`,
    muted,
  )
  put('C4', header.filtersText, muted)
  put('C5', header.countText, { size: 11, bold: true, color: { argb: COLORS.ink } })
  if (header.viewUrl) {
    put(
      'C6',
      { text: 'Abrir esta vista en la app', hyperlink: header.viewUrl },
      { size: 10, underline: true, color: { argb: COLORS.link } },
    )
  }
  if (header.truncatedText) {
    put('C7', header.truncatedText, { size: 10, bold: true, color: { argb: COLORS.warning } })
  }
}
