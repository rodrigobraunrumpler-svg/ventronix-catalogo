import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure } from '@/features/catalog/action-errors'
import { getCompanyProfile } from '@/features/company/queries'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import type { DocumentInput, GeneratedDocument } from './input'
import { buildDocumentModel, documentProblem } from './model'
import { renderProformaPdf } from './pdf'

// Genera el PDF con los datos de la empresa guardados; no se guarda nada (spec del documento §3).
export async function createProformaDocument(
  supabase: SupabaseClient<Database>,
  input: DocumentInput,
  now = new Date(),
): Promise<ActionResult<GeneratedDocument>> {
  const company = await getCompanyProfile(supabase)
  if (!company) return failure('NOT_FOUND', 'No encontramos los datos de tu empresa.')
  const problem = documentProblem(input, company)
  if (problem) return failure('VALIDATION', problem)
  const model = buildDocumentModel(input, company, now)
  const pdf = await renderProformaPdf(model)
  return { ok: true, data: { fileName: model.fileName, base64: pdf.toString('base64') } }
}
