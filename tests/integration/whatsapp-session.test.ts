import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  clearSession,
  lockSession,
  readSession,
  storeLinkedSession,
  storeSessionState,
  unlockSession,
} from '@/features/whatsapp/session-store'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetWhatsAppSession, sqlState } from './db'

const password = 'whatsapp-clave-123'
const owner = { email: 'whatsapp-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'whatsapp-intruso@catalogo.test' }

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  await ensureUser({ password, ...intruder })
  supabase = await signedInClient(owner.email, password)
  outsider = await signedInClient(intruder.email, password)
})

afterAll(async () => {
  await resetWhatsAppSession(db)
  await db.end()
})

beforeEach(async () => {
  await resetWhatsAppSession(db)
})

describe('sesión de WhatsApp', () => {
  it('empieza sin vincular, guarda la vinculación y el estado, y se borra', async () => {
    expect(await readSession(supabase)).toBeNull()
    await storeLinkedSession(supabase, { phone: '987654321', state: 'cifrado-1' })
    expect(await readSession(supabase)).toMatchObject({ phone: '987654321', state: 'cifrado-1' })
    await storeSessionState(supabase, 'cifrado-2')
    expect(await readSession(supabase)).toMatchObject({ phone: '987654321', state: 'cifrado-2' })
    await clearSession(supabase)
    expect(await readSession(supabase)).toBeNull()
  })

  it('una sola operación a la vez; una reserva vencida se puede tomar', async () => {
    expect(await lockSession(supabase, 60_000)).toBe(true)
    expect(await lockSession(supabase, 60_000)).toBe(false)
    await unlockSession(supabase)
    const twoMinutesAgo = new Date(Date.now() - 120_000)
    expect(await lockSession(supabase, 60_000, twoMinutesAgo)).toBe(true)
    expect(await lockSession(supabase, 60_000)).toBe(true)
  })

  it('solo la cuenta autorizada la ve y la cambia', async () => {
    await storeLinkedSession(supabase, { phone: '987654321', state: 'cifrado-1' })
    expect((await outsider.from('whatsapp_session').select('state')).data).toEqual([])
    expect(await lockSession(outsider, 60_000)).toBe(false)
    const anonymous = await publicClient().from('whatsapp_session').select('state')
    expect(anonymous.data ?? []).toEqual([])
    expect((await supabase.from('whatsapp_session').insert({})).error?.code).toBe('42501')
  })

  it('la base exige un celular válido y la sesión completa', async () => {
    expect(
      await sqlState(db.query("update public.whatsapp_session set phone = '123', state = 'x'")),
    ).toBe('23514')
    expect(await sqlState(db.query("update public.whatsapp_session set state = 'x'"))).toBe('23514')
  })
})
