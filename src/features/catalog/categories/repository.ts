import 'server-only'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import { failure, unexpected } from '../action-errors'
import type { Category, CategoryInput } from '../types'

type Client = SupabaseClient<Database>

const columns = 'id, name, created_at, updated_at'
const duplicateName = 'Ya existe una categoría con ese nombre.'
const missing = 'La categoría ya no existe. Actualiza la lista.'

function writeError(error: PostgrestError) {
  if (error.code === '23505') return failure('CONFLICT', duplicateName, { name: [duplicateName] })
  console.error('[catálogo] categorías:', error.code, error.message)
  return unexpected()
}

// Escrituras con la sesión del usuario (nunca con una clave administrativa); RLS sigue aplicando.
export async function createCategoryRow(
  supabase: Client,
  input: CategoryInput,
): Promise<ActionResult<Category>> {
  const { data, error } = await supabase.from('categories').insert(input).select(columns).single()
  if (error) return writeError(error)
  return { ok: true, data }
}

export async function updateCategoryRow(
  supabase: Client,
  id: string,
  input: CategoryInput,
): Promise<ActionResult<Category>> {
  const { data, error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', id)
    .select(columns)
  if (error) return writeError(error)
  if (data.length === 0) return failure('NOT_FOUND', missing)
  return { ok: true, data: data[0] }
}

export async function deleteCategoryRow(supabase: Client, id: string): Promise<ActionResult<null>> {
  const { data, error } = await supabase.from('categories').delete().eq('id', id).select('id')
  if (error?.code === '23503') {
    return failure(
      'CATEGORY_IN_USE',
      'La categoría tiene productos. Muévelos o elimínalos primero.',
    )
  }
  if (error) return writeError(error)
  if (data.length === 0) return failure('NOT_FOUND', missing)
  return { ok: true, data: null }
}
