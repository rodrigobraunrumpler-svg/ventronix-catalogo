import 'server-only'
import ExcelJS from 'exceljs'
import {
  COLORS,
  DATE_FORMAT,
  excelDay,
  FONT,
  MONEY_FORMAT,
  REPORT_TABLE_ROW,
  spaced,
  styleBodyRow,
  styleHeaderRow,
  writeReportHeader,
} from '@/features/catalog/excel/theme'
import { limaDay } from '@/features/catalog/list-options'
import { centsToDecimal, parseCents, ZERO } from '../money'
import type { ProformaRow } from './queries'

export type HistoryReportInput = {
  rows: ProformaRow[]
  companyName: string | null
  logo: Buffer | null
  generatedAt: Date
  filtersText: string
  viewUrl: string | null
  truncatedAt: number | null
}

const HEADERS = ['N°', 'Fecha', 'Cliente', 'RUC/DNI', 'Celular', 'Productos', 'Total', 'Vence']

// Excel del historial (spec de productos libres §6): lo filtrado, de la más reciente a la más
// antigua, y debajo la suma del periodo. Los textos van como texto, nunca como fórmula.
export async function buildProformasReport(input: HistoryReportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  workbook.created = input.generatedAt
  const sheet = workbook.addWorksheet('Proformas', {
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
  sheet.columns = [8, 12, 44, 14, 14, 11, 16, 12].map((width) => ({ width }))
  const count = input.rows.length
  writeReportHeader(workbook, sheet, {
    logo: input.logo,
    companyName: input.companyName ?? 'Proformas',
    title: 'Reporte de proformas',
    generatedAt: input.generatedAt,
    filtersText: input.filtersText,
    countText: `${spaced(count)} ${count === 1 ? 'proforma' : 'proformas'}`,
    viewUrl: input.viewUrl,
    truncatedText:
      input.truncatedAt === null
        ? null
        : `Este reporte muestra las primeras ${spaced(input.truncatedAt)} proformas.`,
  })

  const header = sheet.getRow(REPORT_TABLE_ROW)
  header.values = HEADERS
  styleHeaderRow(header)
  input.rows.forEach((proforma, index) => {
    const row = sheet.getRow(REPORT_TABLE_ROW + 1 + index)
    row.values = [
      proforma.number,
      excelDay(limaDay(new Date(proforma.issued_at))),
      proforma.client_name,
      proforma.client_document,
      proforma.client_phone,
      proforma.item_count,
      Number(proforma.total),
      excelDay(proforma.valid_until),
    ]
    styleBodyRow(row, index)
    row.getCell(1).numFmt = '0000'
    row.getCell(2).numFmt = DATE_FORMAT
    row.getCell(7).numFmt = MONEY_FORMAT
    row.getCell(8).numFmt = DATE_FORMAT
  })
  sheet.autoFilter = {
    from: { row: REPORT_TABLE_ROW, column: 1 },
    to: { row: REPORT_TABLE_ROW, column: HEADERS.length },
  }

  // La suma del periodo, en céntimos, con una fila en blanco antes: el filtro y el orden de Excel
  // no la mezclan con las proformas.
  const sum = input.rows.reduce(
    (total, proforma) => total + (parseCents(proforma.total) ?? ZERO),
    ZERO,
  )
  const totalRow = sheet.getRow(REPORT_TABLE_ROW + 2 + count)
  totalRow.getCell(3).value = 'Total del periodo'
  totalRow.getCell(7).value = Number(centsToDecimal(sum))
  totalRow.getCell(7).numFmt = MONEY_FORMAT
  totalRow.font = { name: FONT, bold: true, color: { argb: COLORS.ink } }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
