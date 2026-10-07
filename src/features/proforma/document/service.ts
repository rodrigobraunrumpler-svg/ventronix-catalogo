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
import { loadPhotos } from './photos'
import { saveProforma } from '../history/repository'

// Genera el PDF con los datos de la empresa guardados. Una proforma que no es borrador queda en el
// historial antes de salir del servidor (spec de productos libres §6): si no se guarda, no se
// entrega.
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
  const images = await loadPhotos(
    supabase,
    model.rows.map((row) => row.photo),
  )
  const pdf = await renderProformaPdf(model, images)
  if (!input.draft) {
    const issuedAt = input.issuedAt ? new Date(input.issuedAt) : now
    const saved = await saveProforma(supabase, input, company, issuedAt)
    if (!saved.ok) return saved
  }
  return { ok: true, data: { model, pdf, company } }
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
