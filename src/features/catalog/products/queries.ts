import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { unitPriceSchema } from '../money'
import { normalizeSearch } from '../search-pattern'
import type { Product, ProductFilters, ProductListItem, ProductPage } from '../types'

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

const pageSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      category_id: z.string(),
      unit_price: z.string(),
      created_at: z.string(),
      updated_at: z.string(),
      category_name: z.string(),
    }),
  ),
})

// Búsqueda, filtro y página se resuelven en la base de datos: nunca se descarga todo el catálogo.
export async function listProducts(
  supabase: Client,
  filters: ProductFilters,
  signal?: AbortSignal,
): Promise<ProductPage> {
  let request = supabase.rpc('search_products', {
    search: normalizeSearch(filters.search),
    category: filters.category ?? undefined,
    page: filters.page,
    page_size: PAGE_SIZE,
  })
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  const parsed = pageSchema.parse(data)
  return {
    total: parsed.total,
    page: filters.page,
    pageSize: PAGE_SIZE,
    items: parsed.items.map(({ category_name, ...row }) => ({ ...toProduct(row), category_name })),
  }
}
