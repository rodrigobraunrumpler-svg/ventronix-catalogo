import { describe, expect, it } from 'vitest'
import { formatCents, parseCents, ZERO } from '@/features/proforma/money'
import { applyTax } from '@/features/proforma/tax'
import { calculateTotals, totalsFromText } from '@/features/proforma/totals'

const soles = (text: string) => parseCents(text) ?? ZERO
const line = (quantity: number, price: string) => ({ quantity, unitPrice: soles(price) })

// Ejemplos acordados en la spec (§5.3), recalculados con aritmética decimal exacta.
describe('calculateTotals con IGV incluido', () => {
  it.each([
    [
      'E1',
      [line(2, '2590'), line(1, '850'), line(1, '2490')],
      500,
      '20',
      ['8,520.00', '426.00', '8,094.00', '20.00', '8,114.00', '6,876.27', '1,237.73'],
    ],
    [
      'E2',
      [line(1, '890')],
      0,
      '0',
      ['890.00', '0.00', '890.00', '0.00', '890.00', '754.24', '135.76'],
    ],
    [
      'E3',
      [line(3, '333.33')],
      1000,
      '0',
      ['999.99', '100.00', '899.99', '0.00', '899.99', '762.70', '137.29'],
    ],
    [
      'E4',
      [line(1, '500')],
      10000,
      '25',
      ['500.00', '500.00', '0.00', '25.00', '25.00', '21.19', '3.81'],
    ],
    [
      'E5',
      [line(9999, '12490')],
      0,
      '0',
      [
        '124,887,510.00',
        '0.00',
        '124,887,510.00',
        '0.00',
        '124,887,510.00',
        '105,836,872.88',
        '19,050,637.12',
      ],
    ],
  ])('%s', (_, lines, discountBasisPoints, shipping, expected) => {
    const totals = calculateTotals({ lines, discountBasisPoints, shipping: soles(shipping) })
    const { subtotal, discount, net, total, base, tax } = totals
    expect([subtotal, discount, net, totals.shipping, total, base, tax].map(formatCents)).toEqual(
      expected,
    )
    expect(totals.withinLimit).toBe(true)
  })
})

describe('tope de S/ 10 000 000 000', () => {
  const totalsOf = (lines: ReturnType<typeof line>[], shipping = '0') =>
    calculateTotals({ lines, discountBasisPoints: 0, shipping: soles(shipping) })

  it('admite el precio máximo del catálogo', () => {
    expect(totalsOf([line(1, '9999999999.99')]).withinLimit).toBe(true)
  })
  it('rechaza un total de línea que llega al tope', () => {
    expect(totalsOf([line(2, '9999999999.99')]).withinLimit).toBe(false)
  })
  it('rechaza un total que llega al tope por el envío', () => {
    expect(totalsOf([line(1, '9999999999.99')], '0.01').withinLimit).toBe(false)
  })
})

describe('applyTax', () => {
  const amount = soles('890')
  it('incluido: la base se redondea y el IGV es la diferencia', () => {
    expect(applyTax(amount)).toEqual({
      base: soles('754.24'),
      tax: soles('135.76'),
      total: amount,
      showBreakdown: true,
      pricesIncludeTax: true,
    })
  })
  it('incluido sin desglose: mismos importes, sin mostrar el detalle', () => {
    expect(applyTax(amount, { mode: 'included-hidden', ratePercent: 18 })).toMatchObject({
      base: soles('754.24'),
      showBreakdown: false,
      pricesIncludeTax: true,
    })
  })
  it('sumado al final: el IGV se añade al total', () => {
    expect(applyTax(soles('1000'), { mode: 'added', ratePercent: 18 })).toMatchObject({
      base: soles('1000'),
      tax: soles('180'),
      total: soles('1180'),
      pricesIncludeTax: false,
    })
  })
  it('sin IGV', () => {
    expect(applyTax(amount, { mode: 'none', ratePercent: 18 })).toMatchObject({
      tax: ZERO,
      total: amount,
      showBreakdown: false,
    })
  })
})

describe('totalsFromText', () => {
  const written = (overrides = {}) => ({
    lines: [{ quantity: 2, unitPrice: '2590' }],
    discountPercent: '',
    shipping: '',
    ...overrides,
  })

  it('descuento y envío vacíos cuentan como cero', () => {
    expect(formatCents(totalsFromText(written())!.total)).toBe('5,180.00')
  })
  it('lee descuento y envío escritos con coma', () => {
    const totals = totalsFromText(written({ discountPercent: '5', shipping: '20,50' }))!
    expect(formatCents(totals.total)).toBe('4,941.50')
  })
  it.each([
    ['precio no válido', { lines: [{ quantity: 1, unitPrice: 'abc' }] }],
    ['precio cero', { lines: [{ quantity: 1, unitPrice: '0' }] }],
    ['cantidad cero', { lines: [{ quantity: 0, unitPrice: '10' }] }],
    ['cantidad sobre el máximo', { lines: [{ quantity: 10000, unitPrice: '10' }] }],
    ['descuento mayor que 100 %', { discountPercent: '101' }],
    ['envío negativo', { shipping: '-1' }],
  ])('devuelve null con %s', (_, overrides) =>
    expect(totalsFromText(written(overrides))).toBeNull(),
  )
})
