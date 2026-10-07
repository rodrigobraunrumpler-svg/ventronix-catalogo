import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getCompanyProfile } from '@/features/company/queries'
import { saveCompanyProfileRow } from '@/features/company/repository'
import { companyProfileSchema } from '@/features/company/schemas'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCompanyProfile, sqlState } from './db'

const password = 'empresa-clave-123'
const owner = { email: 'empresa-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'empresa-intruso@catalogo.test' }

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
  await db.end()
})

beforeEach(async () => {
  await resetCompanyProfile(db)
})

const input = companyProfileSchema.parse({
  legal_name: 'Empresa de Pruebas S.A.C.',
  trade_name: 'Pruebas',
  ruc: '20000000001',
  address: 'Av. Prueba 123, Huamanga',
  phones: [{ number: '066 312345' }, { number: '987 654 321' }],
  email: 'ventas@pruebas.test',
  payment_terms: 'Contado contra entrega.',
  return_policy: 'Cambios dentro de los 7 días.',
  default_validity_days: '15',
  bank_accounts: [
    { bank: 'BCP', account: '191-1234567-0-12', cci: '002 191 001234567012 54', holder: '' },
    {
      bank: 'Interbank',
      account: '200-3001234567',
      cci: '00320000300123456722',
      holder: 'Otra Titular',
    },
  ],
  wallets: [
    { kind: 'yape', number: '987654321' },
    { kind: 'ambos', number: '912 345 678' },
  ],
})

describe('datos de la empresa', () => {
  it('empiezan vacíos, con 7 días de validez', async () => {
    expect(await getCompanyProfile(supabase)).toMatchObject({
      legal_name: null,
      ruc: null,
      phones: [],
      default_validity_days: 7,
      bank_accounts: [],
      wallets: [],
      whatsapp_message: null,
    })
  })

  it('guarda y lee teléfonos, cuentas y números en el orden dado', async () => {
    expect(await saveCompanyProfileRow(supabase, input)).toMatchObject({ ok: true })
    expect(await getCompanyProfile(supabase)).toMatchObject({
      legal_name: 'Empresa de Pruebas S.A.C.',
      phones: ['066 312345', '987 654 321'],
      default_validity_days: 15,
      bank_accounts: [
        { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254', holder: null },
        { bank: 'Interbank', holder: 'Otra Titular' },
      ],
      wallets: [
        { kind: 'yape', number: '987654321' },
        { kind: 'ambos', number: '912345678' },
      ],
    })
  })

  it('una cuenta sin autorización no los ve ni los cambia', async () => {
    expect((await outsider.from('company_profile').select('legal_name')).data).toEqual([])
    expect(await saveCompanyProfileRow(outsider, input)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await getCompanyProfile(supabase)).toMatchObject({ legal_name: null })
  })

  it('sin sesión no se pueden leer', async () => {
    const { data } = await publicClient().from('company_profile').select('legal_name')
    expect(data ?? []).toEqual([])
  })

  it('no admite una segunda fila', async () => {
    expect((await supabase.from('company_profile').insert({})).error?.code).toBe('42501')
    expect(await sqlState(db.query('insert into public.company_profile (id) values (false)'))).toBe(
      '23514',
    )
  })

  it('la base rechaza un RUC con otro formato', async () => {
    expect(await sqlState(db.query("update public.company_profile set ruc = '123'"))).toBe('23514')
  })

  it('guarda el mensaje de WhatsApp; la base no admite más de 500 caracteres', async () => {
    const message = 'Hola {cliente}, le envío la {numero}.'
    expect(
      await saveCompanyProfileRow(supabase, { ...input, whatsapp_message: message }),
    ).toMatchObject({ ok: true, data: { whatsapp_message: message } })
    expect(await getCompanyProfile(supabase)).toMatchObject({ whatsapp_message: message })
    expect(
      await sqlState(
        db.query("update public.company_profile set whatsapp_message = repeat('x', 501)"),
      ),
    ).toBe('23514')
  })
})
