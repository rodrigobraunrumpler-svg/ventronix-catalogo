import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  isMatch,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns'
import { formatDate, lima } from '@/lib/dates'
import type { ProductFilters, ProductQuery } from './types'

// Filtro de fecha, orden y textos de la lista de productos (spec del Excel §4). Sirve en el
// navegador y en el servidor. Los días son de Lima, como en la base.

export const DATE_FIELDS = ['created', 'updated'] as const
export type DateField = (typeof DATE_FIELDS)[number]

export const DATE_PRESETS = ['today', '7d', '30d', 'month', 'last-month', 'custom'] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

export const PRODUCT_SORTS = ['name', 'newest', 'updated', 'price-asc', 'price-desc'] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

export type DateFilter = {
  dateBy: DateField
  date: DatePreset | null
  from: string | null
  to: string | null
}

export type DayRange = { from: string | null; to: string | null }

// Día de Lima (AAAA-MM-DD) de un instante.
export const limaDay = (instant: Date) => format(instant, 'yyyy-MM-dd', { in: lima })

// Solo AAAA-MM-DD de un día que existe (2026-02-30 no). isMatch sola acepta también «2026-2-3».
export const isIsoDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && isMatch(value, 'yyyy-MM-dd')

// Días incluidos del filtro, o null si no filtra (spec §4.6). Un rango personalizado al revés se
// ignora, como cualquier valor inválido de la URL.
export function resolveDateRange(
  filter: Pick<DateFilter, 'date' | 'from' | 'to'>,
  now = new Date(),
): DayRange | null {
  const today = startOfDay(now, { in: lima })
  const days = (from: Date, to: Date) => ({ from: limaDay(from), to: limaDay(to) })
  switch (filter.date) {
    case null:
      return null
    case 'today':
      return days(today, today)
    case '7d':
      return days(subDays(today, 6, { in: lima }), today)
    case '30d':
      return days(subDays(today, 29, { in: lima }), today)
    case 'month':
      return days(startOfMonth(today, { in: lima }), today)
    case 'last-month': {
      const lastMonth = subMonths(today, 1, { in: lima })
      return days(startOfMonth(lastMonth, { in: lima }), endOfMonth(lastMonth, { in: lima }))
    }
    case 'custom':
      if (!filter.from && !filter.to) return null
      if (filter.from && filter.to && filter.from > filter.to) return null
      return { from: filter.from, to: filter.to }
  }
}

export const DATE_FIELD_LABELS: Record<DateField, string> = {
  created: 'Registro',
  updated: 'Modificación',
}

export const DATE_PRESET_LABELS: Record<Exclude<DatePreset, 'custom'>, string> = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  month: 'Este mes',
  'last-month': 'Mes anterior',
}

// «2026-09-15» → «15/09/2026»: el día se lee como medianoche de Lima.
export const formatDay = (day: string) => formatDate(parseISO(day, { in: lima }))

// «Últimos 7 días», «01/09/2026 – 15/09/2026», «Desde el 01/09/2026»; null si no filtra. Un rango al
// revés no filtra (resolveDateRange), así que tampoco se describe.
export function describeDateRange(filter: Pick<DateFilter, 'date' | 'from' | 'to'>) {
  if (filter.date === null) return null
  if (filter.from && filter.to && filter.from > filter.to) return null
  if (filter.date !== 'custom') return DATE_PRESET_LABELS[filter.date]
  if (filter.from && filter.to) return `${formatDay(filter.from)} – ${formatDay(filter.to)}`
  if (filter.from) return `Desde el ${formatDay(filter.from)}`
  if (filter.to) return `Hasta el ${formatDay(filter.to)}`
  return null
}

// «Fecha: este mes»: el rango detrás de su etiqueta; null si no filtra.
export function labelDateRange(label: string, filter: Pick<DateFilter, 'date' | 'from' | 'to'>) {
  const range = describeDateRange(filter)
  return range ? `${label}: ${range[0].toLowerCase()}${range.slice(1)}` : null
}

// «Registro: últimos 7 días», «Modificación: 01/09/2026 – 15/09/2026»; null si no filtra.
export const describeDateFilter = (filter: DateFilter) =>
  labelDateRange(DATE_FIELD_LABELS[filter.dateBy], filter)

export const SORT_LABELS: Record<ProductSort, string> = {
  name: 'Nombre A–Z',
  newest: 'Más recientes (registro)',
  updated: 'Modificados recientemente',
  'price-asc': 'Precio: menor a mayor',
  'price-desc': 'Precio: mayor a menor',
}

// Qué fecha muestra cada fila: la del orden o la del filtro (spec §4.3); null sin fechas en juego.
export function rowDateField({
  dateBy,
  date,
  sort,
}: Pick<ProductFilters, 'dateBy' | 'date' | 'sort'>): DateField | null {
  if (sort === 'newest') return 'created'
  if (sort === 'updated') return 'updated'
  return date === null ? null : dateBy
}

// «hoy», «ayer» o «el 02/10/2026», en días de Lima.
export function relativeDay(instant: string, now = new Date()) {
  const days = differenceInCalendarDays(now, new Date(instant), { in: lima })
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `el ${formatDate(instant)}`
}

// Lo que se pide a la base: el rango ya convertido en días concretos. La clave de la caché cambia
// con el día, así que «Hoy» se recalcula solo (spec §4.6).
export function toProductQuery(filters: ProductFilters, now = new Date()): ProductQuery {
  const range = resolveDateRange(filters, now)
  return {
    search: filters.search,
    category: filters.category,
    page: filters.page,
    dateBy: filters.dateBy,
    dateFrom: range?.from ?? null,
    dateTo: range?.to ?? null,
    sort: filters.sort,
  }
}
