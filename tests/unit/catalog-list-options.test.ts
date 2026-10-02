import { describe, expect, it } from 'vitest'
import {
  describeDateFilter,
  isIsoDay,
  limaDay,
  relativeDay,
  resolveDateRange,
  rowDateField,
  toProductQuery,
  type DatePreset,
} from '@/features/catalog/list-options'
import { searchParsers } from '@/features/catalog/search-params'

// 04:30 UTC del 2 de octubre = 23:30 del 1 de octubre en Lima.
const LATE_NIGHT = new Date('2026-10-02T04:30:00Z')
const range = (date: DatePreset | null, now: Date, custom = {}) =>
  resolveDateRange({ date, from: null, to: null, ...custom }, now)

describe('días de Lima', () => {
  it('toma el día de Lima, no el de UTC, hasta las 23:59:59', () => {
    expect(limaDay(LATE_NIGHT)).toBe('2026-10-01')
    expect(limaDay(new Date('2026-10-02T04:59:59Z'))).toBe('2026-10-01')
    expect(limaDay(new Date('2026-10-02T05:00:00Z'))).toBe('2026-10-02')
  })

  it('solo acepta días reales en AAAA-MM-DD', () => {
    expect(isIsoDay('2026-02-28')).toBe(true)
    expect(isIsoDay('2026-02-30')).toBe(false)
    expect(isIsoDay('2026-2-3')).toBe(false)
    expect(isIsoDay('hoy')).toBe(false)
  })
})

describe('resolveDateRange', () => {
  it.each([
    ['today', { from: '2026-10-01', to: '2026-10-01' }],
    ['7d', { from: '2026-09-25', to: '2026-10-01' }],
    ['30d', { from: '2026-09-02', to: '2026-10-01' }],
    ['month', { from: '2026-10-01', to: '2026-10-01' }],
    ['last-month', { from: '2026-09-01', to: '2026-09-30' }],
  ] as const)('%s usa el día de Lima', (date, expected) => {
    expect(range(date, LATE_NIGHT)).toEqual(expected)
  })

  it.each([
    ['2026-01-15T12:00:00Z', { from: '2025-12-01', to: '2025-12-31' }],
    ['2026-03-10T12:00:00Z', { from: '2026-02-01', to: '2026-02-28' }],
    ['2028-03-10T12:00:00Z', { from: '2028-02-01', to: '2028-02-29' }],
  ])('mes anterior visto el %s', (now, expected) => {
    expect(range('last-month', new Date(now))).toEqual(expected)
  })

  it('personalizado: abierto por un lado; al revés o vacío no filtra', () => {
    expect(range('custom', LATE_NIGHT, { from: '2026-09-01' })).toEqual({
      from: '2026-09-01',
      to: null,
    })
    expect(range('custom', LATE_NIGHT, { from: '2026-09-10', to: '2026-09-01' })).toBeNull()
    expect(range('custom', LATE_NIGHT)).toBeNull()
  })

  it('sin filtro de fecha devuelve null', () => {
    expect(range(null, LATE_NIGHT)).toBeNull()
  })
})

describe('textos', () => {
  const base = { dateBy: 'created', date: null, from: null, to: null } as const

  it('describe el filtro como en la spec', () => {
    expect(describeDateFilter({ ...base, date: '7d' })).toBe('Registro: últimos 7 días')
    expect(describeDateFilter({ ...base, dateBy: 'updated', date: 'today' })).toBe(
      'Modificación: hoy',
    )
    expect(
      describeDateFilter({ ...base, date: 'custom', from: '2026-09-01', to: '2026-09-15' }),
    ).toBe('Registro: 01/09/2026 – 15/09/2026')
    expect(describeDateFilter({ ...base, date: 'custom', from: '2026-09-01' })).toBe(
      'Registro: desde el 01/09/2026',
    )
    expect(describeDateFilter({ ...base, date: 'custom', to: '2026-09-15' })).toBe(
      'Registro: hasta el 15/09/2026',
    )
    expect(describeDateFilter(base)).toBeNull()
  })

  it('un rango al revés no se describe: la lista lo ignora y el chip y el Excel también', () => {
    expect(
      describeDateFilter({ ...base, date: 'custom', from: '2026-09-10', to: '2026-09-01' }),
    ).toBeNull()
  })

  it('fecha relativa en días de Lima', () => {
    expect(relativeDay('2026-10-01T15:00:00Z', LATE_NIGHT)).toBe('hoy')
    expect(relativeDay('2026-09-30T15:00:00Z', LATE_NIGHT)).toBe('ayer')
    expect(relativeDay('2026-09-01T15:00:00Z', LATE_NIGHT)).toBe('el 01/09/2026')
  })

  it('la fecha de cada fila sale del orden o del filtro', () => {
    expect(rowDateField({ dateBy: 'created', date: null, sort: 'name' })).toBeNull()
    expect(rowDateField({ dateBy: 'updated', date: '7d', sort: 'price-desc' })).toBe('updated')
    expect(rowDateField({ dateBy: 'created', date: null, sort: 'updated' })).toBe('updated')
    expect(rowDateField({ dateBy: 'updated', date: null, sort: 'newest' })).toBe('created')
  })
})

describe('URL', () => {
  it('lee los valores válidos e ignora los demás', () => {
    expect(searchParsers.date.parse('7d')).toBe('7d')
    expect(searchParsers.date.parse('semana')).toBeNull()
    expect(searchParsers.from.parse('2026-02-30')).toBeNull()
    expect(searchParsers.to.parse('2026-09-15')).toBe('2026-09-15')
    expect(searchParsers.sort.parse('price-desc')).toBe('price-desc')
    expect(searchParsers.sort.parse('precio')).toBeNull()
    expect(searchParsers.dateBy.parse('otro')).toBeNull()
  })
})

describe('toProductQuery', () => {
  it('convierte el rango en días concretos y conserva lo demás', () => {
    const filters = {
      search: 'hp',
      category: null,
      page: 2,
      dateBy: 'updated',
      date: 'today',
      from: null,
      to: null,
      sort: 'newest',
    } as const
    expect(toProductQuery(filters, LATE_NIGHT)).toEqual({
      search: 'hp',
      category: null,
      page: 2,
      dateBy: 'updated',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-01',
      sort: 'newest',
    })
  })
})
