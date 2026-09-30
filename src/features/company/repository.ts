import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure, unexpected } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import { companyColumns, toCompanyProfile } from './queries'
import type { CompanyInput, CompanyProfile } from './schemas'

type Client = SupabaseClient<Database>

// Con RLS, una cuenta sin permiso no actualiza ninguna fila: se informa como NOT_FOUND.
export async function saveCompanyProfileRow(
  supabase: Client,
  input: CompanyInput,
): Promise<ActionResult<CompanyProfile>> {
  const { data, error } = await supabase
    .from('company_profile')
    .update({ ...input, phones: input.phones.map((phone) => phone.number) })
    .eq('id', true)
    .select(companyColumns)
  if (error) {
    console.error('[empresa] guardar:', error.code, error.message)
    return unexpected()
  }
  if (data.length === 0) {
    return failure('NOT_FOUND', 'No encontramos los datos de la empresa. Recarga la página.')
  }
  return { ok: true, data: toCompanyProfile(data[0]) }
}
