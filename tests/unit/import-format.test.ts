import { describe, expect, it } from 'vitest'
import {
  changeText,
  count,
  defaultTab,
  fileSize,
  filterRows,
  importButton,
  outcomeSummary,
  percentText,
  plural,
  previewSummary,
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

describe('pestañas y búsqueda de la vista previa', () => {
  const rows = [
    row({ line: 2, status: 'create', code: 'IMP-001', name: 'Impresión térmica' }),
    row({ line: 3, status: 'error', code: 'LAP-002', name: 'Laptop' }),
    row({ line: 4, status: 'omitted', code: 'MON-003', name: 'Monitor' }),
  ]

  it('se abre en lo que más conviene mirar: errores, avisos, cambios y nuevos', () => {
    expect(defaultTab(counts({ error: 1, review: 2 }))).toBe('error')
    expect(defaultTab(counts({ review: 2, update: 3 }))).toBe('review')
    expect(defaultTab(counts({ create: 5, update: 2, unchanged: 4000 }))).toBe('update')
    expect(defaultTab(counts({ create: 5 }))).toBe('create')
    expect(defaultTab(counts({ unchanged: 5 }))).toBe('all')
  })

  it('filtra por pestaña y busca por código o nombre sin tildes ni mayúsculas', () => {
    expect(filterRows(rows, 'all', '').map((item) => item.line)).toEqual([2, 3, 4])
    expect(filterRows(rows, 'error', '').map((item) => item.line)).toEqual([3])
    expect(filterRows(rows, 'all', '  IMPRESION ').map((item) => item.line)).toEqual([2])
    expect(filterRows(rows, 'all', 'mon-0').map((item) => item.line)).toEqual([4])
    expect(filterRows(rows, 'create', 'laptop')).toEqual([])
  })

  it('resume lo que hará el botón Importar', () => {
    expect(previewSummary(counts({ create: 48, update: 12, review: 3 }))).toBe(
      '48 nuevos · 12 se actualizan · 3 para revisar',
    )
    expect(previewSummary(counts({ update: 1 }))).toBe('1 se actualiza')
    expect(previewSummary(counts({ unchanged: 4 }))).toBe('')
  })
})
