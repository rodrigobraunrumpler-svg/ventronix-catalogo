import { describe, expect, it } from 'vitest'
import {
  changeText,
  count,
  fileSize,
  importButton,
  outcomeSummary,
  percentText,
  plural,
  rowDetails,
} from '@/features/catalog/import/format'
import type { PreviewCounts, PreviewRow } from '@/features/catalog/import/types'

const counts = (overrides: Partial<PreviewCounts> = {}): PreviewCounts => ({
  create: 0,
  update: 0,
  unchanged: 0,
  review: 0,
  error: 0,
  omitted: 0,
  ...overrides,
})

const row = (overrides: Partial<PreviewRow>): PreviewRow => ({
  line: 2,
  status: 'update',
  action: 'update',
  code: 'LAP-001',
  name: 'Laptop',
  category: 'Laptops',
  price: '1350.00',
  priceBeforeTax: null,
  changes: [],
  warnings: [],
  errors: [],
  ...overrides,
})

describe('textos de la vista previa', () => {
  it('cifras con espacio de miles que no se parte, y tamaños de archivo', () => {
    expect(count(1234)).toBe('1 234')
    expect(count(999)).toBe('999')
    expect(plural(1, 'fila', 'filas')).toBe('1 fila')
    expect(fileSize(300)).toBe('1 KB')
    expect(fileSize(350_000)).toBe('342 KB')
    expect(fileSize(1_258_291)).toBe('1.2 MB')
  })

  it('porcentajes con signo y el mismo punto decimal que los precios', () => {
    expect(percentText(0.125)).toBe('+12.5 %')
    expect(percentText(-0.04)).toBe('−4.0 %')
  })

  it('describe cada cambio como en la spec', () => {
    expect(changeText({ field: 'price', before: '1200', after: '1350.00' })).toBe(
      'Precio: S/ 1,200.00 → S/ 1,350.00 (+12.5 %)',
    )
    expect(changeText({ field: 'name', before: 'A', after: 'B' })).toBe('Nombre cambia.')
    expect(changeText({ field: 'category', before: 'Laptops', after: 'Computadoras' })).toBe(
      'Categoría: Laptops → Computadoras',
    )
  })

  it('el detalle cambia según el estado de la fila', () => {
    expect(
      rowDetails(row({ status: 'error', action: null, errors: ['Precio: x.'] }), 'all'),
    ).toEqual(['Precio: x.'])
    expect(rowDetails(row({ status: 'omitted', action: null }), 'update')).toEqual([
      'No existe: el modo «Solo actualizar los existentes» la deja fuera.',
    ])
    expect(
      rowDetails(
        row({ status: 'create', action: 'create', priceBeforeTax: '1000.00', price: '1180.00' }),
        'all',
      ),
    ).toEqual(['Producto nuevo.', 'S/ 1,000.00 + IGV → S/ 1,180.00'])
    expect(rowDetails(row({ status: 'unchanged', action: 'unchanged' }), 'all')).toEqual([
      'Ya está igual: no se toca.',
    ])
  })

  it('el botón principal dice cuántos importa o por qué no se puede', () => {
    expect(importButton({ importable: 60, undecided: 0, counts: counts({ create: 60 }) })).toEqual({
      enabled: true,
      label: 'Importar 60 productos',
      reason: null,
    })
    expect(
      importButton({ importable: 3, undecided: 2, counts: counts({ create: 3 }) }),
    ).toMatchObject({
      enabled: false,
      reason: 'Decide 2 categorías antes de importar.',
    })
    expect(
      importButton({ importable: 0, undecided: 0, counts: counts({ unchanged: 5 }) }),
    ).toMatchObject({
      enabled: false,
      reason: 'Tu catálogo ya está al día con este archivo.',
    })
    expect(
      importButton({ importable: 0, undecided: 0, counts: counts({ error: 2 }) }),
    ).toMatchObject({
      enabled: false,
      reason: 'No hay filas para importar.',
    })
  })

  it('resume el resultado de la importación', () => {
    expect(
      outcomeSummary({ created: 48, updated: 12, unchanged: 5, categoriesCreated: ['A', 'B'] }),
    ).toBe('48 productos creados · 12 actualizados · 5 sin cambios · 2 categorías nuevas')
    expect(outcomeSummary({ created: 1, updated: 0, unchanged: 0, categoriesCreated: [] })).toBe(
      '1 producto creado',
    )
  })
})
