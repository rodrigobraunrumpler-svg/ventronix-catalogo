import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentInput } from '@/features/proforma/document/input'
import { createProformaDocument } from '@/features/proforma/document/service'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, fillCompanyProfile, resetCompanyProfile } from './db'

const password = 'documento-clave-123'
const owner = { email: 'documento-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  supabase = await signedInClient(owner.email, password)
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCompanyProfile(db)
  await fillCompanyProfile(db)
})

const line = (index: number) => ({
  code: `LAP-${String(index).padStart(3, '0')}`,
  name: `Laptop de 14 pulgadas modelo ${index}`,
  description: 'Diseño ligero · 16 GB RAM · SSD de 512 GB · garantía de un año con el fabricante',
  unitPrice: '2590.00',
  quantity: 1,
})

const input = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  draft: false,
  number: 1,
  issuedAt: '2026-09-30T15:00:00.000Z',
  lines: [line(1)],
  client: {
    name: 'Cliente de ejemplo S.A.C.',
    document: '20000000001',
    phone: '900000000',
    address: '',
    deliveryTime: '',
  },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  ...overrides,
})

// Cuenta las páginas del PDF (los diccionarios de página no van comprimidos).
const pages = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0

async function generate(value: DocumentInput) {
  const result = await createProformaDocument(supabase, value)
  if (!result.ok) throw new Error(result.error.message)
  return { fileName: result.data.fileName, pdf: Buffer.from(result.data.base64, 'base64') }
}

describe('documento PDF de la proforma', () => {
  it('genera un PDF de una página con su nombre de archivo', async () => {
    const { fileName, pdf } = await generate(input())
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pages(pdf)).toBe(1)
    expect(fileName).toBe('Proforma-0001-Cliente-de-ejemplo-SAC.pdf')
  })

  it('pasa a varias páginas con muchas líneas', async () => {
    const lines = Array.from({ length: 40 }, (_, index) => line(index + 1))
    const { pdf } = await generate(input({ lines }))
    expect(pages(pdf)).toBeGreaterThanOrEqual(2)
  })

  it('genera el borrador aunque falte el cliente', async () => {
    const draft = input({
      draft: true,
      number: null,
      issuedAt: null,
      client: { name: '', document: '', phone: '', address: '', deliveryTime: '' },
    })
    expect((await generate(draft)).fileName).toBe('Proforma-borrador.pdf')
  })

  it('rechaza el documento final si la empresa está incompleta', async () => {
    await resetCompanyProfile(db)
    expect(await createProformaDocument(supabase, input())).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Completa los datos de tu empresa antes de generar el documento.',
      },
    })
  })

  it('rechaza una proforma con un total no válido', async () => {
    expect(await createProformaDocument(supabase, input({ discountPercent: '100' }))).toMatchObject(
      {
        ok: false,
        error: { code: 'VALIDATION', message: 'Revisa las cantidades, los precios y los totales.' },
      },
    )
  })
})
