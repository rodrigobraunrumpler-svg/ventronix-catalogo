import { describe, expect, it } from 'vitest'
import { buildDocumentModel } from '@/features/proforma/document/model'
import { snapshotSchema } from '@/features/proforma/history/snapshot'

// Así guarda la base cada proforma desde esta versión. No la actualices al cambiar el código: si deja
// de leerse, las proformas guardadas ya no se podrán ver ni reenviar. Un campo nuevo de la entrada
// del documento o de la empresa necesita un valor por defecto (plan, decisión 26).
const STORED_V1 = {
  input: {
    draft: false,
    number: 42,
    issuedAt: '2026-10-02T15:00:00.000Z',
    lines: [
      {
        code: 'LAP-001',
        name: 'Laptop de 14 pulgadas',
        description: null,
        unitPrice: '2590.00',
        quantity: 2,
      },
      { code: '', name: 'Instalación en sitio', description: null, unitPrice: '350', quantity: 1 },
    ],
    client: {
      name: 'Inversiones Nuevo Sol S.A.C.',
      document: '20601234567',
      phone: '987 654 321',
      address: 'Av. Sol 456',
      deliveryTime: '',
    },
    validityDays: '',
    discountPercent: '',
    shipping: '',
  },
  company: {
    legal_name: 'Empresa de Pruebas S.A.C.',
    trade_name: 'Ventronix',
    ruc: '20000000001',
    address: 'Av. Prueba 123, Huamanga',
    phones: ['066 312345'],
    email: null,
    payment_terms: null,
    return_policy: null,
    default_validity_days: 7,
    bank_accounts: [],
    wallets: [],
    whatsapp_message: null,
    updated_at: '2026-10-01T00:00:00+00:00',
  },
}

describe('copia guardada en el historial', () => {
  it('la que se guarda hoy se sigue leyendo y arma el mismo documento', () => {
    const { input, company } = snapshotSchema.parse(STORED_V1)
    const model = buildDocumentModel(input, company, new Date(input.issuedAt ?? 0))
    expect(model).toMatchObject({
      numberLabel: 'N° 0042',
      date: '02/10/2026',
      validUntil: '09/10/2026',
      total: 'S/ 5,530.00',
      author: 'Ventronix',
    })
    expect(model.rows.map((row) => row.code)).toEqual(['LAP-001', '—'])
  })
})
