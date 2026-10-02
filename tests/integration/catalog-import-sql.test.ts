import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const password = 'importar-clave-123'
const owner = { email: 'importar-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'importar-intruso@catalogo.test' }
const ALL = ['name', 'description', 'category', 'price']
const OLD = '2026-01-01T10:00:00-05:00'

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
  await db.query(
    `insert into public.products (code, name, description, category_id, unit_price, created_at, updated_at)
     values ('LAP-1', 'Laptop uno', 'Vieja', $1, 1000, $2, $2),
            ('LAP-2', 'Laptop dos', null, $1, 2000, $2, $2),
            ('LAP-3', 'Laptop tres', null, $1, 3000, $2, $2)`,
    [laptops, OLD],
  )
})

type Row = {
  line: number
  code: string
  name?: string
  description?: string | null
  category?: string
  price?: string
}
type Plan = {
  line: number
  exists: boolean
  category_exists: boolean
  current_name: string | null
  current_price: string | null
  name_changed: boolean
  description_changed: boolean
  category_changed: boolean
  price_changed: boolean
  name_taken_by: string | null
}
type Change = {
  code: string
  product: string
  action: string
  field: string | null
  before: string | null
  after: string | null
}
type Result = {
  created: number
  updated: number
  unchanged: number
  skipped: number
  categories_created: string[]
  changes: Change[]
  previous: { code: string; name: string; description: string | null; price: string }[]
}

async function preview(rows: Row[], columns = ALL) {
  const { data, error } = await supabase.rpc('preview_product_import', { rows, columns })
  if (error) throw error
  return data as Plan[]
}

async function importRows(rows: Row[], columns = ALL, mode = 'all', client = supabase) {
  const { data, error } = await client.rpc('import_products', { rows, columns, mode })
  if (error) throw error
  return data as Result
}

async function catalog() {
  const { rows } = await db.query<{
    code: string
    name: string
    description: string | null
    price: string
    category: string
    touched: boolean
  }>(
    `select p.code, p.name, p.description, p.unit_price::text as price, c.name as category,
            p.updated_at > $1::timestamptz as touched
     from public.products p join public.categories c on c.id = p.category_id order by p.code`,
    [OLD],
  )
  return rows
}

const mixed: Row[] = [
  {
    line: 2,
    code: 'LAP-1',
    name: 'Laptop uno',
    description: 'Nueva',
    category: 'laptops',
    price: '1100.00',
  },
  {
    line: 3,
    code: 'LAP-2',
    name: 'Laptop dos',
    description: null,
    category: 'Laptops',
    price: '2000.00',
  },
  {
    line: 4,
    code: 'MON-1',
    name: 'Monitor 24',
    description: null,
    category: 'Monitores',
    price: '500.50',
  },
  {
    line: 5,
    code: 'MON-2',
    name: 'Laptop TRES',
    description: null,
    category: 'monitores',
    price: '600.00',
  },
]

describe('preview_product_import', () => {
  it('dice qué existe, qué cambia y qué nombre ya usa otro código', async () => {
    const plan = await preview(mixed)
    expect(plan.map((row) => [row.line, row.exists, row.category_exists])).toEqual([
      [2, true, true],
      [3, true, true],
      [4, false, false],
      [5, false, false],
    ])
    expect(plan[0]).toMatchObject({
      current_name: 'Laptop uno',
      current_price: '1000',
      name_changed: false,
      description_changed: true,
      category_changed: false,
      price_changed: true,
    })
    expect(plan[1]).toMatchObject({ description_changed: false, price_changed: false })
    expect(plan[3].name_taken_by).toBe('LAP-3')
  })

  it('con solo Código y Precio no compara las demás columnas', async () => {
    const [row] = await preview([{ line: 2, code: 'LAP-1', price: '1000.00' }], ['price'])
    expect(row).toMatchObject({
      exists: true,
      name_changed: false,
      description_changed: false,
      category_changed: false,
      price_changed: false,
    })
  })
})

