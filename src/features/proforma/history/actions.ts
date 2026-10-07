'use server'

import { z } from 'zod'
import { invalid } from '@/features/catalog/action-errors'
import { idSchema } from '@/features/catalog/schemas'
import { getWhatsAppProvider } from '@/features/whatsapp/provider'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { resendStoredProforma, storedProformaDocument } from './service'
import type { StoredDocument } from './snapshot'

// «Ver PDF», «Descargar PDF» y el mensaje de «Reenviar» (spec de productos libres §6).
export async function getProformaDocument(id: unknown): Promise<ActionResult<StoredDocument>> {
  return withOwner(async ({ supabase }) => {
    const parsed = idSchema.safeParse(id)
    if (!parsed.success) return invalid(parsed.error)
    return storedProformaDocument(supabase, parsed.data)
  })
}

const resendSchema = z.object({ id: idSchema, phone: z.string().max(20) })

// Reenvío con el WhatsApp de la empresa (spec §4.4): conecta, envía y guarda la sesión, hasta un
// minuto (maxDuration de Proformas).
export async function resendProforma(input: unknown): Promise<ActionResult<{ phone: string }>> {
  return withOwner(async ({ supabase }) => {
    const parsed = resendSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return resendStoredProforma(supabase, parsed.data, getWhatsAppProvider(supabase))
  })
}
