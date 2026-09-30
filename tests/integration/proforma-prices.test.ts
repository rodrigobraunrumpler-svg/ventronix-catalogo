import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getCurrentPrices } from '@/features/proforma/queries'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const password = 'precios-clave-123'
const owner = { email: 'precios-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'precios-intruso@catalogo.test' }
const missingId = '6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a'

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient
let laptop: string

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

beforeEach(async () => {
  await resetCatalog(db)
  const category = await db.query<{ id: string }>(
    "insert into public.categories (name) values ('Laptops') returning id",
  )
  const product = await db.query<{ id: string }>(
    `insert into public.products (code, name, category_id, unit_price)
     values ('LAP-001', 'Laptop de 14 pulgadas', $1, 2490) returning id`,
    [category.rows[0].id],
  )
  laptop = product.rows[0].id
})

describe('precios actuales para la proforma', () => {
  it('devuelve el precio normalizado y omite los productos que ya no existen', async () => {
    const prices = await getCurrentPrices(supabase, [laptop, missingId])
    expect([...prices]).toEqual([[laptop, '2490.00']])
  })

  it('una cuenta sin autorización no ve precios', async () => {
    expect((await getCurrentPrices(outsider, [laptop])).size).toBe(0)
  })
})
