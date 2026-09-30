import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect } from './db'

const password = 'numeracion-clave-123'
const owner = { email: 'numeracion-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'numeracion-intruso@catalogo.test' }

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
  await db.end()
})

async function sequenceState() {
  const { rows } = await db.query('select last_value, is_called from public.proforma_number_seq')
  return rows[0]
}

describe('numeración de proformas', () => {
  it('la cuenta autorizada recibe números consecutivos', async () => {
    const first = await supabase.rpc('next_proforma_number')
    const second = await supabase.rpc('next_proforma_number')
    expect(first.error).toBeNull()
    expect(second.data).toBe(Number(first.data) + 1)
  })

  it('una cuenta sin autorización no obtiene número ni gasta la secuencia', async () => {
    const before = await sequenceState()
    const { data, error } = await outsider.rpc('next_proforma_number')
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
    expect(await sequenceState()).toEqual(before)
  })

  it('sin sesión no se puede pedir un número', async () => {
    const { error } = await publicClient().rpc('next_proforma_number')
    expect(error).not.toBeNull()
  })
})
