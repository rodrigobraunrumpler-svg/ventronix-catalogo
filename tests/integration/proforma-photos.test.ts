import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentInput } from '@/features/proforma/document/input'
import { createProformaDocument } from '@/features/proforma/document/service'
import { storedProformaDocument } from '@/features/proforma/history/service'
import { loadPhotos } from '@/features/proforma/document/photos'
import { thumbPath } from '@/lib/photos'
import { adminClient, ensureUser, signedInClient } from '../support/local-supabase'
import { pdfText } from '../support/pdf-text'
import { connect, fillCompanyProfile, resetCompanyProfile, resetProformas } from './db'

const password = 'fotos-pdf-123'
const owner = { email: 'fotos-pdf@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const jpeg = readFileSync('public/brand/ventronix-logo-proforma.jpg')
// Con su miniatura, como las sube la app.
const photo = `lines/${randomUUID()}.jpg`
// Sin miniatura: el PDF usa la de 600 px.
const withoutThumb = `lines/${randomUUID()}.jpg`
const notJpeg = `lines/${randomUUID()}.jpg`
const missing = `lines/${randomUUID()}.jpg`
const uploaded = [photo, thumbPath(photo), withoutThumb, notJpeg]

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  supabase = await signedInClient(owner.email, password)
  const storage = supabase.storage.from('images')
  const options = { contentType: 'image/jpeg' }
  for (const path of [photo, thumbPath(photo), withoutThumb]) {
    await storage.upload(path, jpeg, options)
  }
  // Un PNG con nombre .jpg: el bucket lo deja subir y el PDF no lo dibuja.
  await storage.upload(notJpeg, readFileSync('public/brand/ventronix-mark.png'), options)
})

afterAll(async () => {
  await adminClient().storage.from('images').remove(uploaded)
  await resetProformas(db)
  await db.end()
})

beforeEach(async () => {
  await resetProformas(db)
  await resetCompanyProfile(db)
  await fillCompanyProfile(db)
})

const line = (index: number, imagePath: string | null) => ({
  code: `LAP-${index}`,
  name: `Laptop ${index}`,
  description: null,
  unitPrice: '100.00',
  quantity: 1,
  imagePath,
})

const input = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  draft: false,
  number: 1,
  issuedAt: '2026-09-30T15:00:00.000Z',
  lines: [line(1, photo), line(2, null)],
  client: {
    name: 'Cliente de ejemplo S.A.C.',
    document: '',
    phone: '',
    address: '',
    deliveryTime: '',
  },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  includePhotos: true,
  ...overrides,
})

// El logotipo y la franja de marcas son las dos imágenes de siempre.
const images = (pdf: Buffer) => pdf.toString('latin1').match(/\/Subtype\s*\/Image\b/g)?.length ?? 0

async function generate(value: DocumentInput) {
  const result = await createProformaDocument(supabase, value)
  if (!result.ok) throw new Error(result.error.message)
  return Buffer.from(result.data.base64, 'base64')
}

describe('fotos en el PDF', () => {
  it('con el interruptor, la columna lleva la foto y la nota', async () => {
    const pdf = await generate(input())
    expect(images(pdf)).toBe(3)
    expect(pdfText(pdf)).toContain('Imágenes referenciales.')
  })

  it('sin el interruptor, el PDF queda como siempre', async () => {
    const pdf = await generate(input({ includePhotos: false }))
    expect(images(pdf)).toBe(2)
    expect(pdfText(pdf)).not.toContain('Imágenes referenciales.')
  })

  it('sin miniatura usa la foto de 600 px', async () => {
    const pdf = await generate(input({ lines: [line(1, withoutThumb)] }))
    expect(images(pdf)).toBe(3)
  })

  it('las fotos que pasan del tope de bytes se dejan fuera', async () => {
    expect((await loadPhotos(supabase, [photo, null], 1)).size).toBe(0)
    expect((await loadPhotos(supabase, [photo, photo])).size).toBe(1)
  })

  it('una foto que falta o que no es JPEG se deja fuera y el PDF se genera igual', async () => {
    const pdf = await generate(input({ lines: [line(1, missing), line(2, notJpeg)] }))
    expect(images(pdf)).toBe(2)
    expect(pdfText(pdf)).toContain('Imágenes referenciales.')
  })

  it('muchas filas con fotos y productos libres sin código pasan al diseño compacto', async () => {
    const lines = Array.from({ length: 31 }, (_, index) =>
      index % 2 === 0
        ? line(index, photo)
        : {
            ...line(index, null),
            code: '',
            name: `Servicio de instalación y configuración en sitio número ${index}`,
          },
    )
    const text = pdfText(await generate(input({ lines })))
    expect(text).toContain('—')
    expect(text).toContain('Imágenes referenciales.')
  })

  it('el historial vuelve a armar el PDF con su foto', async () => {
    await generate(input())
    const { rows } = await db.query<{ id: string }>('select id from public.proformas')
    const result = await storedProformaDocument(supabase, rows[0].id)
    if (!result.ok) throw new Error(result.error.message)
    expect(images(Buffer.from(result.data.base64, 'base64'))).toBe(3)
  })
})
