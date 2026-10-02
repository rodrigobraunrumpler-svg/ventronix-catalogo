import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildPriceList } from '@/features/catalog/excel/price-list'
import { readImportFile } from '@/features/catalog/excel/read'
import { buildProductsReport } from '@/features/catalog/excel/report'
import { FILE_MESSAGES, IMPORT_MAX_BYTES } from '@/features/catalog/import/options'
import type { ProductListItem } from '@/features/catalog/types'

type Sheet = { name: string; rows: ExcelJS.CellValue[][] }

async function xlsx(...sheets: Sheet[]) {
  const workbook = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name)
    sheet.rows.forEach((values, index) => {
      if (values.length > 0) worksheet.getRow(index + 1).values = values
    })
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
}

const toArrayBuffer = (buffer: Buffer) => new Uint8Array(buffer).buffer
const HEADER = ['Código', 'Nombre', 'Descripción', 'Categoría', 'Precio con IGV (S/)']

async function read(data: ArrayBuffer, name = 'productos.xlsx') {
  const result = await readImportFile(data, name)
  if (!result.ok) throw new Error(result.message)
  return result.sheet
}

describe('readImportFile', () => {
  it('lee la plantilla: todas las columnas y sin las filas vacías', async () => {
    const sheet = await read(
      await xlsx({
        name: 'Productos',
        rows: [
          HEADER,
          ['LAP-001', 'Laptop', null, 'Laptops', 2590],
          [],
          ['IMP-001', 'Láser', 'Mono', 'Impresoras', '1,180.00'],
        ],
      }),
    )
    expect(sheet.sheetName).toBe('Productos')
    expect(sheet.columns).toEqual(['code', 'name', 'description', 'category', 'price'])
    expect(sheet.derivedPrice).toBeNull()
    expect(sheet.rows.map((row) => row.line)).toEqual([2, 4])
    expect(sheet.rows[0].cells.price).toEqual({ kind: 'number', value: 2590 })
    expect(sheet.rows[0].cells.description).toEqual({ kind: 'empty' })
  })

  it('salta las hojas reservadas, como «Instrucciones», y lee la siguiente', async () => {
    const sheet = await read(
      await xlsx(
        { name: 'Instrucciones', rows: [HEADER, ['EJ-001', 'Ejemplo', null, 'Laptops', 10]] },
        { name: 'Productos', rows: [HEADER, ['LAP-001', 'Laptop', null, 'Laptops', 10]] },
      ),
    )
    expect(sheet.sheetName).toBe('Productos')
    expect(sheet.rows).toHaveLength(1)
  })

  it('reconoce el reporte completo: títulos en la fila 8 y «Valor sin IGV» no es el precio', async () => {
    const product: ProductListItem = {
      id: 'p1',
      code: 'LAP-001',
      name: 'Laptop',
      description: null,
      category_id: 'c1',
      category_name: 'Laptops',
      unit_price: '1180.00',
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    }
    const report = await buildProductsReport({
      rows: [product],
      companyName: 'Ventronix',
      logo: null,
      generatedAt: new Date('2026-10-02T15:00:00Z'),
      filtersText: 'Sin filtros',
      viewUrl: null,
      truncatedAt: null,
    })
    const sheet = await read(toArrayBuffer(report))
    expect(sheet.columns).toEqual(['code', 'name', 'description', 'category', 'price'])
    expect(sheet.derivedPrice).toBe('Valor sin IGV (S/)')
    expect(sheet.rows).toEqual([
      expect.objectContaining({
        line: 9,
        cells: expect.objectContaining({ price: { kind: 'number', value: 1180 } }),
      }),
    ])
  })

  it('acepta títulos sin tildes ni mayúsculas y alias, e ignora las columnas que no conoce', async () => {
    const sheet = await read(
      await xlsx({
        name: 'Hoja1',
        rows: [
          ['N°', 'CÓD.', 'nombre del producto', 'Precio unitario (S/)', 'Motivo'],
          [1, 'A-1', 'Uno', 10, 'x'],
        ],
      }),
    )
    expect(sheet.columns).toEqual(['code', 'name', 'price'])
    expect(sheet.rows[0].cells).toEqual({
      code: { kind: 'text', value: 'A-1' },
      name: { kind: 'text', value: 'Uno' },
      price: { kind: 'number', value: 10 },
    })
  })

  it('un archivo con Código y Precio es una actualización parcial', async () => {
    const sheet = await read(
      await xlsx({
        name: 'Precios',
        rows: [
          ['Código', 'Precio'],
          ['A-1', 10],
        ],
      }),
    )
    expect(sheet.columns).toEqual(['code', 'price'])
  })

  it('explica cada archivo que no sirve', async () => {
    const message = async (data: ArrayBuffer, name = 'productos.xlsx') => {
      const result = await readImportFile(data, name)
      return result.ok ? null : result.message
    }
    const priceList = await buildPriceList({
      rows: [],
      company: null,
      logo: null,
      generatedAt: new Date(),
    })
    expect(await message(toArrayBuffer(priceList))).toBe(FILE_MESSAGES.priceList)
    expect(
      await message(
        await xlsx({
          name: 'P',
          rows: [
            ['Nombre', 'Precio'],
            ['A', 1],
          ],
        }),
      ),
    ).toBe(FILE_MESSAGES.noCode)
    expect(
      await message(
        await xlsx({
          name: 'P',
          rows: [
            ['Cod. Prov', 'P.V.P.'],
            ['A', 1],
          ],
        }),
      ),
    ).toBe(FILE_MESSAGES.noColumns)
    expect(await message(await xlsx({ name: 'P', rows: [HEADER] }))).toBe(FILE_MESSAGES.empty)
    expect(await message(await xlsx({ name: 'P', rows: [HEADER] }), 'productos.csv')).toBe(
      FILE_MESSAGES.notXlsx,
    )
    expect(await message(new TextEncoder().encode('codigo,nombre\nA,B').buffer)).toBe(
      FILE_MESSAGES.notXlsx,
    )
    expect(await message(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]).buffer)).toBe(
      FILE_MESSAGES.unreadable,
    )
    expect(await message(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]).buffer)).toBe(
      FILE_MESSAGES.unreadable,
    )
    expect(await message(new ArrayBuffer(IMPORT_MAX_BYTES + 1))).toBe(FILE_MESSAGES.tooBig)
  })

  it('acepta 5 000 productos y rechaza 5 001', async () => {
    const rows = (count: number) => [
      ['Código', 'Precio'],
      ...Array.from({ length: count }, (_, index) => [`P-${index}`, 10]),
    ]
    expect((await read(await xlsx({ name: 'P', rows: rows(5000) }))).rows).toHaveLength(5000)
    const result = await readImportFile(await xlsx({ name: 'P', rows: rows(5001) }), 'p.xlsx')
    expect(result).toEqual({ ok: false, message: FILE_MESSAGES.tooManyRows })
  })
})
