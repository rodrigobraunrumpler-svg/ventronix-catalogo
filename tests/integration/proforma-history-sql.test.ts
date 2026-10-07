import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetProformas, sqlState } from './db'

const password = 'historial-clave-123'
const owner = { email: 'historial-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'historial-intruso@catalogo.test' }

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
  await resetProformas(db)
  await db.end()
})

beforeEach(async () => {
  await resetProformas(db)
})

type Saved = {
  number: number
  issued_at?: string
  client_name?: string
  client_document?: string
  client_phone?: string
  total?: string
  document?: object
}

function insert({
  number,
  issued_at = '2026-10-01T15:00:00Z',
  client_name = 'Cliente de prueba',
  client_document = '20000000001',
  client_phone = '987654321',
  total = '100.00',
  document = {},
}: Saved) {
  return db.query(
    `insert into public.proformas
       (number, issued_at, valid_until, client_name, client_document, client_phone, item_count,
        total, document)
     values ($1, $2, '2026-10-08', $3, $4, $5, 2, $6, $7)`,
    [number, issued_at, client_name, client_document, client_phone, total, document],
  )
}

type Page = {
  total: number
  sum: string
  all: number
  this_month: number
  items: {
    number: number
    client_name: string
    client_document: string
    item_count: number
    total: string
    valid_until: string
  }[]
}

async function search(args: Record<string, unknown> = {}, client = supabase) {
  const { data, error } = await client.rpc('search_proformas', args)
  if (error) throw error
  return data as unknown as Page
}

const numbers = (page: Page) => page.items.map((item) => item.number)

describe('search_proformas', () => {
  it('devuelve 20 por página, de la más reciente a la más antigua, con el total y la suma', async () => {
    for (let number = 1; number <= 25; number++) await insert({ number, total: '10.50' })
    const first = await search()
    expect(first).toMatchObject({ total: 25, sum: '262.50', all: 25 })
    expect(numbers(first)).toEqual(Array.from({ length: 20 }, (_, index) => 25 - index))
    expect(first.items[0]).toMatchObject({
      client_name: 'Cliente de prueba',
      client_document: '20000000001',
      item_count: 2,
      total: '10.50',
      valid_until: '2026-10-08',
    })
    expect(numbers(await search({ page: 2 }))).toEqual([5, 4, 3, 2, 1])
    expect(await search({ page: 3 })).toMatchObject({ total: 25, items: [] })
  })

  it('busca por nombre sin tildes ni mayúsculas, por RUC o DNI, con %, _ y \\ como texto', async () => {
    await insert({ number: 1, client_name: 'José Pérez', client_document: '12345678' })
    await insert({
      number: 2,
      client_name: 'Inversiones Nuevo Sol S.A.C.',
      client_document: '20601234567',
    })
    await insert({ number: 3, client_name: '100% Hogar_Tienda\\Sur', client_document: '' })
    expect(numbers(await search({ search: 'jose perez' }))).toEqual([1])
    expect(numbers(await search({ search: 'NUEVO SOL' }))).toEqual([2])
    expect(numbers(await search({ search: '206012' }))).toEqual([2])
    for (const literal of ['%', '_', '\\']) {
      expect(numbers(await search({ search: literal }))).toEqual([3])
    }
  })

  it('busca también por N° de proforma (esa va primero) y por celular, con o sin espacios', async () => {
    await insert({ number: 42, client_name: 'Cliente cuarenta y dos', client_document: '' })
    await insert({
      number: 50,
      client_name: 'Otro cliente',
      client_document: '20000000142',
      client_phone: '911 222 333',
    })
    expect(numbers(await search({ search: '42' }))).toEqual([42, 50])
    expect(numbers(await search({ search: '0042' }))).toEqual([42])
    expect(numbers(await search({ search: '911222' }))).toEqual([50])
    expect(numbers(await search({ search: '911 222' }))).toEqual([50])
  })

  it('filtra por días de Lima', async () => {
    await insert({ number: 1, issued_at: '2026-10-06T04:30:00Z' }) // 23:30 del 5 de octubre en Lima
    await insert({ number: 2, issued_at: '2026-10-06T05:30:00Z' }) // 00:30 del 6 en Lima
    expect(numbers(await search({ date_from: '2026-10-05', date_to: '2026-10-05' }))).toEqual([1])
    expect(numbers(await search({ date_from: '2026-10-06' }))).toEqual([2])
    expect(numbers(await search({ date_to: '2026-10-05' }))).toEqual([1])
  })

  it('cuenta todas y las de este mes en Lima, sin importar el filtro', async () => {
    await insert({ number: 1, issued_at: new Date().toISOString() })
    await insert({
      number: 2,
      issued_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      client_name: 'Otro cliente',
    })
    expect(await search({ search: 'otro' })).toMatchObject({ total: 1, all: 2, this_month: 1 })
  })
})

describe('export_proformas', () => {
  it('devuelve lo filtrado en el mismo orden, hasta el tope pedido', async () => {
    for (let number = 1; number <= 3; number++) await insert({ number })
    const { data, error } = await supabase.rpc('export_proformas', { max_rows: 2 })
    if (error) throw error
    expect((data as unknown as { number: number }[]).map((row) => row.number)).toEqual([3, 2])
  })
})

describe('permisos', () => {
  it('otra cuenta no ve ni crea proformas; nadie las borra', async () => {
    await insert({ number: 1 })
    expect(await search({}, outsider)).toMatchObject({ total: 0, all: 0, items: [] })
    const row = {
      number: 2,
      issued_at: '2026-10-01T15:00:00Z',
      valid_until: '2026-10-08',
      client_name: 'Cliente',
      item_count: 1,
      total: 10,
      document: {},
    }
    expect((await outsider.from('proformas').insert(row)).error?.code).toBe('42501')
    expect((await supabase.from('proformas').delete().eq('number', 1)).error?.code).toBe('42501')
  })

  it('sin sesión no se pueden usar las funciones', async () => {
    for (const fn of ['filter_proformas', 'search_proformas', 'export_proformas']) {
      expect((await publicClient().rpc(fn)).error?.code).toBe('42501')
    }
  })

  it('la base rechaza un documento que no es DNI ni RUC y un número repetido', async () => {
    await insert({ number: 1 })
    expect(await sqlState(insert({ number: 2, client_document: '123' }))).toBe('23514')
    expect(await sqlState(insert({ number: 1 }))).toBe('23505')
  })
})
