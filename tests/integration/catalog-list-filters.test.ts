import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const password = 'filtros-clave-123'
const owner = { email: 'filtros-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'filtros-intruso@catalogo.test' }

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient
let laptops: string

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
  const { rows } = await db.query<{ id: string }>(
    "insert into public.categories (name) values ('Laptops') returning id",
  )
  laptops = rows[0].id
})

// Fechas exactas: el disparador de updated_at solo actúa al actualizar, no al insertar.
async function insert(
  code: string,
  name: string,
  price: string,
  created: string,
  updated = created,
) {
  await db.query(
    `insert into public.products (code, name, category_id, unit_price, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [code, name, laptops, price, created, updated],
  )
}

type Item = { code: string; unit_price: string; category_name: string }
type Page = { total: number; items: Item[] }
type Stats = { products: number; created_this_month: number; updated_last_7_days: number }

async function call<T>(fn: string, args: Record<string, unknown> = {}, client = supabase) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}
const codes = (items: Item[]) => items.map((item) => item.code)
const secondBefore = (instant: string) => new Date(Date.parse(instant) - 1000).toISOString()

describe('search_products con fecha y orden', () => {
  it('filtra por días de Lima: el límite es la medianoche de Lima, no la de UTC', async () => {
    await insert('A', 'Antes', '10', '2026-09-30T23:59:59-05:00')
    await insert('B', 'Inicio', '10', '2026-10-01T00:00:00-05:00')
    await insert('C', 'Final', '10', '2026-10-01T23:59:59-05:00')
    await insert('D', 'Después', '10', '2026-10-02T00:00:00-05:00')
    const page = await call<Page>('search_products', {
      date_from: '2026-10-01',
      date_to: '2026-10-01',
    })
    expect(codes(page.items).sort()).toEqual(['B', 'C'])
  })

  it('con date_by = updated usa la fecha de modificación', async () => {
    await insert(
      'A',
      'Viejo editado',
      '10',
      '2026-01-10T10:00:00-05:00',
      '2026-10-01T10:00:00-05:00',
    )
    await insert('B', 'Nuevo', '10', '2026-10-01T10:00:00-05:00')
    await insert('C', 'Viejo', '10', '2026-01-10T10:00:00-05:00')
    const day = { date_from: '2026-10-01', date_to: '2026-10-01' }
    expect(codes((await call<Page>('search_products', day)).items)).toEqual(['B'])
    const updated = await call<Page>('search_products', { ...day, date_by: 'updated' })
    expect(codes(updated.items).sort()).toEqual(['A', 'B'])
  })

  it('acepta rangos abiertos por un lado', async () => {
    await insert('A', 'Uno', '10', '2026-09-01T12:00:00-05:00')
    await insert('B', 'Dos', '10', '2026-10-01T12:00:00-05:00')
    const from = await call<Page>('search_products', { date_from: '2026-09-15' })
    expect(codes(from.items)).toEqual(['B'])
    const to = await call<Page>('search_products', { date_to: '2026-09-15' })
    expect(codes(to.items)).toEqual(['A'])
  })

  it.each([
    ['name', ['A', 'B', 'C']],
    ['newest', ['C', 'A', 'B']],
    ['updated', ['B', 'C', 'A']],
    ['price-asc', ['B', 'C', 'A']],
    ['price-desc', ['A', 'C', 'B']],
  ])('ordena por %s', async (sort, expected) => {
    await insert('A', 'Alfa', '300', '2026-10-01T10:00:00-05:00')
    await insert('B', 'Beta', '100', '2026-09-01T10:00:00-05:00', '2026-10-03T10:00:00-05:00')
    await insert('C', 'Gamma', '200', '2026-10-02T10:00:00-05:00')
    expect(codes((await call<Page>('search_products', { sort })).items)).toEqual(expected)
  })

  it('con empates, las páginas no repiten ni saltan productos', async () => {
    for (const code of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      await insert(code, 'Igual', '50', '2026-10-01T10:00:00-05:00')
    }
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        call<Page>('search_products', { sort: 'price-asc', page, page_size: 2 }),
      ),
    )
    const all = pages.flatMap((page) => codes(page.items))
    expect(all).toHaveLength(5)
    expect(new Set(all).size).toBe(5)
    expect(pages[0].total).toBe(5)
  })

  it('la llamada de antes (sin fecha ni orden) sigue igual: por nombre', async () => {
    await insert('B', 'Beta', '10', '2026-10-01T10:00:00-05:00')
    await insert('A', 'Alfa', '25.50', '2026-10-01T10:00:00-05:00')
    const page = await call<Page>('search_products', { search: '', page: 1, page_size: 50 })
    expect(page.total).toBe(2)
    expect(codes(page.items)).toEqual(['A', 'B'])
    expect(page.items[0]).toMatchObject({ category_name: 'Laptops', unit_price: '25.50' })
  })
})

describe('export_products', () => {
  it('devuelve lo filtrado, en el orden pedido y hasta max_rows', async () => {
    await insert('A', 'Alfa', '300', '2026-10-01T10:00:00-05:00')
    await insert('B', 'Beta', '100', '2026-10-01T10:00:00-05:00')
    await insert('C', 'Gamma', '200', '2026-10-02T10:00:00-05:00')
    const rows = await call<Item[]>('export_products', { sort: 'price-asc' })
    expect(codes(rows)).toEqual(['B', 'C', 'A'])
    expect(rows[0]).toMatchObject({ category_name: 'Laptops', unit_price: '100' })
    const capped = await call<Item[]>('export_products', { sort: 'price-asc', max_rows: 2 })
    expect(codes(capped)).toEqual(['B', 'C'])
    const dated = await call<Item[]>('export_products', { date_from: '2026-10-02' })
    expect(codes(dated)).toEqual(['C'])
  })

  it('sin productos da una lista vacía, y una cuenta sin permiso no ve nada', async () => {
    expect(await call('export_products')).toEqual([])
    await insert('A', 'Alfa', '300', '2026-10-01T10:00:00-05:00')
    expect(await call('export_products', {}, outsider)).toEqual([])
  })
})

describe('catalog_stats', () => {
  // Inicio del mes y de los últimos 7 días en Lima, calculados por la base: no dependen del reloj
  // del equipo.
  async function limaStarts() {
    const { rows } = await db.query<{ month: string; week: string }>(
      `select to_char(date_trunc('month', now() at time zone 'America/Lima'), 'YYYY-MM-DD') as month,
              to_char((now() at time zone 'America/Lima')::date - 6, 'YYYY-MM-DD') as week`,
    )
    return {
      month: `${rows[0].month}T00:00:00-05:00`,
      week: `${rows[0].week}T00:00:00-05:00`,
    }
  }

  it('cuenta los registrados desde el día 1 del mes de Lima', async () => {
    const { month } = await limaStarts()
    await insert('A', 'Primer instante del mes', '10', month)
    await insert('B', 'Último instante del mes anterior', '10', secondBefore(month))
    expect(await call<Stats>('catalog_stats')).toMatchObject({
      products: 2,
      created_this_month: 1,
    })
  })

  it('cuenta los modificados en los últimos 7 días de Lima (hoy y los 6 anteriores)', async () => {
    const { week } = await limaStarts()
    await insert('A', 'Dentro', '10', '2020-01-01T10:00:00-05:00', week)
    await insert('B', 'Fuera', '10', '2020-01-01T10:00:00-05:00', secondBefore(week))
    expect((await call<Stats>('catalog_stats')).updated_last_7_days).toBe(1)
  })

  it('una cuenta sin permiso ve todo en cero', async () => {
    await insert('A', 'Alfa', '10', '2026-10-01T10:00:00-05:00')
    expect(await call<Stats>('catalog_stats', {}, outsider)).toEqual({
      products: 0,
      created_this_month: 0,
      updated_last_7_days: 0,
    })
  })
})

describe('permisos', () => {
  it('sin sesión no se puede llamar a ninguna de las funciones', async () => {
    const anonymous = publicClient()
    for (const fn of ['filter_products', 'search_products', 'export_products', 'catalog_stats']) {
      const { error } = await anonymous.rpc(fn)
      expect(error?.code).toBe('42501')
    }
  })
})
