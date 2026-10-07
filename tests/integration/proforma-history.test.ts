import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentInput } from '@/features/proforma/document/input'
import { sendProformaDocument } from '@/features/proforma/document/send'
import { createProformaDocument } from '@/features/proforma/document/service'
import { resendStoredProforma, storedProformaDocument } from '@/features/proforma/history/service'
import type { SendDocumentInput, WhatsAppProvider } from '@/features/whatsapp/provider'
import { stubWhatsAppProvider } from '@/features/whatsapp/stub-provider'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { pdfText } from '../support/pdf-text'
import { connect, fillCompanyProfile, resetCompanyProfile, resetProformas } from './db'

const password = 'historial-guardar-123'
const owner = { email: 'historial-guardar@catalogo.test', appMetadata: { catalog_access: 'owner' } }

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  supabase = await signedInClient(owner.email, password)
})

afterAll(async () => {
  await resetProformas(db)
  await db.end()
})

beforeEach(async () => {
  await resetProformas(db)
  await resetCompanyProfile(db)
  await fillCompanyProfile(db)
})

const laptop = {
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  unitPrice: '2590.00',
  quantity: 1,
}

const input = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  draft: false,
  number: 1,
  issuedAt: '2026-09-30T15:00:00.000Z',
  lines: [laptop],
  client: {
    name: 'Cliente de ejemplo S.A.C.',
    document: '20000000001',
    phone: '900 000 000',
    address: 'Av. Sol 456',
    deliveryTime: '',
  },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  ...overrides,
})

async function generate(value: DocumentInput) {
  const result = await createProformaDocument(supabase, value)
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

async function saved() {
  const { rows } = await db.query(
    `select id, number, issued_at, valid_until::text as valid_until, client_name, client_document,
            client_phone, item_count, total::text as total, document
       from public.proformas order by number`,
  )
  return rows
}

describe('historial al generar', () => {
  it('guarda la proforma generada con sus datos y la copia para volver a armarla', async () => {
    await generate(input())
    const [row] = await saved()
    expect(row).toMatchObject({
      number: 1,
      valid_until: '2026-10-07',
      client_name: 'Cliente de ejemplo S.A.C.',
      client_document: '20000000001',
      client_phone: '900 000 000',
      item_count: 1,
      total: '2590.00',
    })
    expect(row.document.input).toMatchObject({
      draft: false,
      number: 1,
      issuedAt: '2026-09-30T15:00:00.000Z',
      lines: [laptop],
    })
    expect(row.document.company).toMatchObject({
      legal_name: 'Empresa de Pruebas S.A.C.',
      default_validity_days: 7,
    })
  })

  it('«Corregir» y volver a generar actualiza la misma proforma y conserva su fecha', async () => {
    await generate(input())
    await generate(input({ lines: [{ ...laptop, quantity: 2 }] }))
    const rows = await saved()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      number: 1,
      issued_at: new Date('2026-09-30T15:00:00.000Z'),
      total: '5180.00',
    })
  })

  it('la vista previa no se guarda', async () => {
    await generate(input({ draft: true, number: null, issuedAt: null }))
    expect(await saved()).toEqual([])
  })

  it('un producto libre sin código se guarda tal cual', async () => {
    const service = {
      code: '',
      name: 'Instalación en sitio',
      description: null,
      unitPrice: '350',
      quantity: 1,
    }
    await generate(input({ lines: [service] }))
    expect((await saved())[0].document.input.lines).toEqual([service])
  })

  it('enviar por WhatsApp también la deja guardada, sin duplicarla', async () => {
    await generate(input())
    const provider: WhatsAppProvider = {
      ...stubWhatsAppProvider(supabase),
      sendDocument: async () => ({ ok: true }),
    }
    expect(await sendProformaDocument(supabase, input(), provider)).toMatchObject({ ok: true })
    expect(await saved()).toHaveLength(1)
  })
})

describe('desde el historial', () => {
  const firstId = async () => (await saved())[0].id as string

  it('vuelve a armar el mismo PDF aunque la empresa haya cambiado', async () => {
    await generate(input())
    await db.query("update public.company_profile set address = 'Otra dirección 999'")
    const result = await storedProformaDocument(supabase, await firstId())
    if (!result.ok) throw new Error(result.error.message)
    const text = pdfText(Buffer.from(result.data.base64, 'base64'))
    expect(text).toContain('Av. Prueba 123')
    expect(text).not.toContain('Otra')
    expect(result.data.fileName).toBe('Proforma-0001-Cliente-de-ejemplo-SAC.pdf')
  })

  it('el mensaje es el de Empresa de hoy, con los datos de la proforma', async () => {
    await generate(input())
    await db.query(
      "update public.company_profile set whatsapp_message = 'Le reenvío la {numero} por {total}, válida hasta el {vence}.'",
    )
    expect(await storedProformaDocument(supabase, await firstId())).toMatchObject({
      ok: true,
      data: { message: 'Le reenvío la N° 0001 por S/ 2,590.00, válida hasta el 07/10/2026.' },
    })
  })

  it('reenvía por WhatsApp el mismo PDF al celular que se indique', async () => {
    await generate(input())
    const sent: SendDocumentInput[] = []
    const provider: WhatsAppProvider = {
      ...stubWhatsAppProvider(supabase),
      sendDocument: async (document) => {
        sent.push(document)
        return { ok: true }
      },
    }
    expect(
      await resendStoredProforma(supabase, { id: await firstId(), phone: '911 222 333' }, provider),
    ).toEqual({ ok: true, data: { phone: '911 222 333' } })
    expect(sent[0]).toMatchObject({
      phone: '911222333',
      fileName: 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf',
    })
    expect(sent[0].document.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('sin celular válido, sin configurar o sin la proforma, lo dice', async () => {
    await generate(input())
    const id = await firstId()
    const provider = stubWhatsAppProvider(supabase)
    expect(await resendStoredProforma(supabase, { id, phone: '123' }, provider)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(await resendStoredProforma(supabase, { id, phone: '987654321' }, null)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(
      await storedProformaDocument(supabase, '00000000-0000-4000-8000-000000000000'),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('una copia que no se puede leer lo dice con claridad', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.proformas
         (number, issued_at, valid_until, client_name, item_count, total, document)
       values (99, now(), current_date, 'Cliente', 1, 10, '{"input": {}}') returning id`,
    )
    expect(await storedProformaDocument(supabase, rows[0].id)).toMatchObject({
      ok: false,
      error: { message: 'No pudimos leer la copia guardada de esta proforma.' },
    })
  })
})
