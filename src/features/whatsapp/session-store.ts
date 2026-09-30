import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Client = SupabaseClient<Database>

export type StoredSession = { phone: string; state: string; linkedAt: string }

// La fila única de whatsapp_session (spec de WhatsApp §3). El estado llega ya cifrado.
export async function readSession(supabase: Client): Promise<StoredSession | null> {
  const { data, error } = await supabase
    .from('whatsapp_session')
    .select('phone, state, linked_at')
    .maybeSingle()
  if (error) throw error
  if (!data?.phone || !data.state || !data.linked_at) return null
  return { phone: data.phone, state: data.state, linkedAt: data.linked_at }
}

async function update(
  supabase: Client,
  values: Database['public']['Tables']['whatsapp_session']['Update'],
) {
  const { error } = await supabase.from('whatsapp_session').update(values).eq('id', true)
  if (error) throw error
}

export const storeLinkedSession = (supabase: Client, session: { phone: string; state: string }) =>
  update(supabase, { ...session, linked_at: new Date().toISOString() })

// Solo si sigue vinculada: si se desvinculó mientras tanto, no se resucita.
export async function storeSessionState(supabase: Client, state: string) {
  const { error } = await supabase
    .from('whatsapp_session')
    .update({ state })
    .eq('id', true)
    .not('phone', 'is', null)
  if (error) throw error
}

export const clearSession = (supabase: Client) =>
  update(supabase, { phone: null, state: null, linked_at: null, locked_until: null })

// Reserva la sesión para una operación durante `ms`: false si otra la tiene (una reserva vencida,
// de una operación que se cortó, se puede tomar).
export async function lockSession(supabase: Client, ms: number, now = new Date()) {
  const { data, error } = await supabase
    .from('whatsapp_session')
    .update({ locked_until: new Date(now.getTime() + ms).toISOString() })
    .eq('id', true)
    .or(`locked_until.is.null,locked_until.lt.${now.toISOString()}`)
    .select('id')
  if (error) throw error
  return data.length > 0
}

export const unlockSession = (supabase: Client) => update(supabase, { locked_until: null })

// Solo el número y la fecha, para mostrar el estado sin traer la sesión.
export async function readLink(supabase: Client) {
  const { data, error } = await supabase
    .from('whatsapp_session')
    .select('phone, linked_at')
    .maybeSingle()
  if (error) throw error
  return data?.phone && data.linked_at ? { phone: data.phone, linkedAt: data.linked_at } : null
}
