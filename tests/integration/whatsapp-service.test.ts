import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentInput } from '@/features/proforma/document/input'
import { sendProformaDocument } from '@/features/proforma/document/send'
import {
  linkWhatsAppNumber,
  unlinkWhatsAppNumber,
  whatsAppStatus,
} from '@/features/whatsapp/service'
import { stubWhatsAppProvider } from '@/features/whatsapp/stub-provider'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, fillCompanyProfile, resetCompanyProfile, resetWhatsAppSession } from './db'

const password = 'whatsapp-servicio-123'
const owner = { email: 'whatsapp-servicio@catalogo.test', appMetadata: { catalog_access: 'owner' } }

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  supabase = await signedInClient(owner.email, password)
})

afterAll(async () => {
  await resetWhatsAppSession(db)
  await db.end()
})

beforeEach(async () => {
  await resetWhatsAppSession(db)
  await resetCompanyProfile(db)
  await fillCompanyProfile(db)
})

const proforma = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  draft: false,
  number: 1,
  issuedAt: '2026-09-30T15:00:00.000Z',
  lines: [
    {
      code: 'LAP-001',
      name: 'Laptop de 14 pulgadas',
      description: null,
      unitPrice: '2590.00',
      quantity: 1,
    },
  ],
  client: {
    name: 'Cliente de ejemplo S.A.C.',
    document: '20000000001',
    phone: '900 000 000',
    address: '',
    deliveryTime: '',
  },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  ...overrides,
})

describe('WhatsApp de la empresa', () => {
  it('sin clave en el servidor no está configurado', async () => {
    expect(await whatsAppStatus(supabase, null)).toEqual({
      ok: true,
      data: { configured: false, phone: null, linkedAt: null },
    })
    expect(
      await linkWhatsAppNumber(supabase, null, { phone: '987654321', code: 'ABCD1234' }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
  })

  it('vincula el número, lo muestra y lo desvincula', async () => {
    const provider = stubWhatsAppProvider(supabase)
    const linked = await linkWhatsAppNumber(supabase, provider, {
      phone: '987 654 321',
      code: 'ABCD1234',
    })
    expect(linked).toMatchObject({ ok: true, data: { configured: true, phone: '987654321' } })
    expect(await unlinkWhatsAppNumber(supabase, provider)).toMatchObject({
      ok: true,
      data: { configured: true, phone: null },
    })
  })

  it('valida el celular y el código', async () => {
    const provider = stubWhatsAppProvider(supabase)
    const result = await linkWhatsAppNumber(supabase, provider, { phone: '12345', code: 'abc' })
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: {
          phone: ['Escribe un celular de 9 dígitos que empiece con 9.'],
          code: ['El código no es válido.'],
        },
      },
    })
  })
})

describe('proforma por WhatsApp', () => {
  it('envía la proforma generada y responde con el celular del cliente', async () => {
    const provider = stubWhatsAppProvider(supabase)
    await linkWhatsAppNumber(supabase, provider, { phone: '987654321', code: 'ABCD1234' })
    expect(await sendProformaDocument(supabase, proforma(), provider)).toEqual({
      ok: true,
      data: { phone: '900 000 000' },
    })
  })

  it('sin vincular, sin WhatsApp en el cliente o con la proforma incompleta, lo dice', async () => {
    const provider = stubWhatsAppProvider(supabase)
    expect(await sendProformaDocument(supabase, proforma(), provider)).toMatchObject({
      ok: false,
      error: { message: 'Vincula el WhatsApp de la empresa en Empresa para enviarla.' },
    })
    await linkWhatsAppNumber(supabase, provider, { phone: '987654321', code: 'ABCD1234' })
    const noWhatsApp = proforma({ client: { ...proforma().client, phone: '911111111' } })
    expect(await sendProformaDocument(supabase, noWhatsApp, provider)).toMatchObject({
      ok: false,
      error: { message: 'El 911 111 111 no tiene WhatsApp.' },
    })
    const noPhone = proforma({ client: { ...proforma().client, phone: '' } })
    expect(await sendProformaDocument(supabase, noPhone, provider)).toMatchObject({
      ok: false,
      error: { message: 'Añade el celular del cliente para enviarla por WhatsApp.' },
    })
    await resetCompanyProfile(db)
    expect(await sendProformaDocument(supabase, proforma(), provider)).toMatchObject({
      ok: false,
      error: { message: 'Completa los datos de tu empresa antes de generar el documento.' },
    })
  })

  it('no envía borradores ni sin configurar', async () => {
    const provider = stubWhatsAppProvider(supabase)
    await linkWhatsAppNumber(supabase, provider, { phone: '987654321', code: 'ABCD1234' })
    const draft = proforma({ draft: true, number: null, issuedAt: null })
    expect(await sendProformaDocument(supabase, draft, provider)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(await sendProformaDocument(supabase, proforma(), null)).toMatchObject({
      ok: false,
      error: { message: 'El envío automático por WhatsApp no está configurado.' },
    })
  })
})
