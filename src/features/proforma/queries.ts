import type { SupabaseClient } from '@supabase/supabase-js'
import { unitPriceSchema } from '@/features/catalog/money'
import type { Database } from '@/lib/supabase/database.types'

// Precio actual en el catálogo de los productos de la proforma, para avisar si cambió (spec §4.5).
// Un producto borrado no aparece en el resultado.
export async function getCurrentPrices(supabase: SupabaseClient<Database>, ids: string[]) {
  const prices = new Map<string, string>()
  if (ids.length === 0) return prices
  const { data, error } = await supabase
    .from('products')
    .select('id, unit_price::text')
    .in('id', ids)
  if (error) throw error
  for (const row of data) prices.set(row.id, unitPriceSchema.parse(row.unit_price))
  return prices
}
