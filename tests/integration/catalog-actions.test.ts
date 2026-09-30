import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { listCategories, listCategoryOptions } from '@/features/catalog/categories/queries'
import {
  createCategoryRow,
  deleteCategoryRow,
  updateCategoryRow,
} from '@/features/catalog/categories/repository'
import { getProduct } from '@/features/catalog/products/queries'
import {
  createProductRow,
  deleteProductRow,
  updateProductRow,
} from '@/features/catalog/products/repository'
import type { ProductInput } from '@/features/catalog/types'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const owner = { email: 'acciones-owner@catalogo.test', password: 'acciones-owner-clave-123' }
const missingId = '6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a'

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ ...owner, appMetadata: { catalog_access: 'owner' } })
  supabase = await signedInClient(owner.email, owner.password)
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCatalog(db)
})

async function categoryId(name: string) {
  const result = await createCategoryRow(supabase, { name })
  if (!result.ok) throw new Error(result.error.message)
  return result.data.id
}

async function addProduct(category: string) {
  await db.query(
    `insert into public.products (code, name, category_id, unit_price)
     values ('LAP-001', 'Laptop de 14 pulgadas', $1, 2590.00)`,
    [category],
  )
}

describe('categorías con la sesión de la cuenta autorizada', () => {
  it('crea una categoría', async () => {
    const result = await createCategoryRow(supabase, { name: 'Impresoras' })
    expect(result).toMatchObject({ ok: true, data: { name: 'Impresoras' } })
  })

  it('rechaza un nombre repetido ignorando mayúsculas con CONFLICT en el campo', async () => {
    await categoryId('Laptops')
    const result = await createCategoryRow(supabase, { name: 'laptops' })
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        fieldErrors: { name: ['Ya existe una categoría con ese nombre.'] },
      },
    })
  })

  it('renombra una categoría', async () => {
    const id = await categoryId('Laptops')
    const result = await updateCategoryRow(supabase, id, { name: 'Portátiles' })
    expect(result).toMatchObject({ ok: true, data: { id, name: 'Portátiles' } })
  })

  it('no informa éxito al renombrar una categoría que ya no existe', async () => {
    const result = await updateCategoryRow(supabase, missingId, { name: 'Portátiles' })
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('rechaza renombrar con el nombre de otra categoría', async () => {
    await categoryId('Laptops')
    const id = await categoryId('Impresoras')
    const result = await updateCategoryRow(supabase, id, { name: 'LAPTOPS' })
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('elimina una categoría vacía', async () => {
    const id = await categoryId('Plotters')
    expect(await deleteCategoryRow(supabase, id)).toEqual({ ok: true, data: null })
    const { rows } = await db.query('select id from public.categories where id = $1', [id])
    expect(rows).toEqual([])
  })

  it('no elimina una categoría con productos y conserva todo', async () => {
    const id = await categoryId('Laptops')
    await addProduct(id)
    const result = await deleteCategoryRow(supabase, id)
    expect(result).toMatchObject({ ok: false, error: { code: 'CATEGORY_IN_USE' } })
    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.products where category_id = $1',
      [id],
    )
    expect(rows[0].n).toBe(1)
  })

  it('no informa éxito al eliminar una categoría que ya no existe', async () => {
    const result = await deleteCategoryRow(supabase, missingId)
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('lista las categorías por nombre con su número de productos', async () => {
    const laptops = await categoryId('Laptops')
    await categoryId('Impresoras')
    await addProduct(laptops)
    const categories = await listCategories(supabase)
    expect(categories.map(({ name, product_count }) => ({ name, product_count }))).toEqual([
      { name: 'Impresoras', product_count: 0 },
      { name: 'Laptops', product_count: 1 },
    ])
    expect(await listCategoryOptions(supabase)).toEqual([
      { id: expect.any(String), name: 'Impresoras' },
      { id: laptops, name: 'Laptops' },
    ])
  })
})

describe('productos con la sesión de la cuenta autorizada', () => {
  let laptops: string

  const input = (overrides: Partial<ProductInput> = {}): ProductInput => ({
    code: 'LAP-001',
    name: 'Laptop de 14 pulgadas',
    description: null,
    category_id: laptops,
    unit_price: '2590.00',
    ...overrides,
  })

  beforeEach(async () => {
    laptops = await categoryId('Laptops')
  })

  it('crea un producto y devuelve el precio exacto como texto', async () => {
    const result = await createProductRow(supabase, input({ unit_price: '9999999999.99' }))
    expect(result).toMatchObject({
      ok: true,
      data: { code: 'LAP-001', unit_price: '9999999999.99' },
    })
  })

  it('rechaza un código repetido sin tocar el producto existente', async () => {
    await createProductRow(supabase, input())
    const result = await createProductRow(supabase, input({ name: 'Otro nombre' }))
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        fieldErrors: { code: ['Ese código ya está en uso. Elige otro.'] },
      },
    })
    const { rows } = await db.query('select name from public.products')
    expect(rows).toEqual([{ name: 'Laptop de 14 pulgadas' }])
  })

  it('avisa en el campo si la categoría se eliminó antes de guardar', async () => {
    const result = await createProductRow(supabase, input({ category_id: missingId }))
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { category_id: [expect.any(String)] } },
    })
  })

  it('edita un producto', async () => {
    const created = await createProductRow(supabase, input())
    if (!created.ok) throw new Error(created.error.message)
    const result = await updateProductRow(
      supabase,
      created.data.id,
      input({ name: 'Laptop ligera', unit_price: '2490.50' }),
    )
    expect(result).toMatchObject({
      ok: true,
      data: { name: 'Laptop ligera', unit_price: '2490.50' },
    })
  })

  it('no informa éxito al editar un producto que ya no existe', async () => {
    const result = await updateProductRow(supabase, missingId, input())
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('no sobrescribe otro producto al editar con un código repetido', async () => {
    await createProductRow(supabase, input())
    const other = await createProductRow(supabase, input({ code: 'LAP-002', name: 'Otra laptop' }))
    if (!other.ok) throw new Error(other.error.message)
    const result = await updateProductRow(supabase, other.data.id, input({ code: 'LAP-001' }))
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    const { rows } = await db.query('select code, name from public.products order by code')
    expect(rows).toEqual([
      { code: 'LAP-001', name: 'Laptop de 14 pulgadas' },
      { code: 'LAP-002', name: 'Otra laptop' },
    ])
  })

  it('elimina un producto y no informa éxito si ya no existe', async () => {
    const created = await createProductRow(supabase, input())
    if (!created.ok) throw new Error(created.error.message)
    expect(await deleteProductRow(supabase, created.data.id)).toEqual({ ok: true, data: null })
    const again = await deleteProductRow(supabase, created.data.id)
    expect(again).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('lee un producto con su categoría y el precio normalizado a dos decimales', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.products (code, name, category_id, unit_price)
       values ('LAP-009', 'Laptop de 16 pulgadas', $1, 4590) returning id`,
      [laptops],
    )
    expect(await getProduct(supabase, rows[0].id)).toMatchObject({
      code: 'LAP-009',
      unit_price: '4590.00',
      category_name: 'Laptops',
    })
    expect(await getProduct(supabase, missingId)).toBeNull()
  })
})
