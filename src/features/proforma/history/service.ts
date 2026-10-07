import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure } from '@/features/catalog/action-errors'
import { getCompanyProfile } from '@/features/company/queries'
import type { WhatsAppProvider } from '@/features/whatsapp/provider'
import { NOT_CONFIGURED } from '@/features/whatsapp/service'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import { whatsappMessage } from '../document/format'
import { buildDocumentModel, type DocumentModel } from '../document/model'
import { renderProformaPdf } from '../document/pdf'
import { loadPhotos } from '../document/photos'
import { deliverByWhatsApp } from '../document/send'
import { snapshotSchema, type StoredDocument } from './snapshot'

type Client = SupabaseClient<Database>

const GONE = 'No encontramos esa proforma. Actualiza la lista.'

// El PDF del historial se vuelve a armar desde la copia (spec de productos libres §3): mismos
// productos, precios y datos de la empresa de ese día. El mensaje es el de Empresa de hoy, con los
// datos de esa proforma (plan, decisión 8).
async function renderStored(
  supabase: Client,
  id: string,
): Promise<ActionResult<{ model: DocumentModel; pdf: Buffer; message: string }>> {
  const { data, error } = await supabase
    .from('proformas')
    .select('document')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return failure('NOT_FOUND', GONE)
  const snapshot = snapshotSchema.safeParse(data.document)
  if (!snapshot.success) {
    console.error('[proforma] copia ilegible:', id, snapshot.error.message)
    return failure('UNEXPECTED', 'No pudimos leer la copia guardada de esta proforma.')
  }
  const { input, company } = snapshot.data
  const model = buildDocumentModel(input, company, new Date(input.issuedAt ?? 0))
  const [pdf, current] = await Promise.all([
    loadPhotos(
      supabase,
      model.rows.map((row) => row.photo),
    ).then((images) => renderProformaPdf(model, images)),
    getCompanyProfile(supabase),
  ])
  const message = whatsappMessage(current?.whatsapp_message ?? null, {
    clientName: input.client.name,
    numberLabel: model.numberLabel ?? '',
    total: model.total,
    validUntil: model.validUntil,
    sender: model.author,
  })
  return { ok: true, data: { model, pdf, message } }
}

export async function storedProformaDocument(
  supabase: Client,
  id: string,
): Promise<ActionResult<StoredDocument>> {
  const stored = await renderStored(supabase, id)
  if (!stored.ok) return stored
  const { model, pdf, message } = stored.data
  return { ok: true, data: { fileName: model.fileName, base64: pdf.toString('base64'), message } }
}

// «Reenviar» (spec §4.4): al celular de la proforma o al que se escriba solo para este envío.
export async function resendStoredProforma(
  supabase: Client,
  request: { id: string; phone: string },
  provider: WhatsAppProvider | null,
): Promise<ActionResult<{ phone: string }>> {
  if (!provider) return failure('VALIDATION', NOT_CONFIGURED)
  const stored = await renderStored(supabase, request.id)
  if (!stored.ok) return stored
  return deliverByWhatsApp(provider, {
    phone: request.phone,
    fileName: stored.data.model.fileName,
    document: stored.data.pdf,
    caption: stored.data.message,
  })
}
