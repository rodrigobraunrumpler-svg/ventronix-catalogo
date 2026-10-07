import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildPriceList, PRICE_LIST_TABLE_ROW } from '@/features/catalog/excel/price-list'
import type { ProductListItem } from '@/features/catalog/types'
import { completeCompany } from '../support/company'

const product = (code: string, name: string, category: string, price: string): ProductListItem => ({
  id: code,
  code,
  name,
  description: `Descripción de ${name}`,
  category_id: category,
  category_name: category,
  unit_price: price,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  image_path: null,
})

async function sheetOf(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer).buffer)
  return workbook.getWorksheet('Lista de precios')!
}

describe('buildPriceList', () => {
  it('pone los datos de la empresa, la vigencia y la nota del IGV', async () => {
    const sheet = await sheetOf(
      await buildPriceList({
        rows: [product('LAP-1', 'Laptop', 'Laptops', '1180.00')],
        company: { ...completeCompany, trade_name: 'Ventronix', email: 'ventas@ventronix.pe' },
        logo: null,
        generatedAt: new Date('2026-10-02T15:00:00Z'),
      }),
    )
    expect(sheet.getCell('C1').value).toBe('Ventronix')
    expect(sheet.getCell('C2').value).toBe(
      'RUC 20000000001 · Av. Prueba 123, Huamanga · Tel. 066 312345 · ventas@ventronix.pe',
    )
    expect(sheet.getCell('C3').value).toBe('Lista de precios')
    expect(sheet.getCell('C4').value).toBe('Vigente al 02/10/2026')
    expect(sheet.getCell('C5').value).toBe('Precios en soles (S/), con IGV incluido.')
  })

  it('agrupa por categoría de la A a la Z, respeta el orden y no trae datos internos', async () => {
    const sheet = await sheetOf(
      await buildPriceList({
        rows: [
          product('LAP-2', 'Zeta', 'Laptops', '900.00'),
          product('IMP-1', 'Láser', 'Impresoras', '590.00'),
          product('LAP-1', 'Alfa', 'Laptops', '1180.00'),
        ],
        company: null,
        logo: null,
        generatedAt: new Date('2026-10-02T15:00:00Z'),
      }),
    )
    const header = PRICE_LIST_TABLE_ROW
    expect((sheet.getRow(header).values as unknown[]).slice(1)).toEqual([
      'Código',
      'Producto',
      'Descripción',
      'Precio con IGV (S/)',
    ])
    const firstColumn = [1, 2, 3, 4, 5].map((offset) => sheet.getCell(header + offset, 1).value)
    expect(firstColumn).toEqual(['Impresoras', 'IMP-1', 'Laptops', 'LAP-2', 'LAP-1'])
    expect(sheet.getCell(header + 1, 1).isMerged).toBe(true)
    expect(sheet.getCell(header + 2, 4).value).toBe(590)
    expect(sheet.getCell('C1').value).toBe('Catálogo de productos')
    expect(sheet.getCell('C2').value).toBeNull()
  })
})