describe('import_products', () => {
  it('crea, actualiza solo lo que cambia y crea cada categoría una vez', async () => {
    const result = await importRows(mixed)
    expect(result).toMatchObject({
      created: 2,
      updated: 1,
      unchanged: 1,
      skipped: 0,
      categories_created: ['Monitores'],
    })
    expect(result.previous).toEqual([
      {
        code: 'LAP-1',
        name: 'Laptop uno',
        description: 'Vieja',
        category: 'Laptops',
        price: '1000',
      },
    ])
    expect(result.changes).toEqual([
      expect.objectContaining({
        code: 'LAP-1',
        action: 'updated',
        field: 'description',
        before: 'Vieja',
        after: 'Nueva',
      }),
      expect.objectContaining({
        code: 'LAP-1',
        action: 'updated',
        field: 'price',
        before: '1000',
        after: '1100.00',
      }),
      expect.objectContaining({ code: 'MON-1', action: 'created', field: null }),
      expect.objectContaining({ code: 'MON-2', action: 'created', field: null }),
    ])
    const rows = await catalog()
    expect(rows.find((row) => row.code === 'LAP-2')).toMatchObject({ touched: false })
    expect(rows.find((row) => row.code === 'LAP-1')).toMatchObject({
      touched: true,
      description: 'Nueva',
    })
    expect(rows.filter((row) => row.category === 'Monitores')).toHaveLength(2)
  })

  it('el mismo archivo dos veces no cambia nada la segunda', async () => {
    await importRows(mixed)
    const again = await importRows(mixed)
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 4, categories_created: [] })
  })

  it('con solo Código y Precio actualiza precios y respeta lo demás', async () => {
    const result = await importRows([{ line: 2, code: 'LAP-3', price: '3500.00' }], ['price'])
    expect(result).toMatchObject({ updated: 1 })
    expect((await catalog()).find((row) => row.code === 'LAP-3')).toMatchObject({
      name: 'Laptop tres',
      category: 'Laptops',
      price: '3500.00',
    })
  })

  it('una descripción vacía en la columna presente la borra', async () => {
    await importRows([{ line: 2, code: 'LAP-1', description: null }], ['description'])
    expect((await catalog()).find((row) => row.code === 'LAP-1')?.description).toBeNull()
  })

  it.each([
    ['create', { created: 1, updated: 0, skipped: 1 }],
    ['update', { created: 0, updated: 1, skipped: 1 }],
  ])('el modo %s deja fuera las otras filas', async (mode, expected) => {
    // Con todas las columnas presentes, cada fila trae todos sus valores (el servidor lo garantiza).
    const rows: Row[] = [
      {
        line: 2,
        code: 'LAP-1',
        name: 'Laptop uno',
        description: 'Vieja',
        category: 'Laptops',
        price: '999.00',
      },
      {
        line: 3,
        code: 'NEW-1',
        name: 'Nuevo',
        description: null,
        category: 'Laptops',
        price: '10.00',
      },
    ]
    expect(await importRows(rows, ALL, mode)).toMatchObject(expected)
  })

  it('si una fila rompe una restricción no se guarda nada', async () => {
    const rows: Row[] = [
      { line: 2, code: 'NEW-1', name: 'Bien', category: 'Teclados', price: '10.00' },
      { line: 3, code: 'NEW-2', name: 'Mal', category: 'Teclados', price: '0' },
    ]
    await expect(importRows(rows)).rejects.toMatchObject({ code: '23514' })
    const { rows: left } = await db.query(
      "select (select count(*)::int from public.products) as products, (select count(*)::int from public.categories where name = 'Teclados') as categories",
    )
    expect(left[0]).toEqual({ products: 3, categories: 0 })
  })

  it('no crea las categorías de las filas que el modo deja fuera', async () => {
    const rows: Row[] = [
      { line: 2, code: 'NEW-1', name: 'X', category: 'Monitores', price: '1.00' },
    ]
    expect(await importRows(rows, ALL, 'update')).toMatchObject({
      skipped: 1,
      categories_created: [],
    })
  })

  it('rechaza más de 5 000 filas y a quien no es la dueña', async () => {
    const many = Array.from({ length: 5001 }, (_, index) => ({
      line: index + 2,
      code: `X-${index}`,
    }))
    await expect(importRows(many, ['price'])).rejects.toMatchObject({ code: '22023' })
    await expect(importRows(mixed, ALL, 'all', outsider)).rejects.toMatchObject({ code: '42501' })
    const anonymous = publicClient()
    for (const fn of ['product_import_plan', 'preview_product_import', 'import_products']) {
      const { error } = await anonymous.rpc(fn, { rows: [], columns: [] })
      expect(error?.code).toBe('42501')
    }
  })
})
