import { describe, expect, it } from 'vitest'
import {
  describeExportFilters,
  exportFileName,
  exportFiltersSchema,
  exportViewPath,
  fileSlug,
} from '@/features/catalog/excel/export-request'

const base = {
  search: '',
  category: null,
  dateBy: 'created',
  date: null,
  from: null,
  to: null,
  sort: 'name',
} as const
const LATE_NIGHT = new Date('2026-10-02T04:30:00Z')

describe('export-request', () => {
  it('describe filtros y orden como en la spec', () => {
    expect(describeExportFilters(base, null)).toBe('Sin filtros')
    expect(
      describeExportFilters({ ...base, search: 'hp', date: '7d', sort: 'price-desc' }, 'Laptops'),
    ).toBe(
      'Categoría: Laptops · Búsqueda: hp · Registro: últimos 7 días · Orden: Precio de mayor a menor',
    )
    expect(describeExportFilters({ ...base, sort: 'newest' }, null)).toBe(
      'Orden: Más recientes (registro)',
    )
  })

  it('nombra el archivo con el día de Lima y la categoría sin símbolos', () => {
    expect(exportFileName('report', 'Impresión & Copias', LATE_NIGHT)).toBe(
      'productos-impresion-copias-2026-10-01.xlsx',
    )
    expect(exportFileName('report', null, LATE_NIGHT)).toBe('productos-2026-10-01.xlsx')
    expect(exportFileName('price-list', 'Laptops', LATE_NIGHT)).toBe(
      'lista-de-precios-2026-10-01.xlsx',
    )
    expect(fileSlug('  Ñandú Ópticos  ')).toBe('nandu-opticos')
    expect(exportFileName('report', '%%%', LATE_NIGHT)).toBe('productos-2026-10-01.xlsx')
  })

  it('arma la URL de la vista sin los valores por defecto', () => {
    expect(exportViewPath(base)).toBe('/products')
    expect(
      exportViewPath({
        ...base,
        dateBy: 'updated',
        date: 'custom',
        from: '2026-09-01',
        to: null,
        sort: 'newest',
      }),
    ).toBe('/products?dateBy=updated&date=custom&from=2026-09-01&sort=newest')
  })

  it('valida lo que llega del navegador', () => {
    const parsed = exportFiltersSchema.safeParse({ ...base, search: '  hp   laser ', page: 3 })
    expect(parsed.data).toEqual({ ...base, search: 'hp laser' })
    expect(exportFiltersSchema.safeParse({ ...base, category: 'no-es-un-id' }).success).toBe(false)
    expect(exportFiltersSchema.safeParse({ ...base, from: '2026-02-30' }).success).toBe(false)
    expect(exportFiltersSchema.safeParse({ ...base, sort: 'precio' }).success).toBe(false)
  })
})
