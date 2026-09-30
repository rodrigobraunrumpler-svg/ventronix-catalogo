import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { WhatsAppProvider } from './provider'
import { clearSession, readSession, storeLinkedSession } from './session-store'

// Solo para pruebas automáticas y desarrollo (WHATSAPP_PROVIDER=stub): nunca se conecta a WhatsApp.
// Vincula al instante y «envía» a cualquier celular salvo al 911111111, que no tiene WhatsApp.
export function stubWhatsAppProvider(supabase: SupabaseClient<Database>): WhatsAppProvider {
  return {
    async link(phone) {
      await storeLinkedSession(supabase, { phone, state: 'prueba' })
      return { ok: true }
    },
    async sendDocument({ phone }) {
      if (!(await readSession(supabase))) return { ok: false, reason: 'not-linked' }
      return phone === '911111111' ? { ok: false, reason: 'no-whatsapp' } : { ok: true }
    },
    async unlink() {
      await clearSession(supabase)
    },
  }
}
