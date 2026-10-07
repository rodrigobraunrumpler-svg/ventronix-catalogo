import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure } from '@/features/catalog/action-errors'
import { getCompanyProfile } from '@/features/company/queries'
import type { CompanyProfile } from '@/features/company/schemas'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import type { DocumentInput, GeneratedDocument } from './input'
import { buildDocumentModel, documentProblem, type DocumentModel } from './model'
import { renderProformaPdf } from './pdf'

// Genera el PDF con los datos de la empresa guardados; no se guarda nada (spec del documento §3).
export async function renderProformaDocument(
  supabase: SupabaseClient<Database>,
  input: DocumentInput,
  now = new Date(),
): Promise<ActionResult<{ model: DocumentModel; pdf: Buffer; company: CompanyProfile }>> {
  const company = await getCompanyProfile(supabase)
  if (!company) return failure('NOT_FOUND', 'No encontramos los datos de tu empresa.')
  const problem = documentProblem(input, company)
  if (problem) return failure('VALIDATION', problem)
  const model = buildDocumentModel(input, company, now)
  return { ok: true, data: { model, pdf: await renderProformaPdf(model), company } }
}

// El PDF viaja al navegador en base64 (descargar, ver y compartir).
export async function createProformaDocument(
  supabase: SupabaseClient<Database>,
  input: DocumentInput,
  now = new Date(),
): Promise<ActionResult<GeneratedDocument>> {
  const result = await renderProformaDocument(supabase, input, now)
  if (!result.ok) return result
  const { model, pdf } = result.data
  return { ok: true, data: { fileName: model.fileName, base64: pdf.toString('base64') } }
}
