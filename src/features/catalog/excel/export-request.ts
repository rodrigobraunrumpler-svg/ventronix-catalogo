import { z } from 'zod'
import {
  DATE_FIELDS,
  DATE_PRESETS,
  describeDateFilter,
  isIsoDay,
  limaDay,
  PRODUCT_SORTS,
  type ProductSort,
} from '../list-options'
import { idSchema } from '../schemas'
import { normalizeSearch, SEARCH_MAX_LENGTH } from '../search-pattern'

// Tope del Excel de salida (spec del Excel §5.1 y §10).
export const EXPORT_MAX_ROWS = 10_000
export const EXPORT_FORMATS = ['report', 'price-list'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

const day = z.string().refine(isIsoDay, 'Fecha no válida').nullable()

// Los filtros de la URL, sin la página. Llegan del navegador: el servidor los valida.
export const exportFiltersSchema = z.object({
  search: z
    .string()
    .max(SEARCH_MAX_LENGTH * 4)
    .transform(normalizeSearch),
  category: idSchema.nullable(),
  dateBy: z.enum(DATE_FIELDS),
  date: z.enum(DATE_PRESETS).nullable(),
  from: day,
  to: day,
  sort: z.enum(PRODUCT_SORTS),
})
export type ExportFilters = z.input<typeof exportFiltersSchema>
type ParsedFilters = z.output<typeof exportFiltersSchema>

// Cómo se nombra el orden en la cabecera del reporte (spec §5.2: «Orden: Precio de mayor a menor»).
const SORT_PHRASES: Record<Exclude<ProductSort, 'name'>, string> = {
  newest: 'Más recientes (registro)',
  updated: 'Modificados recientemente',
  'price-asc': 'Precio de menor a mayor',
  'price-desc': 'Precio de mayor a menor',
}

// «Categoría: Laptops · Búsqueda: hp · Registro: últimos 7 días · Orden: Precio de mayor a menor».
export function describeExportFilters(filters: ParsedFilters, categoryName: string | null) {
  const parts = [
    categoryName ? `Categoría: ${categoryName}` : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
    describeDateFilter(filters),
    filters.sort === 'name' ? null : `Orden: ${SORT_PHRASES[filters.sort]}`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Sin filtros'
}

// «Impresión & Copias» → «impresion-copias»: sin tildes ni símbolos, válido en cualquier sistema.
export function fileSlug(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function exportFileName(format: ExportFormat, categoryName: string | null, now: Date) {
  const today = limaDay(now)
  if (format === 'price-list') return `lista-de-precios-${today}.xlsx`
  const slug = categoryName ? fileSlug(categoryName) : ''
  return slug ? `productos-${slug}-${today}.xlsx` : `productos-${today}.xlsx`
}

// La misma vista en la app, sin los valores por defecto (spec §5.2, «Abrir esta vista en la app»).
export function exportViewPath(filters: ParsedFilters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.category) params.set('category', filters.category)
  if (filters.dateBy !== 'created') params.set('dateBy', filters.dateBy)
  if (filters.date) params.set('date', filters.date)
  if (filters.date === 'custom' && filters.from) params.set('from', filters.from)
  if (filters.date === 'custom' && filters.to) params.set('to', filters.to)
  if (filters.sort !== 'name') params.set('sort', filters.sort)
  const query = params.toString()
  return query ? `/products?${query}` : '/products'
}
