import { describe, expect, it } from 'vitest'
import { formatMobile, missingCompanyFields, walletLabel } from '@/features/company/format'
import { companyProfileSchema, type CompanyFormValues } from '@/features/company/schemas'
import { completeCompany, emptyCompany } from '../support/company'

const valid: CompanyFormValues = {
  legal_name: ' Empresa de Pruebas S.A.C. ',
  trade_name: '',
  ruc: '20000000001',
  address: 'Av. Prueba 123',
  phones: [{ number: '066 312345' }],
  email: '',
  payment_terms: '',
  return_policy: '',
  default_validity_days: '7',
  bank_accounts: [
    { bank: 'BCP', account: '191-1234567-0-12', cci: '002-191-001234567012-54', holder: '' },
  ],
  wallets: [{ kind: 'plin', number: '987 654 321' }],
}

function issues(values: unknown) {
  const result = companyProfileSchema.safeParse(values)
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
}

describe('companyProfileSchema', () => {
  it('normaliza lo escrito', () => {
    expect(companyProfileSchema.parse(valid)).toEqual({
      legal_name: 'Empresa de Pruebas S.A.C.',
      trade_name: null,
      ruc: '20000000001',
      address: 'Av. Prueba 123',
      phones: [{ number: '066 312345' }],
      email: null,
      payment_terms: null,
      return_policy: null,
      default_validity_days: 7,
      bank_accounts: [
        { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254', holder: null },
      ],
      wallets: [{ kind: 'plin', number: '987654321' }],
      whatsapp_message: null,
    })
  })

  it('el servidor acepta lo que envía el formulario ya validado', () => {
    const once = companyProfileSchema.parse(valid)
    expect(companyProfileSchema.parse(once)).toEqual(once)
  })

  it.each([
    [{ legal_name: '  ' }, 'legal_name: Escribe la razón social.'],
    [{ ruc: '20000000002' }, 'ruc: Escribe un RUC válido: 11 dígitos con su dígito verificador.'],
    [{ address: '' }, 'address: Escribe la dirección.'],
    [{ phones: [] }, 'phones: Añade al menos un teléfono.'],
    [
      { phones: [{ number: 'abc' }] },
      'phones.0.number: Escribe un teléfono válido, como 987 654 321 o (01) 234 5678.',
    ],
    [{ email: 'ventas@' }, 'email: Escribe un correo válido.'],
    [{ default_validity_days: '0' }, 'default_validity_days: La validez va de 1 a 365 días.'],
    [{ default_validity_days: '366' }, 'default_validity_days: La validez va de 1 a 365 días.'],
    [{ default_validity_days: 'abc' }, 'default_validity_days: La validez va de 1 a 365 días.'],
    [
      { bank_accounts: [{ bank: 'BCP', account: '1911234567012', cci: '1234', holder: '' }] },
      'bank_accounts.0.cci: El CCI tiene 20 dígitos.',
    ],
    [
      { bank_accounts: [{ bank: 'BCP', account: '12', cci: '00219100123456701254', holder: '' }] },
      'bank_accounts.0.account: Escribe el número de cuenta: de 6 a 20 dígitos.',
    ],
    [
      { wallets: [{ kind: 'yape', number: '887654321' }] },
      'wallets.0.number: Escribe 9 dígitos que empiecen por 9.',
    ],
  ])('rechaza %j', (overrides, expected) => {
    expect(issues({ ...valid, ...overrides })).toEqual([expected])
  })

  it.each(['9999999999999999999', '9876543210', '12 345', '------', '+51 +51 987', '98 + 76 54'])(
    'rechaza el teléfono %j',
    (number) => {
      expect(issues({ ...valid, phones: [{ number }] })).toEqual([
        'phones.0.number: Escribe un teléfono válido, como 987 654 321 o (01) 234 5678.',
      ])
    },
  )

  // Fijos de provincia (6 dígitos, o 9 con su código: 066), de Lima (01), 0800, celulares y
  // cualquiera de ellos con el +51 delante.
  it.each([
    '987 654 321',
    '(01) 234-5678',
    '066 312345',
    '312345',
    '0800-12345',
    '+51 987 654 321',
    '+51 1 234 5678',
  ])('acepta el teléfono %j', (number) => {
    expect(issues({ ...valid, phones: [{ number }] })).toEqual([])
  })

  it('rechaza un tipo de número que no es Yape, Plin ni ambos', () => {
    expect(issues({ ...valid, wallets: [{ kind: 'tunki', number: '987654321' }] })[0]).toMatch(
      /^wallets\.0\.kind/,
    )
  })

  it('el mensaje de WhatsApp vacío vuelve al original y tiene hasta 500 caracteres', () => {
    expect(companyProfileSchema.parse({ ...valid, whatsapp_message: '  ' }).whatsapp_message).toBe(
      null,
    )
    expect(
      companyProfileSchema.parse({ ...valid, whatsapp_message: ' Hola {cliente} ' })
        .whatsapp_message,
    ).toBe('Hola {cliente}')
    expect(issues({ ...valid, whatsapp_message: 'x'.repeat(501) })).toEqual([
      'whatsapp_message: Usa como máximo 500 caracteres.',
    ])
  })
})

describe('formato de la empresa', () => {
  it('nombra Yape, Plin o ambos como en el documento', () => {
    expect((['yape', 'plin', 'ambos'] as const).map(walletLabel)).toEqual([
      'Yape',
      'Plin',
      'Yape / Plin',
    ])
    expect(formatMobile('987654321')).toBe('987 654 321')
  })

  it('lista lo obligatorio que falta', () => {
    expect(missingCompanyFields(emptyCompany)).toEqual([
      'razón social',
      'RUC',
      'dirección',
      'teléfono',
    ])
    expect(missingCompanyFields(completeCompany)).toEqual([])
  })
})
