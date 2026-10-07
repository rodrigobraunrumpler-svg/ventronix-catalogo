import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildErrorsFile } from '@/features/catalog/excel/errors-file'
import { readImportFile } from '@/features/catalog/excel/read'
import { buildReceipt, type ReceiptInput } from '@/features/catalog/excel/receipt'

const bytes = (buffer: Buffer) => new Uint8Array(buffer).buffer

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes(buffer))
  return workbook
}

const receipt: ReceiptInput = {
  kind: 'receipt',
  fileName: 'precios-octubre.xlsx',
  // 19:35 UTC = 14:35 en Lima.
  generatedAt: new Date('2026-10-02T19:35:00Z'),
  counts: { created: 1, updated: 1, unchanged: 3, skipped: 0, errors: 2 },
  categoriesCreated: ['Monitores'],
  changes: [
    {
      code: 'LAP-1',
      product: 'Laptop uno',
      action: 'updated',
      field: 'price',
      before: '1000',
      after: '1100.00',
    },
    {
      code: 'MON-1',
      product: 'Monitor 24',
      action: 'created',
      field: null,
      before: null,
      after: null,
    },
  ],
  previous: [
    { code: 'LAP-1', name: 'Laptop uno', description: null, category: 'Laptops', price: '1000' },
  ],
  columns: ['code', 'price'],
}

describe('buildReceipt', () => {
  it('resume la importación y lista cada dato cambiado', async () => {
    const workbook = await load(await buildReceipt(receipt))
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumen',
      'Cambios',
      'Para revertir',
    ])
    const summary = workbook.getWorksheet('Resumen')!
    expect(summary.getCell('A1').value).toBe('Comprobante de importación')
    expect(summary.getCell('A2').value).toBe('Importado el 02/10/2026 a las 14:35 (hora de Lima)')
    expect(summary.getCell('A3').value).toBe('Archivo: precios-octubre.xlsx')
    expect((summary.getRow(5).values as unknown[]).slice(1)).toEqual(['Productos creados', 1])
    const changes = workbook.getWorksheet('Cambios')!
    expect((changes.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Código',
      'Producto',
      'Acción',
      'Dato',
      'Antes',
      'Después',
    ])
    expect((changes.getRow(2).values as unknown[]).slice(1)).toEqual([
      'LAP-1',
      'Laptop uno',
      'Actualizado',
      'Precio con IGV (S/)',
      1000,
      1100,
    ])
    expect(changes.getCell('E2').numFmt).toBe('"S/" #,##0.00')
    expect(changes.getCell('C3').value).toBe('Creado')
  })

  it('la hoja «Para revertir» se puede volver a subir con los valores anteriores', async () => {
    const result = await readImportFile(bytes(await buildReceipt(receipt)), 'comprobante.xlsx')
    expect(result.ok && result.sheet).toMatchObject({
      sheetName: 'Para revertir',
      columns: ['code', 'price'],
      rows: [
        {
          cells: { code: { kind: 'text', value: 'LAP-1' }, price: { kind: 'number', value: 1000 } },
        },
      ],
    })
  })

  it('la simulación avisa que todavía no se guardó nada y no trae «Para revertir»', async () => {
    const workbook = await load(
      await buildReceipt({ ...receipt, kind: 'simulation', previous: [] }),
    )
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Cambios'])
    expect(workbook.getWorksheet('Resumen')!.getCell('A1').value).toBe(
      'Simulación: todavía no se guardó nada',
    )
    expect(workbook.getWorksheet('Cambios')!.getCell('C2').value).toBe('Se actualizará')
  })
})

describe('buildErrorsFile', () => {
  it('trae lo que tenía cada fila y el motivo, y se puede corregir y volver a subir', async () => {
    const buffer = await buildErrorsFile(
      [
        {
          line: 7,
          cells: { code: { kind: 'text', value: 'BAD-1' }, price: { kind: 'text', value: 'abc' } },
          errors: [
            'Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50 o 1250,50.',
          ],
        },
        {
          line: 9,
          cells: { code: { kind: 'empty' }, price: { kind: 'number', value: 10 } },
          errors: ['Código: escribe un código para identificar el producto.', 'Otro motivo.'],
        },
      ],
      ['code', 'price'],
    )
    const sheet = (await load(buffer)).getWorksheet('Filas con errores')!
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Código',
      'Precio con IGV (S/)',
      'Fila',
      'Motivo',
    ])
    expect((sheet.getRow(2).values as unknown[]).slice(1)).toEqual([
      'BAD-1',
      'abc',
      7,
      'Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50 o 1250,50.',
    ])
    expect(sheet.getCell('D3').value).toBe(
      'Código: escribe un código para identificar el producto.\nOtro motivo.',
    )
    expect(sheet.getCell('D2').font?.color?.argb).toBe('FFB42318')
    // El código va como texto: al corregirlo, Excel no convierte «00123» en 123.
    expect(sheet.getCell('A2').numFmt).toBe('@')
    const reread = await readImportFile(bytes(buffer), 'errores.xlsx')
    expect(reread.ok && reread.sheet.columns).toEqual(['code', 'price'])
  })
})
