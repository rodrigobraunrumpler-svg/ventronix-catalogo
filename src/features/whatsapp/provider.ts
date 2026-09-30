import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { baileysWhatsAppProvider } from './baileys-provider'
import { sessionKey } from './session-crypto'
import { stubWhatsAppProvider } from './stub-provider'

export type SendDocumentInput = {
  phone: string
  fileName: string
  document: Buffer
  caption: string
}
export type SendDocumentResult =
  | { ok: true }
  | { ok: false; reason: 'not-linked' | 'busy' | 'no-whatsapp' | 'logged-out' | 'failed' }
export type LinkResult = { ok: true } | { ok: false; reason: 'busy' | 'timeout' | 'failed' }

// Proveedor intercambiable (contexto del proyecto §12): el resto de la app no sabe cuál se usa.
export type WhatsAppProvider = {
  sendDocument: (input: SendDocumentInput) => Promise<SendDocumentResult>
  link: (phone: string, code: string) => Promise<LinkResult>
  unlink: () => Promise<void>
}

// Baileys con la clave de la sesión; el de prueba solo fuera de producción (WHATSAPP_PROVIDER=stub).
// Sin clave, null: la app sigue con el paso 1 (abrir el chat).
export function getWhatsAppProvider(
  supabase: SupabaseClient<Database>,
  env: Record<string, string | undefined> = process.env,
): WhatsAppProvider | null {
  if (env.WHATSAPP_PROVIDER === 'stub' && env.NODE_ENV !== 'production') {
    return stubWhatsAppProvider(supabase)
  }
  const key = sessionKey(env)
  return key ? baileysWhatsAppProvider(supabase, key) : null
}
