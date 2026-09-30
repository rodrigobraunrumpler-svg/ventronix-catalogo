import { describe, expect, it } from 'vitest'
import { EMPTY_DRAFT, type ProformaDraft } from '@/features/proforma/draft'
import {
  clientErrors,
  firstPendingField,
  generateBlocker,
  type CompanyStatus,
} from '@/features/proforma/readiness'
import { completeCompany, line } from '../support/proforma'

const ready: CompanyStatus = { status: 'ready', profile: completeCompany }
const client = (overrides: Partial<ProformaDraft['client']> = {}) => ({
  ...EMPTY_DRAFT.client,
  name: 'Cliente de prueba',
  ...overrides,
})
const draft = (overrides: Partial<ProformaDraft> = {}): ProformaDraft => ({
  ...EMPTY_DRAFT,
  lines: [line()],
  client: client(),
  ...overrides,
})
const reason = (value: ProformaDraft, company: CompanyStatus = ready) =>
  generateBlocker(value, company)?.message ?? null

describe('generateBlocker', () => {
  it('permite generar con productos válidos, cliente y empresa completos', () => {
    expect(reason(draft())).toBeNull()
  })

  it.each([
    ['sin productos', { lines: [] }, 'Añade al menos un producto.'],
    ['cantidad cero', { lines: [line({ quantity: 0 })] }, 'Revisa las cantidades y los precios.'],
    [
      'cantidad sobre el máximo',
      { lines: [line({ quantity: 10000 })] },
      'Revisa las cantidades y los precios.',
    ],
    ['precio vacío', { lines: [line({ unitPrice: '' })] }, 'Revisa las cantidades y los precios.'],
    ['precio cero', { lines: [line({ unitPrice: '0' })] }, 'Revisa las cantidades y los precios.'],
    ['descuento de 101 %', { discountPercent: '101' }, 'Revisa el descuento y el envío.'],
    ['envío negativo', { shipping: '-5' }, 'Revisa el descuento y el envío.'],
    [
      'sin nombre de cliente',
      { client: client({ name: '  ' }) },
      'Completa los datos del cliente.',
    ],
    [
      'RUC no válido',
      { client: client({ document: '20000000002' }) },
      'Completa los datos del cliente.',
    ],
    [
      'celular no válido',
      { client: client({ phone: '812345678' }) },
      'Completa los datos del cliente.',
    ],
    ['validez de 0 días', { validityDays: '0' }, 'Completa los datos del cliente.'],
    [
      'descuento del 100 % sin envío',
      { discountPercent: '100' },
      'El total debe ser mayor que cero.',
    ],
    [
      'total en el tope',
      { lines: [line({ quantity: 2, unitPrice: '9999999999.99' })] },
      'El total no puede llegar a S/ 10,000,000,000.',
    ],
  ])('%s', (_, overrides, expected) => {
    expect(reason(draft(overrides))).toBe(expected)
  })

  it('espera los datos de la empresa y avisa si no cargan', () => {
    expect(reason(draft(), { status: 'loading' })).toBe('Cargando los datos de tu empresa…')
    expect(reason(draft(), { status: 'error' })).toMatch(
      /^No pudimos cargar los datos de tu empresa/,
    )
  })

  it('pide lo obligatorio de la empresa y enlaza a Empresa', () => {
    const profile = { ...completeCompany, ruc: null, address: null }
    expect(generateBlocker(draft(), { status: 'ready', profile })).toEqual({
      message: 'Completa los datos de tu empresa: RUC y dirección.',
      companyLink: true,
    })
  })
})

describe('clientErrors', () => {
  it('acepta DNI, RUC, celular con espacios y campos opcionales vacíos', () => {
    expect(clientErrors(client({ document: '12345678', phone: '987 654 321' }))).toEqual({
      name: null,
      document: null,
      phone: null,
    })
  })
})

describe('firstPendingField', () => {
  it('va a la primera cantidad o precio con error', () => {
    const value = draft({ lines: [line(), line({ productId: 'p2', unitPrice: 'abc' })] })
    expect(firstPendingField(value)).toBe('line-p2-price')
  })

  it('luego al cliente: nombre, documento y celular', () => {
    expect(firstPendingField(draft({ client: client({ name: '' }) }))).toBe('client-name')
    expect(firstPendingField(draft({ client: client({ document: '123' }) }))).toBe(
      'client-document',
    )
    expect(firstPendingField(draft({ client: client({ phone: '1' }) }))).toBe('client-phone')
  })

  it('sin nada pendiente, al botón Generar', () => {
    expect(firstPendingField(draft())).toBe('generate-proforma')
  })
})
