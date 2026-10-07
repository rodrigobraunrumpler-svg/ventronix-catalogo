import 'server-only'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { ActionResult } from '@/lib/action-result'
import { PHOTO_BUCKET, thumbPath } from '@/lib/photos'
import type { Database } from '@/lib/supabase/database.types'
import { failure, unexpected } from '../action-errors'
import type { Product, ProductInput } from '../types'
import { productColumns, toProduct } from './queries'

type Client = SupabaseClient<Database>

const duplicateCode = 'Ese código ya está en uso. Elige otro.'
const missingCategory = 'La categoría ya no existe. Elige otra.'
const missing = 'El producto ya no existe. Actualiza la lista.'

// ponytail: el tipo generado dice number, pero PostgREST convierte el string a numeric
// sin pasar por coma flotante; así el precio viaja exacto (spec §6).
function toRow(input: ProductInput) {
  return { ...input, unit_price: input.unit_price as unknown as number }
}

function writeError(error: PostgrestError) {
  if (error.code === '23505') return failure('CONFLICT', duplicateCode, { code: [duplicateCode] })
  if (error.code === '23503') {
    return failure('VALIDATION', missingCategory, { category_id: [missingCategory] })
  }
  console.error('[catálogo] productos:', error.code, error.message)
  return unexpected()
}

export async function createProductRow(
  supabase: Client,
  input: ProductInput,
): Promise<ActionResult<Product>> {
  const { data, error } = await supabase
    .from('products')
    .insert(toRow(input))
    .select(productColumns)
    .single()
  if (error) return writeError(error)
  return { ok: true, data: toProduct(data) }
}

export async function updateProductRow(
  supabase: Client,
  id: string,
  input: ProductInput,
): Promise<ActionResult<Product>> {
  const { data, error } = await supabase
    .from('products')
    .update(toRow(input))
    .eq('id', id)
    .select(productColumns)
  if (error) return writeError(error)
  if (data.length === 0) return failure('NOT_FOUND', missing)
  return { ok: true, data: toProduct(data[0]) }
}

export async function deleteProductRow(supabase: Client, id: string): Promise<ActionResult<null>> {
  const { data, error } = await supabase
    .from('products')
    .delete()
    .eq('id', id)
    .select('id, image_path')
  if (error) return writeError(error)
  if (data.length === 0) return failure('NOT_FOUND', missing)
  // Su foto ya no la usa el catálogo: se borra, salvo que la use una proforma guardada (la base no
  // lo deja). Si no se puede, el producto igual queda eliminado.
  const photo = data[0].image_path
  if (photo) await supabase.storage.from(PHOTO_BUCKET).remove([photo, thumbPath(photo)])
  return { ok: true, data: null }
}
