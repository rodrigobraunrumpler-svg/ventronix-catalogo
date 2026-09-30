import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { unitPriceSchema } from '../money'
import type { Product, ProductListItem } from '../types'

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
