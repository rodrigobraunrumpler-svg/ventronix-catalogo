'use server'

import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { getWhatsAppProvider } from './provider'
import type { WhatsAppStatus } from './schemas'
import { linkWhatsAppNumber, unlinkWhatsAppNumber, whatsAppStatus } from './service'

export async function getWhatsAppStatus(): Promise<ActionResult<WhatsAppStatus>> {
  return withOwner(({ supabase }) => whatsAppStatus(supabase, getWhatsAppProvider(supabase)))
}

// Espera hasta 2 minutos a que se escriba el código en el teléfono (maxDuration de «Empresa»).
export async function linkWhatsApp(input: unknown): Promise<ActionResult<WhatsAppStatus>> {
  return withOwner(({ supabase }) =>
    linkWhatsAppNumber(supabase, getWhatsAppProvider(supabase), input),
  )
}

export async function unlinkWhatsApp(): Promise<ActionResult<WhatsAppStatus>> {
  return withOwner(({ supabase }) => unlinkWhatsAppNumber(supabase, getWhatsAppProvider(supabase)))
}
