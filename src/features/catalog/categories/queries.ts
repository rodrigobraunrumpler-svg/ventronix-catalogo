import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { CategoryListItem, CategoryOption } from '../types'

type Client = SupabaseClient<Database>

// Lecturas con la sesión del navegador; RLS decide qué filas se ven.
export async function listCategories(supabase: Client): Promise<CategoryListItem[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, created_at, updated_at, products(count)')
    .order('name')
    .order('id')
  if (error) throw error
  return data.map(({ products, ...category }) => ({
    ...category,
    product_count: products[0]?.count ?? 0,
  }))
}

export async function listCategoryOptions(supabase: Client): Promise<CategoryOption[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name')
    .order('id')
  if (error) throw error
  return data
}
