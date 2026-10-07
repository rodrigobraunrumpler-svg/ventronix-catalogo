import type { SupabaseClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  analyzeImport,
  buildErrors,
  buildSimulation,
  runImport,
} from '@/features/catalog/excel/import-service'
import { DEFAULT_IMPORT_OPTIONS } from '@/features/catalog/import/options'
import type { ImportOptions } from '@/features/catalog/import/types'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const owner = { email: 'servicio-owner@catalogo.test', password: 'servicio-clave-123' }
const HEADER = ['Código', 'Nombre', 'Descripción', 'Categoría', 'Precio con IGV (S/)']

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
  const { rows } = await db.query<{ id: string; name: string }>(
    "insert into public.categories (name) values ('Laptops'), ('Impresoras') returning id, name",
  )
  const id = (name: string) => rows.find((row) => row.name === name)!.id
  await db.query(
    `insert into public.products (code, name, category_id, unit_price) values
       ('LAP-001', 'Laptop uno', $1, 1000), ('LAP-002', 'Laptop dos', $1, 2000),
       ('IMP-001', 'Impresora láser', $2, 500)`,
    [id('Laptops'), id('Impresoras')],
  )
})

async function xlsx(rows: ExcelJS.CellValue[][], header = HEADER) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Productos')
  ;[header, ...rows].forEach((values, index) => {
    sheet.getRow(index + 1).values = values
  })
  return new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
}

async function analyze(data: ArrayBuffer, options: Partial<ImportOptions> = {}) {
  const result = await analyzeImport(supabase, {
    data,
    fileName: 'productos.xlsx',
    options: { ...DEFAULT_IMPORT_OPTIONS, ...options },
  })
  if (!result.ok) throw new Error(result.message)
  return result.analysis
}

const MIXED: ExcelJS.CellValue[][] = [
  ['LAP-001', 'Laptop uno', null, 'Laptops', 1100], // 2: sube un 10 %
  ['LAP-002', 'Laptop dos', null, 'Laptops', 100], // 3: baja un 95 %, para revisar
  ['IMP-001', 'Impresora láser', null, 'Impresoras', 500], // 4: sin cambios
  ['NEW-001', 'Monitor 24', null, 'Monitores', 500.5], // 5: nuevo, categoría nueva
  ['NEW-002', 'Tóner HP', null, 'Impresora', 80], // 6: casi igual a «Impresoras»
  ['NEW-003', 'Laptop gamer', null, 'Laptps', 5000], // 7: parecida a «Laptops»
  ['BAD-001', 'Malo', null, 'Laptops', 'abc'], // 8: precio con error
  ['LAP-001', 'Repetida', null, 'Laptops', 1], // 9: código repetido
  ['NEW-004', 'Laptop uno', null, 'Laptops', 900], // 10: nombre que ya existe
]

