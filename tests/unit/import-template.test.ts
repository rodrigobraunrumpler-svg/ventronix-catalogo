import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { readImportFile } from '@/features/catalog/excel/read'
import { buildTemplate } from '@/features/catalog/excel/template'
import { FILE_MESSAGES } from '@/features/catalog/import/options'

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer).buffer)
  return workbook
}

describe('buildTemplate', () => {
  it('trae las instrucciones primero, la hoja de productos y la lista oculta de categorías', async () => {
    const workbook = await load(await buildTemplate(['Impresoras', 'Laptops']))
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Instrucciones',
      'Productos',
      'Categorías',
    ])
    expect(workbook.getWorksheet('Categorías')!.state).toBe('hidden')
    expect(workbook.getWorksheet('Categorías')!.getCell('A2').value).toBe('Laptops')
    const instructions = workbook
      .getWorksheet('Instrucciones')!
      .getSheetValues()
      .flat()
      .filter((value) => typeof value === 'string')
    expect(instructions).toContain('Las filas de ejemplo de esta hoja no se importan.')
  })

  it('la hoja Productos lleva títulos, código como texto, ayudas y el desplegable de categorías', async () => {
    const products = (await load(await buildTemplate(['Impresoras', 'Laptops']))).getWorksheet(
      'Productos',
    )!
    expect((products.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Código',
      'Nombre',
      'Descripción',
      'Categoría',
      'Precio con IGV (S/)',
    ])
    expect(products.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(products.getColumn(1).numFmt).toBe('@')
    expect(products.getCell('A2').dataValidation).toMatchObject({
      type: 'textLength',
      formulae: [1, 64],
      promptTitle: 'Código',
    })
    expect(products.getCell('D5001').dataValidation).toMatchObject({
      type: 'list',
      formulae: ["'Categorías'!$A$1:$A$2"],
      errorStyle: 'information',
      errorTitle: 'Categoría nueva',
      error: 'No está en tu lista: se creará al importar.',
    })
    expect(products.getCell('E2').dataValidation).toMatchObject({
      type: 'decimal',
      operator: 'greaterThan',
      errorStyle: 'stop',
    })
  })

  it('sin categorías, la columna se escribe a mano', async () => {
    const products = (await load(await buildTemplate([]))).getWorksheet('Productos')!
    expect(products.getCell('D2').dataValidation).toMatchObject({ type: 'textLength' })
  })

  it('el importador la reconoce: vacía avisa que no hay productos y completada se lee', async () => {
    const empty = await buildTemplate(['Laptops'])
    expect(await readImportFile(new Uint8Array(empty).buffer, 'plantilla.xlsx')).toEqual({
      ok: false,
      message: FILE_MESSAGES.empty,
    })
    const workbook = await load(empty)
    workbook.getWorksheet('Productos')!.getRow(2).values = [
      'LAP-001',
      'Laptop',
      null,
      'Laptops',
      2590,
    ]
    const filled = new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
    const result = await readImportFile(filled, 'plantilla.xlsx')
    expect(result.ok && result.sheet).toMatchObject({ sheetName: 'Productos', rows: [{ line: 2 }] })
  })
})
