import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { normalizeSearch } from '@/features/catalog/search-pattern'
import type { Database } from '@/lib/supabase/database.types'

type Client = SupabaseClient<Database>

// 20 por página, contadas en la base (spec de productos libres §4.2).
export const HISTORY_PAGE_SIZE = 20

// Totales como texto exacto, como los precios del catálogo.
const rowSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  issued_at: z.string(),
  valid_until: z.string(),
  client_name: z.string(),
  client_document: z.string(),
  client_phone: z.string(),
  item_count: z.number().int(),
  total: z.string(),
})

const pageSchema = z.object({
  total: z.number().int(),
  sum: z.string(),
  all: z.number().int(),
  this_month: z.number().int(),
  items: z.array(rowSchema),
})

export type ProformaRow = z.infer<typeof rowSchema>
export type HistoryQuery = {
  search: string
  page: number
  dateFrom: string | null
  dateTo: string | null
}
export type HistoryPage = {
  items: ProformaRow[]
  total: number
  sum: string
  all: number
  thisMonth: number
}

// Búsqueda y fechas: las mismas para la lista y para el Excel.
export const historyArgs = (query: Omit<HistoryQuery, 'page'>) => ({
  search: normalizeSearch(query.search),
  date_from: query.dateFrom ?? undefined,
  date_to: query.dateTo ?? undefined,
})

// La base filtra, cuenta, suma y devuelve solo la página pedida: nunca se descarga el historial.
export async function listProformas(
  supabase: Client,
  query: HistoryQuery,
  signal?: AbortSignal,
): Promise<HistoryPage> {
  let request = supabase.rpc('search_proformas', {
    ...historyArgs(query),
    page: query.page,
    page_size: HISTORY_PAGE_SIZE,
  })
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  const page = pageSchema.parse(data)
  return {
    items: page.items,
    total: page.total,
    sum: page.sum,
    all: page.all,
    thisMonth: page.this_month,
  }
}

// Todo lo filtrado para el Excel (spec §6). Quien llama pide una de más para saber si hubo recorte.
export async function exportProformaRows(
  supabase: Client,
  query: Omit<HistoryQuery, 'page'>,
  maxRows: number,
): Promise<ProformaRow[]> {
  const { data, error } = await supabase.rpc('export_proformas', {
    ...historyArgs(query),
    max_rows: maxRows,
  })
  if (error) throw error
  return z.array(rowSchema).parse(data)
}
