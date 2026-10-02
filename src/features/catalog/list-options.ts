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

const limaFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Día de Lima (AAAA-MM-DD) de un instante.
export function limaDay(instant: Date) {
  return limaFormat.format(instant)
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDay(value: string) {
  const match = ISO_DAY.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

// Calendario sobre AAAA-MM-DD en UTC: sin husos horarios de por medio.
export function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`

// Días incluidos del filtro, o null si no filtra (spec §4.6). Un rango personalizado al revés se
// ignora, como cualquier valor inválido de la URL.
export function resolveDateRange(
  filter: Pick<DateFilter, 'date' | 'from' | 'to'>,
  now = new Date(),
): DayRange | null {
  const today = limaDay(now)
  switch (filter.date) {
    case null:
      return null
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '30d':
      return { from: addDays(today, -29), to: today }
    case 'month':
      return { from: firstOfMonth(today), to: today }
    case 'last-month': {
      const lastDay = addDays(firstOfMonth(today), -1)
      return { from: firstOfMonth(lastDay), to: lastDay }
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

export function formatDay(day: string) {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

// «Registro: últimos 7 días», «Modificación: 01/09/2026 – 15/09/2026»; null si no filtra.
export function describeDateFilter(filter: DateFilter): string | null {
  if (filter.date === null) return null
  const field = DATE_FIELD_LABELS[filter.dateBy]
  if (filter.date !== 'custom') return `${field}: ${DATE_PRESET_LABELS[filter.date].toLowerCase()}`
  if (filter.from && filter.to)
    return `${field}: ${formatDay(filter.from)} – ${formatDay(filter.to)}`
  if (filter.from) return `${field}: desde el ${formatDay(filter.from)}`
  if (filter.to) return `${field}: hasta el ${formatDay(filter.to)}`
  return null
}

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
  const day = limaDay(new Date(instant))
  const today = limaDay(now)
  if (day === today) return 'hoy'
  if (day === addDays(today, -1)) return 'ayer'
  return `el ${formatDay(day)}`
}

// «02/10/2026» de un instante, en Lima.
export function formatInstant(instant: string) {
  return formatDay(limaDay(new Date(instant)))
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
