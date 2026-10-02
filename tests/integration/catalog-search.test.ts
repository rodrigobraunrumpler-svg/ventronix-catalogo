import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  exportProductRows,
  getCatalogStats,
  listProducts,
} from '@/features/catalog/products/queries'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const password = 'busqueda-clave-123'
const owner = { email: 'busqueda-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'busqueda-intruso@catalogo.test' }

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient
let laptops: string
let printers: string

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

async function insertProduct(code: string, name: string, category: string, price = '100.00') {
  await db.query(
    `insert into public.products (code, name, category_id, unit_price) values ($1, $2, $3, $4)`,
    [code, name, category, price],
  )
}

beforeEach(async () => {
  await resetCatalog(db)
  const { rows } = await db.query<{ id: string; name: string }>(
    "insert into public.categories (name) values ('Laptops'), ('Impresoras') returning id, name",
  )
  laptops = rows.find((row) => row.name === 'Laptops')!.id
  printers = rows.find((row) => row.name === 'Impresoras')!.id
})

const filters = (overrides = {}) => ({ search: '', category: null, page: 1, ...overrides })
const codes = (page: Awaited<ReturnType<typeof listProducts>>) => page.items.map((p) => p.code)

describe('listado del catálogo', () => {
  it('pagina de 50 en 50 en orden estable por nombre e ID, con el total', async () => {
    for (let i = 1; i <= 51; i++) {
      await insertProduct(
        `LAP-${String(i).padStart(3, '0')}`,
        `Laptop ${String(i).padStart(2, '0')}`,
        laptops,
      )
    }
    const first = await listProducts(supabase, filters())
    expect(first).toMatchObject({ total: 51, page: 1, pageSize: 50 })
    expect(first.items).toHaveLength(50)
    expect(first.items[0]).toMatchObject({
      code: 'LAP-001',
      category_name: 'Laptops',
      unit_price: '100.00',
    })
    const second = await listProducts(supabase, filters({ page: 2 }))
    expect(codes(second)).toEqual(['LAP-051'])
  })

  it('devuelve el total aunque la página pedida ya no tenga filas', async () => {
    await insertProduct('LAP-001', 'Laptop', laptops)
    expect(await listProducts(supabase, filters({ page: 5 }))).toMatchObject({
      total: 1,
      items: [],
    })
  })

  it('busca por código o por nombre sin distinguir mayúsculas', async () => {
    await insertProduct('LAP-001', 'Laptop de 14 pulgadas', laptops)
    await insertProduct('IMP-001', 'Impresora láser', printers)
    expect(codes(await listProducts(supabase, filters({ search: 'imp-0' })))).toEqual(['IMP-001'])
    expect(codes(await listProducts(supabase, filters({ search: 'LÁSER' })))).toEqual(['IMP-001'])
  })

  it('busca sin tildes en el nombre, en el código y en lo escrito', async () => {
    await insertProduct('IMP-001', 'Impresión láser', printers)
    await insertProduct('LAP-001', 'Laptop de oficina', laptops)
    expect(codes(await listProducts(supabase, filters({ search: 'impresion' })))).toEqual([
      'IMP-001',
    ])
    expect(codes(await listProducts(supabase, filters({ search: 'LASER' })))).toEqual(['IMP-001'])
    expect(codes(await listProducts(supabase, filters({ search: 'ofícina' })))).toEqual(['LAP-001'])
  })

  it('combina búsqueda y categoría', async () => {
    await insertProduct('LAP-001', 'Equipo A', laptops)
    await insertProduct('IMP-001', 'Equipo B', printers)
    const result = await listProducts(supabase, filters({ search: 'equipo', category: printers }))
    expect(codes(result)).toEqual(['IMP-001'])
  })

  it.each([
    ['%', 'PCT'],
    ['_', 'UND'],
    ['(a,b)', 'PAR'],
    ['"negro"', 'COM'],
    ['\\', 'BAR'],
    ['/2m', 'SLA'],
    ['*', 'AST'],
  ])('trata %j como texto literal', async (term, expected) => {
    await insertProduct('PCT', 'Tóner 50% rendimiento', printers)
    await insertProduct('UND', 'Cable x_y', printers)
    await insertProduct('PAR', 'Kit (a,b) completo', printers)
    await insertProduct('COM', 'Funda "negro"', printers)
    await insertProduct('BAR', 'Ruta C:\\drivers', printers)
    await insertProduct('SLA', 'Cable USB /2m', printers)
    await insertProduct('AST', 'Plan *premium*', printers)
    await insertProduct('OTR', 'Otro producto', printers)
    expect(codes(await listProducts(supabase, filters({ search: term })))).toEqual([expected])
  })

  it('una cuenta sin autorización no ve productos', async () => {
    await insertProduct('LAP-001', 'Laptop', laptops)
    expect(await listProducts(outsider, filters())).toMatchObject({ total: 0, items: [] })
  })
})

describe('fecha y orden desde el código', () => {
  async function dated(code: string, name: string, price: string, created: string) {
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $5)`,
      [code, name, laptops, price, created],
    )
  }

  it('listProducts envía la fecha y el orden a la base', async () => {
    await dated('VIEJO', 'Viejo', '100.00', '2026-09-01T10:00:00-05:00')
    await dated('BARATO', 'Barato', '100.00', '2026-10-01T10:00:00-05:00')
    await dated('CARO', 'Caro', '900.00', '2026-10-01T11:00:00-05:00')
    const result = await listProducts(
      supabase,
      filters({ dateFrom: '2026-10-01', dateTo: '2026-10-01', sort: 'price-desc' }),
    )
    expect(codes(result)).toEqual(['CARO', 'BARATO'])
  })
})

describe('indicadores desde el código', () => {
  it('getCatalogStats traduce las cifras de la base', async () => {
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, created_at, updated_at)
       values ('VIEJO', 'Viejo', $1, 10, '2020-01-01T10:00:00-05:00', '2020-01-01T10:00:00-05:00'),
              ('NUEVO', 'Nuevo', $1, 10, now(), now())`,
      [laptops],
    )
    expect(await getCatalogStats(supabase)).toEqual({
      products: 2,
      createdThisMonth: 1,
      updatedLast7Days: 1,
    })
  })
})

describe('exportación desde el código', () => {
  it('exportProductRows devuelve todas las filas como productos de la lista', async () => {
    await insertProduct('B-1', 'Beta', laptops, '20.00')
    await insertProduct('A-1', 'Alfa', laptops, '10.50')
    const rows = await exportProductRows(supabase, { search: '', category: null }, 10)
    expect(rows.map((row) => row.code)).toEqual(['A-1', 'B-1'])
    expect(rows[0]).toMatchObject({ unit_price: '10.50', category_name: 'Laptops' })
    expect(await exportProductRows(outsider, { search: '', category: null }, 10)).toEqual([])
  })
})
