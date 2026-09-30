'use server'

import { unexpected } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'

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
