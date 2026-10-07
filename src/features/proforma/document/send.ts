import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure } from '@/features/catalog/action-errors'
import { formatMobile } from '@/features/company/format'
import type { WhatsAppProvider, SendDocumentResult } from '@/features/whatsapp/provider'
import { NOT_CONFIGURED } from '@/features/whatsapp/service'
import type { ActionResult, ActionErrorCode } from '@/lib/action-result'
import { digitsOnly, isValidMobile } from '@/lib/peru'
import type { Database } from '@/lib/supabase/database.types'
import { whatsappMessage } from './format'
import type { DocumentInput } from './input'
import { renderProformaDocument } from './service'

type Failed = Exclude<SendDocumentResult, { ok: true }>['reason']

const SEND_ERRORS: Record<Failed, (phone: string) => [ActionErrorCode, string]> = {
  'not-linked': () => ['NOT_FOUND', 'Vincula el WhatsApp de la empresa en Empresa para enviarla.'],
  busy: () => ['CONFLICT', 'Hay otro envío en curso. Inténtalo en unos segundos.'],
  'no-whatsapp': (phone) => ['VALIDATION', `El ${phone} no tiene WhatsApp.`],
  'logged-out': () => ['NOT_FOUND', 'WhatsApp se desvinculó. Vuelve a vincularlo en Empresa.'],
  failed: () => ['UNEXPECTED', 'No pudimos enviarla por WhatsApp.'],
}

// Envío automático (spec de WhatsApp §4): el mismo PDF de «Descargar PDF», con el mensaje del paso 1
// como pie, al celular del cliente desde el WhatsApp de la empresa.
export async function sendProformaDocument(
  supabase: SupabaseClient<Database>,
  input: DocumentInput,
  provider: WhatsAppProvider | null,
): Promise<ActionResult<{ phone: string }>> {
  if (!provider) return failure('VALIDATION', NOT_CONFIGURED)
  if (input.draft) return failure('VALIDATION', 'Genera la proforma para enviarla.')
  const phone = digitsOnly(input.client.phone)
  if (!isValidMobile(phone)) {
    return failure('VALIDATION', 'Añade el celular del cliente para enviarla por WhatsApp.')
  }
  const document = await renderProformaDocument(supabase, input)
  if (!document.ok) return document
  const { model, pdf, company } = document.data
  const result = await provider.sendDocument({
    phone,
    fileName: model.fileName,
    document: pdf,
    caption: whatsappMessage(company.whatsapp_message, {
      clientName: input.client.name,
      numberLabel: model.numberLabel ?? '',
      total: model.total,
      validUntil: model.validUntil,
      sender: model.author,
    }),
  })
  if (!result.ok) return failure(...SEND_ERRORS[result.reason](formatMobile(phone)))
  return { ok: true, data: { phone: formatMobile(phone) } }
}
