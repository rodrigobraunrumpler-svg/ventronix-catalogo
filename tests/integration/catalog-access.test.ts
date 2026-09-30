import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const password = 'prueba-de-acceso-123'
const users = {
  owner: { email: 'acceso-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } },
  intruder: { email: 'acceso-intruso@catalogo.test' },
  forger: { email: 'acceso-falsificador@catalogo.test', userMetadata: { catalog_access: 'owner' } },
}

let db: Client
let owner: SupabaseClient
let intruder: SupabaseClient
let forger: SupabaseClient
let categoryId: string

beforeAll(async () => {
  db = await connect()
  for (const user of Object.values(users)) await ensureUser({ password, ...user })
  owner = await signedInClient(users.owner.email, password)
  intruder = await signedInClient(users.intruder.email, password)
  forger = await signedInClient(users.forger.email, password)
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCatalog(db)
  const { rows } = await db.query<{ id: string }>(
    "insert into public.categories (name) values ('Laptops') returning id",
  )
  categoryId = rows[0].id
  await db.query(
    `insert into public.products (code, name, category_id, unit_price)
     values ('LAP-001', 'Laptop de 14 pulgadas', $1, 2590.00)`,
    [categoryId],
  )
})

async function catalogIsUnchanged() {
  const { rows } = await db.query<{ categories: number; products: number; name: string }>(
    `select (select count(*)::int from public.categories) as categories,
            (select count(*)::int from public.products) as products,
            (select name from public.categories limit 1) as name`,
  )
  expect(rows[0]).toEqual({ categories: 1, products: 1, name: 'Laptops' })
}

describe('acceso al catálogo', () => {
  it('sin sesión no se pueden leer ni modificar filas', async () => {
    const anonymous = publicClient()
    for (const table of ['categories', 'products'] as const) {
      const { data } = await anonymous.from(table).select('id')
      expect(data ?? []).toEqual([])
    }
    const insert = await anonymous.from('categories').insert({ name: 'Nueva' })
    expect(insert.error).not.toBeNull()
    await catalogIsUnchanged()
  })

  it('la cuenta autorizada lee, crea, edita y borra', async () => {
    const read = await owner.from('products').select('code')
    expect(read.data).toEqual([{ code: 'LAP-001' }])

    const created = await owner.from('categories').insert({ name: 'Impresoras' }).select('id')
    expect(created.error).toBeNull()

    const updated = await owner
      .from('categories')
      .update({ name: 'Portátiles' })
      .eq('id', categoryId)
      .select('name')
    expect(updated.data).toEqual([{ name: 'Portátiles' }])

    const removed = await owner.from('products').delete().eq('code', 'LAP-001').select('code')
    expect(removed.data).toEqual([{ code: 'LAP-001' }])
  })

  it.each([
    ['sin marca de administración', () => intruder],
    ['con la marca falsificada en user_metadata', () => forger],
  ])('un usuario autenticado %s no ve ni modifica filas', async (_, client) => {
    const supabase = client()
    for (const table of ['categories', 'products'] as const) {
      const { data } = await supabase.from(table).select('id')
      expect(data).toEqual([])
    }
    const insert = await supabase.from('categories').insert({ name: 'Intrusa' })
    expect(insert.error?.code).toBe('42501')
    const update = await supabase
      .from('categories')
      .update({ name: 'Cambiada' })
      .eq('id', categoryId)
      .select('id')
    expect(update.data ?? []).toEqual([])
    const removed = await supabase.from('products').delete().eq('code', 'LAP-001').select('id')
    expect(removed.data ?? []).toEqual([])
    await catalogIsUnchanged()
  })

  it('cambiar user_metadata desde la sesión no concede acceso', async () => {
    await intruder.auth.updateUser({ data: { catalog_access: 'owner' } })
    await intruder.auth.refreshSession()
    const { data } = await intruder.from('categories').select('id')
    expect(data).toEqual([])
  })

  it('no permite registrarse sin pasar por administración', async () => {
    const { error } = await publicClient().auth.signUp({
      email: 'registro-publico@catalogo.test',
      password: 'una-clave-cualquiera-123',
    })
    expect(error).not.toBeNull()
  })

  it('la cuenta autorizada no usa la API de administración ni cambia su propia marca', async () => {
    const listing = await owner.auth.admin.listUsers()
    expect(listing.error).not.toBeNull()

    await owner.auth.updateUser({ data: { catalog_access: 'nadie' } })
    const { data } = await owner.auth.getUser()
    expect(data.user?.app_metadata.catalog_access).toBe('owner')
  })
})
