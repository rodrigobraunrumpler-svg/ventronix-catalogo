import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { unitPriceSchema } from '../money'
import { normalizeSearch } from '../search-pattern'
import type { Product, ProductListItem, ProductPage, ProductQuery } from '../types'

type Client = SupabaseClient<Database>

// El precio se proyecta como texto: nunca pasa por un número de coma flotante (spec §6).
export const productColumns =
  'id, code, name, description, category_id, unit_price::text, created_at, updated_at'

type ProductRow = Omit<Product, 'unit_price'> & { unit_price: string }

// Valida el precio leído y lo normaliza a dos decimales.
export function toProduct(row: ProductRow): Product {
  return { ...row, unit_price: unitPriceSchema.parse(row.unit_price) }
}

export async function getProduct(supabase: Client, id: string): Promise<ProductListItem | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`${productColumns}, categories(name)`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const { categories, ...row } = data
  return { ...toProduct(row), category_name: categories?.name ?? '' }
}

// 50 por página: con un catálogo grande se encuentra el producto con menos clics.
export const PAGE_SIZE = 50

const itemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category_id: z.string(),
  unit_price: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  category_name: z.string(),
})

const pageSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(itemSchema),
})

const toListItem = ({ category_name, ...row }: z.infer<typeof itemSchema>): ProductListItem => ({
  ...toProduct(row),
  category_name,
})

// Búsqueda, filtros y orden: los mismos para la lista y para los Excel (spec del Excel §9.1).
function searchArgs(query: Omit<ProductQuery, 'page'>) {
  return {
    search: normalizeSearch(query.search),
    category: query.category ?? undefined,
    date_by: query.dateBy,
    date_from: query.dateFrom ?? undefined,
    date_to: query.dateTo ?? undefined,
    sort: query.sort,
  }
}

// Búsqueda, filtros, orden y página se resuelven en la base de datos: nunca se descarga todo el
// catálogo.
export async function listProducts(
  supabase: Client,
  query: ProductQuery,
  signal?: AbortSignal,
): Promise<ProductPage> {
  let request = supabase.rpc('search_products', {
    ...searchArgs(query),
    page: query.page,
    page_size: PAGE_SIZE,
  })
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  const parsed = pageSchema.parse(data)
  return {
    total: parsed.total,
    page: query.page,
    pageSize: PAGE_SIZE,
    items: parsed.items.map(toListItem),
  }
}
