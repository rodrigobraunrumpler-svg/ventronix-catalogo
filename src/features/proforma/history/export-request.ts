import { z } from 'zod'
import { fileSlug } from '@/features/catalog/excel/export-request'
import {
  DATE_PRESETS,
  describeDateRange,
  isIsoDay,
  labelDateRange,
  limaDay,
} from '@/features/catalog/list-options'
import { normalizeSearch, SEARCH_MAX_LENGTH } from '@/features/catalog/search-pattern'

const day = z.string().refine(isIsoDay, 'Fecha no válida').nullable()

// Los filtros de la URL, sin la página. Llegan del navegador: el servidor los valida.
export const historyFiltersSchema = z.object({
  search: z
    .string()
    .max(SEARCH_MAX_LENGTH * 4)
    .transform(normalizeSearch),
  date: z.enum(DATE_PRESETS).nullable(),
  from: day,
  to: day,
})
export type HistoryExportFilters = z.input<typeof historyFiltersSchema>
type ParsedFilters = z.output<typeof historyFiltersSchema>

// «Búsqueda: perez · Fecha: este mes», o «Sin filtros».
export function describeHistoryFilters(filters: ParsedFilters) {
  const parts = [
    filters.search ? `Búsqueda: ${filters.search}` : null,
    labelDateRange('Fecha', filters),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Sin filtros'
}

// El nombre lleva el filtro, como en Productos: «proformas-perez-este-mes-2026-10-06.xlsx».
export function historyFileName(filters: ParsedFilters, now: Date) {
  const slug = fileSlug([filters.search, describeDateRange(filters)].filter(Boolean).join(' '))
  return slug ? `proformas-${slug}-${limaDay(now)}.xlsx` : `proformas-${limaDay(now)}.xlsx`
}

// La misma vista en la app (spec del Excel §5.2), sin los valores por defecto.
export function historyViewPath(filters: ParsedFilters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.date) params.set('date', filters.date)
  if (filters.date === 'custom' && filters.from) params.set('from', filters.from)
  if (filters.date === 'custom' && filters.to) params.set('to', filters.to)
  const query = params.toString()
  return query ? `/proformas?${query}` : '/proformas'
}
