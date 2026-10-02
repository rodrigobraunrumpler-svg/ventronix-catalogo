import 'server-only'
import ExcelJS from 'exceljs'
import type { CompanyProfile } from '@/features/company/schemas'
import { formatDate } from '@/lib/dates'
import { priceColumns } from '../price-columns'
import type { ProductListItem } from '../types'
import { addLogo, COLORS, FONT, MONEY_FORMAT, styleBodyRow, styleHeaderRow } from './theme'

export type PriceListInput = {
  rows: ProductListItem[]
  company: CompanyProfile | null
  logo: Buffer | null
  generatedAt: Date
}

export const PRICE_LIST_TABLE_ROW = 7

// Lista de precios para clientes (spec del Excel §5.3): agrupada por categoría, con los datos de
// contacto de «Empresa» que estén completos y sin datos internos (fechas, N°, resumen).
export async function buildPriceList(input: PriceListInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  workbook.created = input.generatedAt
  const prices = priceColumns()
  const sheet = workbook.addWorksheet('Lista de precios', {
    properties: { tabColor: { argb: COLORS.primary } },
    views: [{ state: 'frozen', ySplit: PRICE_LIST_TABLE_ROW }],
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${PRICE_LIST_TABLE_ROW}:${PRICE_LIST_TABLE_ROW}`,
    },
  })
  sheet.columns = [{ width: 16 }, { width: 38 }, { width: 50 }, { width: 18 }]
  addLogo(workbook, sheet, input.logo)

  const company = input.company
  const contact = [
    company?.ruc ? `RUC ${company.ruc}` : null,
    company?.address ?? null,
    company && company.phones.length > 0 ? `Tel. ${company.phones.join(' / ')}` : null,
    company?.email ?? null,
  ]
    .filter(Boolean)
    .join(' · ')
  const put = (address: string, value: string, font: Partial<ExcelJS.Font>) => {
    const cell = sheet.getCell(address)
    cell.value = value
    cell.font = { name: FONT, ...font }
  }
  const muted = { size: 10, color: { argb: COLORS.muted } }
  put('C1', company?.trade_name ?? company?.legal_name ?? 'Catálogo de productos', {
    size: 16,
    bold: true,
    color: { argb: COLORS.ink },
  })
  if (contact) put('C2', contact, muted)
  put('C3', 'Lista de precios', { size: 14, bold: true, color: { argb: COLORS.link } })
  put('C4', `Vigente al ${formatDate(input.generatedAt)}`, muted)
  put('C5', prices.note, { ...muted, italic: true })

  const header = sheet.getRow(PRICE_LIST_TABLE_ROW)
  header.values = ['Código', 'Producto', 'Descripción', prices.catalog]
  styleHeaderRow(header)

  const groups = new Map<string, ProductListItem[]>()
  for (const product of input.rows) {
    const list = groups.get(product.category_name)
    if (list) list.push(product)
    else groups.set(product.category_name, [product])
  }
  let current = PRICE_LIST_TABLE_ROW + 1
  for (const category of [...groups.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
    sheet.mergeCells(current, 1, current, 4)
    const title = sheet.getCell(current, 1)
    title.value = category
    title.font = { name: FONT, size: 12, bold: true, color: { argb: COLORS.ink } }
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } }
    current += 1
    groups.get(category)!.forEach((product, index) => {
      const row = sheet.getRow(current)
      row.values = [
        product.code,
        product.name,
        product.description ?? '',
        Number(product.unit_price),
      ]
      styleBodyRow(row, index)
      row.getCell(3).alignment = { vertical: 'top', wrapText: true }
      row.getCell(4).numFmt = MONEY_FORMAT
      current += 1
    })
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
