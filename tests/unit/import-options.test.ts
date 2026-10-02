import { describe, expect, it } from 'vitest'
import {
  categoryKey,
  checkFile,
  DEFAULT_IMPORT_OPTIONS,
  FILE_MESSAGES,
  IMPORT_MAX_BYTES,
  importOptionsSchema,
  templateTitles,
} from '@/features/catalog/import/options'

describe('opciones de importación', () => {
  it('los títulos de la plantilla son los del reporte completo', () => {
    expect(Object.values(templateTitles())).toEqual([
      'Código',
      'Nombre',
      'Descripción',
      'Categoría',
      'Precio con IGV (S/)',
    ])
  })

  it('comprueba extensión y tamaño antes de enviar', () => {
    expect(checkFile({ name: 'productos.xlsx', size: 1000 })).toBeNull()
    expect(checkFile({ name: 'PRODUCTOS.XLSX', size: 1000 })).toBeNull()
    expect(checkFile({ name: 'productos.csv', size: 1000 })).toBe(FILE_MESSAGES.notXlsx)
    expect(checkFile({ name: 'productos.xlsx', size: IMPORT_MAX_BYTES + 1 })).toBe(
      FILE_MESSAGES.tooBig,
    )
  })

  it('valida las opciones que manda el navegador', () => {
    expect(importOptionsSchema.safeParse(DEFAULT_IMPORT_OPTIONS).success).toBe(true)
    expect(
      importOptionsSchema.safeParse({
        pricesIncludeTax: false,
        mode: 'update',
        categoryMap: {
          laptps: { action: 'use', target: 'Laptops' },
          monitor: { action: 'create' },
        },
      }).success,
    ).toBe(true)
    expect(
      importOptionsSchema.safeParse({ ...DEFAULT_IMPORT_OPTIONS, mode: 'delete' }).success,
    ).toBe(false)
    expect(
      importOptionsSchema.safeParse({
        ...DEFAULT_IMPORT_OPTIONS,
        categoryMap: { x: { action: 'use', target: '' } },
      }).success,
    ).toBe(false)
  })

  it('la clave de categoría sigue la regla del índice único', () => {
    expect(categoryKey('  Laptops ')).toBe('laptops')
    expect(categoryKey('IMPRESIÓN')).toBe('impresión')
  })
})
