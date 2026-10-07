import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { connect, resetCatalog, sqlState } from './db'

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'

type ProductRow = {
  code: string
  name: string
  description: string | null
  unit_price: string
}

let db: Client

beforeAll(async () => {
  db = await connect()
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCatalog(db)
})

async function insertCategory(name = 'Laptops') {
  const { rows } = await db.query<{ id: string }>(
    'insert into public.categories (name) values ($1) returning id',
    [name],
  )
  return rows[0].id
}

function insertProduct(categoryId: string, overrides: Partial<ProductRow> = {}, client = db) {
  const p: ProductRow = {
    code: 'LAP-001',
    name: 'Laptop de 14 pulgadas',
    description: null,
    unit_price: '2590.00',
    ...overrides,
  }
  return client.query<{ id: string; unit_price: string }>(
    `insert into public.products (code, name, description, category_id, unit_price)
     values ($1, $2, $3, $4, $5) returning id, unit_price::text as unit_price`,
    [p.code, p.name, p.description, categoryId, p.unit_price],
  )
}

// En microsegundos, como los guarda Postgres. Un Date de JS se queda en milisegundos y, en una
// máquina rápida como la de la CI, crear y modificar caen en el mismo milisegundo.
async function timestamps(table: 'categories' | 'products', id: string) {
  const { rows } = await db.query<{ created_at: string; updated_at: string }>(
    `select (extract(epoch from created_at) * 1000000)::bigint as created_at,
            (extract(epoch from updated_at) * 1000000)::bigint as updated_at
       from public.${table} where id = $1`,
    [id],
  )
  return { created_at: BigInt(rows[0].created_at), updated_at: BigInt(rows[0].updated_at) }
}

describe('categorías', () => {
  it('genera el UUID y las fechas en la base de datos', async () => {
    const id = await insertCategory()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const { created_at, updated_at } = await timestamps('categories', id)
    expect(created_at).toBeGreaterThan(BigInt(0))
    expect(updated_at).toBeGreaterThan(BigInt(0))
  })

  it.each(['', '   ', 'a'.repeat(121)])('rechaza el nombre %j', async (name) => {
    expect(await sqlState(insertCategory(name))).toBe(CHECK_VIOLATION)
  })

  it('rechaza un nombre repetido ignorando mayúsculas y espacios exteriores', async () => {
    await insertCategory('Laptops')
    expect(await sqlState(insertCategory('  laptops '))).toBe(UNIQUE_VIOLATION)
  })

  it('no permite eliminar una categoría con productos', async () => {
    const categoryId = await insertCategory()
    await insertProduct(categoryId)
    const deletion = db.query('delete from public.categories where id = $1', [categoryId])
    expect(await sqlState(deletion)).toBe(FOREIGN_KEY_VIOLATION)
  })

  it('actualiza updated_at al modificarla y conserva created_at', async () => {
    const id = await insertCategory()
    const before = await timestamps('categories', id)
    await db.query("update public.categories set name = 'Portátiles' where id = $1", [id])
    const after = await timestamps('categories', id)
    expect(after.created_at).toEqual(before.created_at)
    expect(after.updated_at).toBeGreaterThan(before.updated_at)
  })
})

describe('productos', () => {
  let categoryId: string

  beforeEach(async () => {
    categoryId = await insertCategory()
  })

  it.each(['2590.00', '0.01', '9999999999.99'])(
    'guarda el precio %s sin redondearlo',
    async (price) => {
      const { rows } = await insertProduct(categoryId, { unit_price: price })
      expect(rows[0].unit_price).toBe(price)
    },
  )

  it.each(['0', '0.00', '-1', '1.999', '10000000000'])('rechaza el precio %s', async (price) => {
    expect(await sqlState(insertProduct(categoryId, { unit_price: price }))).toBe(CHECK_VIOLATION)
  })

  it.each(['lap-001', ' LAP-001', 'LAP-001 ', '', 'A'.repeat(65)])(
    'rechaza el código %j',
    async (code) => {
      expect(await sqlState(insertProduct(categoryId, { code }))).toBe(CHECK_VIOLATION)
    },
  )

  it.each(['', '   ', 'a'.repeat(121)])('rechaza el nombre %j', async (name) => {
    expect(await sqlState(insertProduct(categoryId, { name }))).toBe(CHECK_VIOLATION)
  })

  it.each(['', '   ', 'a'.repeat(2001)])('rechaza la descripción %j', async (description) => {
    expect(await sqlState(insertProduct(categoryId, { description }))).toBe(CHECK_VIOLATION)
  })

  it('rechaza un código repetido al crear', async () => {
    await insertProduct(categoryId)
    expect(await sqlState(insertProduct(categoryId, { name: 'Otra laptop' }))).toBe(
      UNIQUE_VIOLATION,
    )
  })

  it('rechaza un código repetido al editar', async () => {
    await insertProduct(categoryId, { code: 'LAP-001' })
    const { rows } = await insertProduct(categoryId, { code: 'LAP-002' })
    const update = db.query("update public.products set code = 'LAP-001' where id = $1", [
      rows[0].id,
    ])
    expect(await sqlState(update)).toBe(UNIQUE_VIOLATION)
  })

  it('rechaza una categoría inexistente', async () => {
    const missing = '6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a'
    expect(await sqlState(insertProduct(missing))).toBe(FOREIGN_KEY_VIOLATION)
  })

  it('solo una de dos inserciones simultáneas del mismo código tiene éxito', async () => {
    const other = await connect()
    try {
      await db.query('begin')
      await insertProduct(categoryId, { code: 'LAP-009' })
      const concurrent = sqlState(insertProduct(categoryId, { code: 'LAP-009' }, other))
      await db.query('commit')
      expect(await concurrent).toBe(UNIQUE_VIOLATION)
      const { rows } = await db.query<{ n: number }>(
        "select count(*)::int as n from public.products where code = 'LAP-009'",
      )
      expect(rows[0].n).toBe(1)
    } finally {
      await other.end()
    }
  })

  it('actualiza updated_at al modificarlo y conserva created_at', async () => {
    const { rows } = await insertProduct(categoryId)
    const before = await timestamps('products', rows[0].id)
    await db.query("update public.products set name = 'Laptop ligera' where id = $1", [rows[0].id])
    const after = await timestamps('products', rows[0].id)
    expect(after.created_at).toEqual(before.created_at)
    expect(after.updated_at).toBeGreaterThan(before.updated_at)
  })
})