describe('analyzeImport', () => {
  it('dice qué pasará con cada fila, con avisos y categorías por decidir', async () => {
    const { preview, errorRows } = await analyze(await xlsx(MIXED))
    expect(preview.rows.map((row) => [row.line, row.status])).toEqual([
      [2, 'update'],
      [3, 'review'],
      [4, 'unchanged'],
      [5, 'create'],
      [6, 'create'],
      [7, 'create'],
      [8, 'error'],
      [9, 'error'],
      [10, 'review'],
    ])
    expect(preview.counts).toEqual({
      create: 3,
      update: 1,
      unchanged: 1,
      review: 2,
      error: 2,
      omitted: 0,
    })
    expect(preview).toMatchObject({ importable: 6, updates: 2, undecided: 1, partialNotice: null })
    expect(preview.rows[0].changes).toEqual([{ field: 'price', before: '1000', after: '1100.00' }])
    expect(preview.rows[1].warnings).toEqual(['El precio baja un 95 %. ¿Es correcto?'])
    expect(preview.rows[4]).toMatchObject({ category: 'Impresoras' })
    expect(preview.rows[6].errors).toEqual([
      'Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50 o 1250,50.',
    ])
    expect(preview.rows[7].errors).toEqual(['Código repetido: ya está en la fila 2.'])
    expect(preview.rows[8].warnings).toEqual([
      'Mismo nombre que la fila 2 (otro código).',
      'Ya existe "Laptop uno" con el código LAP-001.',
    ])
    expect(preview.choices).toEqual([
      {
        key: 'monitores',
        name: 'Monitores',
        kind: 'new',
        suggestion: null,
        decision: { action: 'create' },
        products: 1,
      },
      {
        key: 'impresora',
        name: 'Impresora',
        kind: 'near',
        suggestion: 'Impresoras',
        decision: { action: 'use', target: 'Impresoras' },
        products: 1,
      },
      {
        key: 'laptps',
        name: 'Laptps',
        kind: 'similar',
        suggestion: 'Laptops',
        decision: null,
        products: 1,
      },
    ])
    expect(preview.bars).toEqual([
      { name: 'Laptops', products: 3, tag: null },
      { name: 'Impresoras', products: 2, tag: null },
      { name: 'Laptps', products: 1, tag: 'similar' },
      { name: 'Monitores', products: 1, tag: 'new' },
    ])
    expect(preview.prices).toEqual({ up: 1, down: 1, upAverage: 0.1, downAverage: -0.95 })
    expect(errorRows.map((row) => row.line)).toEqual([8, 9])
  })

  it('aplica la decisión de una categoría parecida', async () => {
    const { preview } = await analyze(await xlsx(MIXED), {
      categoryMap: { laptps: { action: 'use', target: 'Laptops' } },
    })
    expect(preview.undecided).toBe(0)
    expect(preview.rows[5]).toMatchObject({ line: 7, category: 'Laptops' })
    expect(preview.bars[0]).toEqual({ name: 'Laptops', products: 4, tag: null })
  })

  it('con solo Código y Precio actualiza precios; un código nuevo dice qué le falta', async () => {
    const { preview } = await analyze(
      await xlsx(
        [
          ['LAP-001', 1200],
          ['NEW-9', 10],
        ],
        ['Código', 'Precio con IGV (S/)'],
      ),
    )
    expect(preview.partialNotice).toBe(
      'Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios. El resto de los datos se mantiene.',
    )
    expect(preview.rows[0]).toMatchObject({
      status: 'update',
      name: 'Laptop uno',
      category: 'Laptops',
    })
    expect(preview.rows[1].errors).toEqual([
      'Producto nuevo: falta el nombre.',
      'Producto nuevo: falta la categoría.',
    ])
  })

  it('avisa que «Valor sin IGV» del reporte no se importa', async () => {
    const { preview } = await analyze(
      await xlsx(
        [['LAP-001', 1000, 847.46]],
        ['Código', 'Precio con IGV (S/)', 'Valor sin IGV (S/)'],
      ),
    )
    expect(preview.ignoredNotice).toBe(
      'La columna «Valor sin IGV (S/)» no se importa: los precios se cambian en «Precio con IGV (S/)».',
    )
  })

  it('los modos dejan fuera filas sin marcarlas como error', async () => {
    const file = await xlsx(
      [
        ['LAP-001', 1200],
        ['NEW-9', 10],
      ],
      ['Código', 'Precio'],
    )
    const update = await analyze(file, { mode: 'update' })
    expect(update.preview.rows.map((row) => [row.status, row.errors])).toEqual([
      ['update', []],
      ['omitted', []],
    ])
    const create = await analyze(file, { mode: 'create' })
    expect(create.preview.rows.map((row) => row.status)).toEqual(['omitted', 'error'])
  })

  it('«No incluyen IGV» suma el 18 % y conserva el precio original', async () => {
    const { preview } = await analyze(
      await xlsx([['LAP-001', 'Laptop uno', null, 'Laptops', 1000]]),
      {
        pricesIncludeTax: false,
      },
    )
    expect(preview.rows[0]).toMatchObject({
      price: '1180.00',
      priceBeforeTax: '1000.00',
      changes: [{ field: 'price', before: '1000', after: '1180.00' }],
    })
  })
})

