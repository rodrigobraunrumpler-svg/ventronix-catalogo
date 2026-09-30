'use server'

import { z } from 'zod'
import { invalid, unexpected } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { getWhatsAppProvider } from '@/features/whatsapp/provider'
import { isValidRuc } from '@/lib/peru'
import { documentInputSchema, type GeneratedDocument } from './document/input'
import { sendProformaDocument } from './document/send'
import { createProformaDocument } from './document/service'
import type { RucLookupResult } from './ruc'
import { getRucProvider } from './ruc-provider'

// El número se pide al pulsar «Generar» (spec §6.3). Un número que no se usa deja un hueco.
export async function reserveProformaNumber(): Promise<ActionResult<number>> {
  return withOwner(async ({ supabase }) => {
    const { data, error } = await supabase.rpc('next_proforma_number')
    if (error) {
      console.error('[proforma] numeración:', error.code, error.message)
      return unexpected()
    }
    return { ok: true, data }
  })
}

const rucSchema = z.string().refine(isValidRuc, 'El RUC no es válido.')

// Consulta a SUNAT con la clave solo de servidor (spec §7), con unos 5 segundos como máximo.
export async function lookupRuc(ruc: unknown): Promise<ActionResult<RucLookupResult>> {
  return withOwner(async () => {
    const parsed = rucSchema.safeParse(ruc)
    if (!parsed.success) return invalid(parsed.error)
    const result = await getRucProvider().lookup(parsed.data, AbortSignal.timeout(5000))
    return { ok: true, data: result }
  })
}

// PDF de la proforma (spec del documento §3): la cuenta autorizada, datos validados y nada guardado.
export async function generateProformaDocument(
  input: unknown,
): Promise<ActionResult<GeneratedDocument>> {
  return withOwner(async ({ supabase }) => {
    const parsed = documentInputSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return createProformaDocument(supabase, parsed.data)
  })
}

// Envío automático por WhatsApp (spec de WhatsApp §4). Conecta, envía y guarda la sesión: hasta
// un minuto (maxDuration de Productos).
export async function sendProformaByWhatsApp(
  input: unknown,
): Promise<ActionResult<{ phone: string }>> {
  return withOwner(async ({ supabase }) => {
    const parsed = documentInputSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return sendProformaDocument(supabase, parsed.data, getWhatsAppProvider(supabase))
  })
}
