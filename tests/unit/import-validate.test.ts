import { describe, expect, it } from 'vitest'
import type { Cell, ReadRow } from '@/features/catalog/excel/normalize'
import { checkRows } from '@/features/catalog/excel/validate'
import type { ImportColumn } from '@/features/catalog/import/types'

const ALL: ImportColumn[] = ['code', 'name', 'description', 'category', 'price']
const WITH_TAX = { pricesIncludeTax: true, ratePercent: 18 }

const cell = (value: string | number | null): Cell =>
  value === null
    ? { kind: 'empty' }
    : typeof value === 'number'
      ? { kind: 'number', value }
      : { kind: 'text', value }

function row(line: number, values: Partial<Record<ImportColumn, string | number | null>>): ReadRow {
  return {
    line,
    cells: Object.fromEntries(
      Object.entries(values).map(([column, value]) => [column, cell(value)]),
    ),
  }
}

describe('checkRows', () => {
  it('limpia y valida una fila completa', () => {
    const [checked] = checkRows(
      [
        row(2, {
          code: ' lap-001 ',
          name: 'Laptop',
          description: 'Core i5',
          category: 'Laptops',
          price: '2,590.00',
        }),
      ],
      ALL,
      WITH_TAX,
    )
    expect(checked).toEqual({
      line: 2,
      code: 'LAP-001',
      codeOk: true,
      name: 'Laptop',
      description: 'Core i5',
      category: 'Laptops',
      price: '2590.00',
      errors: [],
    })
  })

  it('explica cada problema con el nombre de la columna', () => {
    const [checked] = checkRows(
      [
        row(2, {
          code: null,
          name: null,
          description: 'x'.repeat(2001),
          category: null,
          price: 'abc',
        }),
      ],
      ALL,
      WITH_TAX,
    )
    expect(checked.codeOk).toBe(false)
    expect(checked.errors).toEqual([
      'Código: escribe un código para identificar el producto.',
      'Nombre: está vacío. Escríbelo o quita la columna del archivo.',
      'Descripción: usa como máximo 2000 caracteres.',
      'Categoría: está vacía. Escríbela o quita la columna del archivo.',
      'Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50 o 1250,50.',
    ])
  })

  it('un código repetido es error desde la segunda vez', () => {
    const rows = checkRows(
      [row(2, { code: 'A-1', price: 10 }), row(5, { code: 'a-1', price: 20 })],
      ['code', 'price'],
      WITH_TAX,
    )
    expect(rows[0].errors).toEqual([])
    expect(rows[1]).toMatchObject({
      code: 'A-1',
      codeOk: false,
      errors: ['Código repetido: ya está en la fila 2.'],
    })
  })

  it('las columnas ausentes no se validan; una descripción vacía la borra', () => {
    const [checked] = checkRows(
      [row(2, { code: 'A-1', description: null })],
      ['code', 'description'],
      WITH_TAX,
    )
    expect(checked).toEqual({ line: 2, code: 'A-1', codeOk: true, description: null, errors: [] })
  })

  it('un código numérico se escribe sin notación científica y con decimales es error', () => {
    const rows = checkRows(
      [row(2, { code: 123456789012 }), row(3, { code: 12.5 })],
      ['code'],
      WITH_TAX,
    )
    expect(rows[0]).toMatchObject({ code: '123456789012', codeOk: true })
    expect(rows[1].errors).toEqual(['Código: no puede tener decimales. Escríbelo como texto.'])
  })

  it('«No incluyen IGV» suma el 18 % en céntimos, con la mitad hacia arriba, antes de validar', () => {
    const rows = checkRows(
      [
        row(2, { code: 'A', price: 1000 }),
        row(3, { code: 'B', price: '0.01' }),
        row(4, { code: 'C', price: '9999999999.99' }),
      ],
      ['code', 'price'],
      { pricesIncludeTax: false, ratePercent: 18 },
    )
    expect(rows[0]).toMatchObject({ price: '1180.00', priceBeforeTax: '1000.00' })
    expect(rows[1]).toMatchObject({ price: '0.01', priceBeforeTax: '0.01' })
    expect(rows[2].errors).toEqual(['Precio: no puede pasar de 9,999,999,999.99.'])
  })
})
