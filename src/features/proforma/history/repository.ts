import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, format } from 'date-fns'
import { failure } from '@/features/catalog/action-errors'
import type { CompanyProfile } from '@/features/company/schemas'
import type { ActionResult } from '@/lib/action-result'
import { lima } from '@/lib/dates'
import type { Database } from '@/lib/supabase/database.types'
import type { DocumentInput } from '../document/input'
import { centsToDecimal } from '../money'
import { totalsFromText } from '../totals'
import type { ProformaSnapshot } from './snapshot'

type Client = SupabaseClient<Database>

// Guarda o actualiza la proforma por su número (spec de productos libres §6): «Corregir» deja una
// sola fila, siempre con su última versión. La fecha queda fija en la copia, así el PDF del
// historial sale igual siempre.
export async function saveProforma(
  supabase: Client,
  input: DocumentInput,
  company: CompanyProfile,
  issuedAt: Date,
): Promise<ActionResult<null>> {
  const totals = totalsFromText(input)
  if (!totals || input.number === null) throw new Error('La proforma no es válida.')
  const validityDays = Number(input.validityDays || company.default_validity_days)
  const snapshot: ProformaSnapshot = {
    input: { ...input, issuedAt: issuedAt.toISOString() },
    company,
  }
  const { error } = await supabase.from('proformas').upsert(
    {
      number: input.number,
      issued_at: issuedAt.toISOString(),
      valid_until: format(addDays(issuedAt, validityDays, { in: lima }), 'yyyy-MM-dd', {
        in: lima,
      }),
      client_name: input.client.name.trim(),
      client_document: input.client.document,
      client_phone: input.client.phone.trim(),
      item_count: input.lines.length,
      // ponytail: como el precio del catálogo, el total viaja como texto exacto aunque el tipo
      // generado diga number; PostgREST lo convierte a numeric sin coma flotante.
      total: centsToDecimal(totals.total) as unknown as number,
      document: snapshot,
    },
    { onConflict: 'number' },
  )
  if (error) {
    console.error('[proforma] historial:', error.code, error.message)
    return failure(
      'UNEXPECTED',
      'No pudimos guardar la proforma en el historial. Inténtalo de nuevo.',
    )
  }
  return { ok: true, data: null }
}
