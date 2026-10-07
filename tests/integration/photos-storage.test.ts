import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getProduct } from '@/features/catalog/products/queries'
import {
  createProductRow,
  deleteProductRow,
  updateProductRow,
} from '@/features/catalog/products/repository'
import { adminClient, ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog, resetProformas, sqlState } from './db'

const BUCKET = 'images'
const password = 'fotos-clave-123'
const owner = { email: 'fotos-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'fotos-intruso@catalogo.test' }
const jpeg = readFileSync('public/brand/ventronix-logo-proforma.jpg')
const uploaded: string[] = []

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
  if (uploaded.length > 0) await adminClient().storage.from(BUCKET).remove(uploaded)
  await resetProformas(db)
  await resetCatalog(db)
  await db.end()
})

async function upload(client: SupabaseClient, path: string) {
  const result = await client.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg' })
  if (!result.error) uploaded.push(path)
  return result
}

describe('bucket de fotos', () => {
  it('la cuenta dueña sube y lee fotos y miniaturas en products/ y lines/', async () => {
    for (const path of [
      `products/${randomUUID()}.jpg`,
      `lines/${randomUUID()}.jpg`,
      `products/${randomUUID()}.thumb.jpg`,
    ]) {
      expect((await upload(supabase, path)).error).toBeNull()
      const { data, error } = await supabase.storage.from(BUCKET).download(path)
      expect(error).toBeNull()
      expect(Buffer.from(await data!.arrayBuffer()).equals(jpeg)).toBe(true)
    }
  })

  it('rechaza otras carpetas y nombres que no son <uuid>.jpg ni <uuid>.thumb.jpg', async () => {
    const id = randomUUID()
    for (const path of [
      `otros/${id}.jpg`,
      `products/${id}.png`,
      `products/../${id}.jpg`,
      'products/foto.jpg',
      `products/${id}.jpg/x.jpg`,
      `products/${id}.small.jpg`,
      `lines/${id}.thumb.png`,
    ]) {
      expect((await upload(supabase, path)).error, path).not.toBeNull()
    }
  })

  it('otra cuenta y sin sesión no ven, ni suben, ni borran fotos', async () => {
    const path = `products/${randomUUID()}.jpg`
    await upload(supabase, path)
    expect((await upload(outsider, `products/${randomUUID()}.jpg`)).error).not.toBeNull()
    expect((await outsider.storage.from(BUCKET).download(path)).error).not.toBeNull()
    expect((await publicClient().storage.from(BUCKET).download(path)).error).not.toBeNull()
    await outsider.storage.from(BUCKET).remove([path])
    await publicClient().storage.from(BUCKET).remove([path])
    expect((await supabase.storage.from(BUCKET).download(path)).error).toBeNull()
  })

  const exists = async (path: string) =>
    (await supabase.storage.from(BUCKET).download(path)).error === null

  it('una foto que no usa nadie se borra, con su miniatura', async () => {
    const path = `lines/${randomUUID()}.jpg`
    const thumb = path.replace(/\.jpg$/, '.thumb.jpg')
    await upload(supabase, path)
    await upload(supabase, thumb)
    await supabase.storage.from(BUCKET).remove([path, thumb])
    expect(await exists(path)).toBe(false)
    expect(await exists(thumb)).toBe(false)
  })

  it('no se borra la foto de un producto ni la de una proforma guardada', async () => {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    const product = `products/${randomUUID()}.jpg`
    const saved = `lines/${randomUUID()}.jpg`
    const thumbs = [product, saved].map((path) => path.replace(/\.jpg$/, '.thumb.jpg'))
    for (const path of [product, saved, ...thumbs]) await upload(supabase, path)
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, image_path)
       values ('LAP-009', 'Laptop', $1, 100, $2)`,
      [rows[0].id, product],
    )
    await db.query(
      `insert into public.proformas
         (number, issued_at, valid_until, client_name, item_count, total, document)
       values (9001, now(), current_date, 'Cliente', 1, 10, $1)`,
      [{ input: { lines: [{ code: '', name: 'Instalación', imagePath: saved }] } }],
    )
    await supabase.storage.from(BUCKET).remove([product, saved, ...thumbs])
    for (const path of [product, saved, ...thumbs]) expect(await exists(path), path).toBe(true)
  })

  it('una foto no se reemplaza', async () => {
    const path = `lines/${randomUUID()}.jpg`
    await upload(supabase, path)
    const again = await supabase.storage
      .from(BUCKET)
      .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true })
    expect(again.error).not.toBeNull()
  })
})

describe('foto del producto', () => {
  it('al eliminar el producto se borra su foto, salvo que la use una proforma guardada', async () => {
    await resetCatalog(db)
    await resetProformas(db)
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    const exists = async (path: string) =>
      (await supabase.storage.from(BUCKET).download(path)).error === null
    const thumb = (path: string) => path.replace(/\.jpg$/, '.thumb.jpg')
    const create = async (code: string, path: string) => {
      await upload(supabase, path)
      await upload(supabase, thumb(path))
      const created = await createProductRow(supabase, {
        code,
        name: `Laptop ${code}`,
        description: null,
        category_id: rows[0].id,
        unit_price: '100.00',
        image_path: path,
      })
      if (!created.ok) throw new Error(created.error.message)
      return created.data.id
    }

    const unused = `products/${randomUUID()}.jpg`
    expect(await deleteProductRow(supabase, await create('LAP-010', unused))).toEqual({
      ok: true,
      data: null,
    })
    expect(await exists(unused)).toBe(false)
    expect(await exists(thumb(unused))).toBe(false)

    const saved = `products/${randomUUID()}.jpg`
    const id = await create('LAP-011', saved)
    await db.query(
      `insert into public.proformas
         (number, issued_at, valid_until, client_name, item_count, total, document)
       values (9002, now(), current_date, 'Cliente', 1, 10, $1)`,
      [{ input: { lines: [{ code: 'LAP-011', name: 'Laptop', imagePath: saved }] } }],
    )
    expect(await deleteProductRow(supabase, id)).toMatchObject({ ok: true })
    expect(await exists(saved)).toBe(true)
  })

  it('se guarda, se lee y se quita con el producto', async () => {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    const path = `products/${randomUUID()}.jpg`
    const input = {
      code: 'LAP-002',
      name: 'Laptop con foto',
      description: null,
      category_id: rows[0].id,
      unit_price: '100.00',
      image_path: path,
    }
    const created = await createProductRow(supabase, input)
    if (!created.ok) throw new Error(created.error.message)
    expect(await getProduct(supabase, created.data.id)).toMatchObject({ image_path: path })
    await updateProductRow(supabase, created.data.id, { ...input, image_path: null })
    expect(await getProduct(supabase, created.data.id)).toMatchObject({ image_path: null })
  })

  it('la base solo acepta rutas de products/ y la lista la devuelve', async () => {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    const path = `products/${randomUUID()}.jpg`
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, image_path)
       values ('LAP-001', 'Laptop', $1, 100, $2)`,
      [rows[0].id, path],
    )
    expect(
      await sqlState(
        db.query(`update public.products set image_path = 'lines/${randomUUID()}.jpg'`),
      ),
    ).toBe('23514')
    const { data, error } = await supabase.rpc('search_products', {})
    expect(error).toBeNull()
    expect((data as unknown as { items: { image_path: string }[] }).items[0].image_path).toBe(path)
  })
})
