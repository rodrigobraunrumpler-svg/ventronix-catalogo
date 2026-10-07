import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildProductsReport, REPORT_TABLE_ROW } from '@/features/catalog/excel/report'
import type { ProductListItem } from '@/features/catalog/types'

const product = (overrides: Partial<ProductListItem>): ProductListItem => ({
  id: 'p1',
  code: 'LAP-001',
  name: 'Laptop básica',
  description: 'Core i3 · 8 GB',
  category_id: 'c1',
  category_name: 'Laptops',
  unit_price: '1180.00',
  // 03:00 UTC del 2 de octubre = 1 de octubre en Lima.
  created_at: '2026-10-02T03:00:00Z',
  updated_at: '2026-10-05T15:00:00Z',
  image_path: null,
  ...overrides,
})

const input = {
  rows: [
    product({}),
    product({
      id: 'p2',
      code: 'IMP-001',
      name: '=HIPERVINCULO("x")',
      description: null,
      category_name: 'Impresoras',
      unit_price: '590.00',
    }),
  ],
  companyName: 'Ventronix',
  logo: null,
  generatedAt: new Date('2026-10-02T19:35:00Z'),
  filtersText: 'Categoría: Laptops',
  viewUrl: 'https://ventronix-catalogo.vercel.app/products?category=c1',
  truncatedAt: null,
}

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer).buffer)
  return workbook
}

describe('buildProductsReport', () => {
  it('arma la cabecera con empresa, fecha de Lima, filtros, total y enlace', async () => {
    const sheet = (await load(await buildProductsReport(input))).getWorksheet('Productos')!
    expect(sheet.getCell('C1').value).toBe('Ventronix')
    expect(sheet.getCell('C2').value).toBe('Reporte de productos')
    expect(sheet.getCell('C3').value).toBe('Generado el 02/10/2026 a las 14:35 (hora de Lima)')
    expect(sheet.getCell('C4').value).toBe('Categoría: Laptops')
    expect(sheet.getCell('C5').value).toBe('2 productos')
    expect(sheet.getCell('C6').value).toMatchObject({
      text: 'Abrir esta vista en la app',
      hyperlink: 'https://ventronix-catalogo.vercel.app/products?category=c1',
    })
  })

  it('escribe la tabla con formatos, panel fijo, filtros y textos que no se ejecutan', async () => {
    const sheet = (await load(await buildProductsReport(input))).getWorksheet('Productos')!
    expect((sheet.getRow(REPORT_TABLE_ROW).values as unknown[]).slice(1)).toEqual([
      'N°',
      'Código',
      'Nombre',
      'Descripción',
      'Categoría',
      'Precio con IGV (S/)',
      'Valor sin IGV (S/)',
      'Fecha de registro',
      'Última modificación',
    ])
    const first = sheet.getRow(REPORT_TABLE_ROW + 1)
    expect(first.getCell(6).value).toBe(1180)
    expect(first.getCell(6).numFmt).toBe('"S/" #,##0.00')
    expect(first.getCell(7).value).toBe(1000)
    expect(first.getCell(8).value).toEqual(new Date('2026-10-01T00:00:00Z'))
    expect(first.getCell(8).numFmt).toBe('dd/mm/yyyy')
    const second = sheet.getRow(REPORT_TABLE_ROW + 2)
    expect(second.getCell(3).value).toBe('=HIPERVINCULO("x")')
    expect(second.getCell(3).type).toBe(ExcelJS.ValueType.String)
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: REPORT_TABLE_ROW })
    expect(sheet.autoFilter).toBe('A8:I8')
  })

  it('añade el resumen por categoría con barras de datos', async () => {
    const summary = (await load(await buildProductsReport(input))).getWorksheet(
      'Resumen por categoría',
    )!
    expect((summary.getRow(2).values as unknown[]).slice(1)).toEqual([
      'Impresoras',
      1,
      590,
      590,
      590,
    ])
    expect((summary.getRow(4).values as unknown[]).slice(1, 3)).toEqual(['Total', 2])
    // ExcelJS lee el formato condicional, aunque sus tipos no declaren la propiedad.
    const read = summary as unknown as { conditionalFormattings: unknown }
    expect(JSON.stringify(read.conditionalFormattings)).toContain('dataBar')
  })

  it('avisa del recorte y pone el logotipo', async () => {
    const logo = readFileSync('public/brand/ventronix-logo-proforma.jpg')
    const report = await buildProductsReport({ ...input, logo, truncatedAt: 10000 })
    const sheet = (await load(report)).getWorksheet('Productos')!
    expect(sheet.getCell('C7').value).toBe('Este reporte muestra los primeros 10 000 productos.')
    expect(sheet.getImages()).toHaveLength(1)
  })
})
