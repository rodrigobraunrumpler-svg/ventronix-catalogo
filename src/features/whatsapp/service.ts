import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure, invalid } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import type { LinkResult, WhatsAppProvider } from './provider'
import { linkSchema, type WhatsAppStatus } from './schemas'
import { readLink } from './session-store'

type Client = SupabaseClient<Database>

export const NOT_CONFIGURED = 'El envío automático por WhatsApp no está configurado.'

const LINK_ERRORS: Record<Exclude<LinkResult, { ok: true }>['reason'], string> = {
  busy: 'Hay otra operación de WhatsApp en curso. Inténtalo en unos segundos.',
  timeout: 'No se vinculó a tiempo. Genera otro código.',
  failed: 'No pudimos vincular WhatsApp. Inténtalo de nuevo.',
}

// Estado para las pantallas: sin la sesión, que nunca sale del servidor.
export async function whatsAppStatus(
  supabase: Client,
  provider: WhatsAppProvider | null,
): Promise<ActionResult<WhatsAppStatus>> {
  const link = await readLink(supabase)
  return {
    ok: true,
    data: {
      configured: provider !== null,
      phone: link?.phone ?? null,
      linkedAt: link?.linkedAt ?? null,
    },
  }
}

export async function linkWhatsAppNumber(
  supabase: Client,
  provider: WhatsAppProvider | null,
  input: unknown,
): Promise<ActionResult<WhatsAppStatus>> {
  const parsed = linkSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  if (!provider) return failure('VALIDATION', NOT_CONFIGURED)
  const result = await provider.link(parsed.data.phone, parsed.data.code)
  if (!result.ok) {
    return failure(result.reason === 'busy' ? 'CONFLICT' : 'UNEXPECTED', LINK_ERRORS[result.reason])
  }
  return whatsAppStatus(supabase, provider)
}

export async function unlinkWhatsAppNumber(
  supabase: Client,
  provider: WhatsAppProvider | null,
): Promise<ActionResult<WhatsAppStatus>> {
  if (!provider) return failure('VALIDATION', NOT_CONFIGURED)
  await provider.unlink()
  return whatsAppStatus(supabase, provider)
}