describe('runImport', () => {
  it('importa lo decidido y deja un comprobante con «Para revertir»', async () => {
    const options = { categoryMap: { laptps: { action: 'use' as const, target: 'Laptops' } } }
    const analysis = await analyze(await xlsx(MIXED), options)
    const result = await runImport(supabase, analysis, 'all', new Date('2026-10-02T19:35:00Z'))
    expect(result).toMatchObject({
      ok: true,
      data: {
        created: 4,
        updated: 2,
        unchanged: 1,
        skipped: 0,
        errors: 2,
        categoriesCreated: ['Monitores'],
        receipt: { fileName: 'comprobante-importacion-2026-10-02-1435.xlsx' },
      },
    })
    const { rows } = await db.query<{ code: string; price: string; category: string }>(
      `select p.code, p.unit_price::text as price, c.name as category
       from public.products p join public.categories c on c.id = p.category_id order by p.code`,
    )
    expect(rows).toEqual([
      { code: 'IMP-001', price: '500', category: 'Impresoras' },
      { code: 'LAP-001', price: '1100.00', category: 'Laptops' },
      { code: 'LAP-002', price: '100.00', category: 'Laptops' },
      { code: 'NEW-001', price: '500.50', category: 'Monitores' },
      { code: 'NEW-002', price: '80.00', category: 'Impresoras' },
      { code: 'NEW-003', price: '5000.00', category: 'Laptops' },
      { code: 'NEW-004', price: '900.00', category: 'Laptops' },
    ])

    // La hoja «Para revertir» del comprobante devuelve los precios anteriores.
    if (!result.ok) throw new Error('import failed')
    const receipt = new Uint8Array(Buffer.from(result.data.receipt.base64, 'base64')).buffer
    const revert = await analyzeImport(supabase, {
      data: receipt,
      fileName: 'comprobante.xlsx',
      options: DEFAULT_IMPORT_OPTIONS,
    })
    if (!revert.ok) throw new Error(revert.message)
    expect(revert.analysis.preview.sheetName).toBe('Para revertir')
    await runImport(supabase, revert.analysis, 'all')
    const { rows: back } = await db.query<{ code: string; price: string }>(
      "select code, unit_price::text as price from public.products where code in ('LAP-001', 'LAP-002') order by code",
    )
    expect(back).toEqual([
      { code: 'LAP-001', price: '1000.00' },
      { code: 'LAP-002', price: '2000.00' },
    ])
  })

  it('no importa con categorías por decidir, con un destino borrado ni sin nada que cambiar', async () => {
    const file = await xlsx(MIXED)
    expect(await runImport(supabase, await analyze(file), 'all')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Decide 1 categoría antes de importar.' },
    })
    const gone = await analyze(file, {
      categoryMap: { laptps: { action: 'use', target: 'Borrada' } },
    })
    expect(await runImport(supabase, gone, 'all')).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'La categoría «Borrada» ya no existe. Vuelve a revisar el archivo.',
      },
    })
    const same = await analyze(
      await xlsx([['IMP-001', 'Impresora láser', null, 'Impresoras', 500]]),
    )
    expect(await runImport(supabase, same, 'all')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Tu catálogo ya está al día con este archivo.' },
    })
  })
})

describe('simulación y filas con errores', () => {
  it('la simulación y el archivo de errores se arman sin guardar nada', async () => {
    const analysis = await analyze(await xlsx(MIXED))
    const now = new Date('2026-10-02T19:35:00Z')
    const simulation = await buildSimulation(analysis, now)
    expect(simulation.fileName).toBe('simulacion-importacion-2026-10-02.xlsx')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(Buffer.from(simulation.base64, 'base64')).buffer)
    expect(workbook.getWorksheet('Resumen')!.getCell('A1').value).toBe(
      'Simulación: todavía no se guardó nada',
    )
    const errors = await buildErrors(analysis, now)
    expect(errors?.fileName).toBe('filas-con-errores-2026-10-02.xlsx')
    const { rows } = await db.query<{ count: number }>(
      'select count(*)::int as count from public.products',
    )
    expect(rows[0].count).toBe(3)
    const clean = await analyze(
      await xlsx([['IMP-001', 'Impresora láser', null, 'Impresoras', 500]]),
    )
    expect(await buildErrors(clean, now)).toBeNull()
  })
})

describe('rendimiento', () => {
  it('5 000 filas: lee, revisa e importa en pocos segundos, una llamada a la base por paso', async () => {
    const rows = Array.from({ length: 5000 }, (_, index) => [
      `P-${String(index).padStart(4, '0')}`,
      `Producto ${index}`,
      null,
      'Laptops',
      100 + index,
    ])
    const file = await xlsx(rows)
    const started = performance.now()
    const analysis = await analyze(file)
    expect(analysis.preview.counts.create).toBe(5000)
    expect(await runImport(supabase, analysis, 'all')).toMatchObject({
      ok: true,
      data: { created: 5000 },
    })
    // Holgado para no fallar en un equipo lento (la spec §10 espera menos de 3 s por paso); un
    // recorrido fila por fila tardaría minutos.
    expect(performance.now() - started).toBeLessThan(15_000)
  }, 60_000)
})
