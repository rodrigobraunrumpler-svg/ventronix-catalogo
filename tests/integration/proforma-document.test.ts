import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentInput } from '@/features/proforma/document/input'
import { createProformaDocument } from '@/features/proforma/document/service'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { pdfText } from '../support/pdf-text'
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
  imagePath: null,
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
  includePhotos: false,
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

  it('lleva el logotipo y la franja de marcas', async () => {
    const { pdf } = await generate(input())
    expect(pdf.toString('latin1').match(/\/Subtype\s*\/Image\b/g)).toHaveLength(2)
  })

  describe('muchos productos en una sola página', () => {
    const demoLine = (index: number) => ({
      code: `DEMO-LAP-${String(index).padStart(3, '0')}`,
      name: `Laptop de 14 pulgadas modelo ${index}`,
      description: 'Core i5 · 16 GB RAM · SSD de 512 GB',
      unitPrice: '2590.00',
      quantity: 1,
      imagePath: null,
    })
    const lines = (count: number) =>
      Array.from({ length: count }, (_, index) => demoLine(index + 1))
    const payments = () =>
      db.query('update public.company_profile set bank_accounts = $1, wallets = $2', [
        JSON.stringify([
          {
            bank: 'BCP',
            account: '191-1234567-0-12',
            cci: '00219100123456701254',
            holder: 'Juan Pérez',
          },
        ]),
        JSON.stringify([{ kind: 'ambos', number: '987654321' }]),
      ])

    it('con 15 productos y todos los datos se compacta y cabe en una página', async () => {
      await payments()
      await db.query('update public.company_profile set payment_terms = $1, return_policy = $2', [
        'Contado contra entrega o transferencia bancaria.',
        'Cambios dentro de los 7 días con comprobante y empaque original.',
      ])
      const client = {
        name: 'Cliente de ejemplo S.A.C.',
        document: '20000000001',
        phone: '900000000',
        address: 'Av. Ejemplo 123, Huamanga',
        deliveryTime: '3 días hábiles',
      }
      const full = input({ lines: lines(15), client, discountPercent: '5', shipping: '20' })
      expect(pages((await generate(full)).pdf)).toBe(1)
    })

    it('con 20 productos, sin descuento ni envío, también cabe en una página', async () => {
      await payments()
      expect(pages((await generate(input({ lines: lines(20) }))).pdf)).toBe(1)
    })
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

  it('se copia tal cual: los guiones de una cuenta no salen como signos menos', async () => {
    const account = { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254' }
    await db.query('update public.company_profile set bank_accounts = $1', [
      JSON.stringify([{ ...account, holder: null }]),
    ])
    const text = pdfText((await generate(input({ discountPercent: '5' }))).pdf)
    expect(text).toContain('BCP · Cta. 191-1234567-0-12')
    expect(text).toContain('− ') // el descuento sí lleva el signo menos
  })

  it('genera el PDF con códigos que la fuente monoespaciada uniría en ligaduras', async () => {
    const lines = ['HP--M404', 'A->B', 'CAB_USB..C'].map((code, index) => ({
      ...line(index + 1),
      code,
    }))
    const text = pdfText((await generate(input({ lines }))).pdf)
    expect(text).toContain('HP--M404')
    expect(text).toContain('A->B')
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
