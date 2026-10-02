import { describe, expect, it } from 'vitest'
import {
  centsToDecimal,
  divideRoundingHalfUp,
  formatCents,
  parseCents,
  parsePercent,
} from '@/features/proforma/money'

describe('parseCents', () => {
  it.each([
    ['2590', BigInt(259000)],
    ['2590.5', BigInt(259050)],
    ['2590,55', BigInt(259055)],
    [' 0.01 ', BigInt(1)],
    ['0', BigInt(0)],
    ['9999999999.99', BigInt('999999999999')],
  ])('lee %j', (text, cents) => expect(parseCents(text)).toBe(cents))

  it.each(['', '1.234', '1,234.50', 'S/ 850', '850.', '-5', '12345678901', 'abc', '1e3'])(
    'rechaza %j sin leerlo como otro importe',
    (text) => expect(parseCents(text)).toBeNull(),
  )
})

describe('parsePercent', () => {
  it.each([
    ['5', 500],
    ['12,5', 1250],
    ['99.99', 9999],
    ['0', 0],
    ['100', 10000],
  ])('lee %j', (text, basisPoints) => expect(parsePercent(text)).toBe(basisPoints))

  it.each(['', '100.01', '101', '-1', '5%', '1.234'])('rechaza %j', (text) =>
    expect(parsePercent(text)).toBeNull(),
  )
})

describe('divideRoundingHalfUp', () => {
  it.each([
    [5, 2, 3],
    [7, 2, 4],
    [1, 3, 0],
    [2, 3, 1],
  ])('%i ÷ %i = %i', (n, d, expected) =>
    expect(divideRoundingHalfUp(BigInt(n), BigInt(d))).toBe(BigInt(expected)),
  )
})

describe('formatCents', () => {
  it.each([
    [BigInt(811400), '8,114.00'],
    [BigInt(5), '0.05'],
    [BigInt(12488751000), '124,887,510.00'],
  ])('%s → %s', (cents, text) => expect(formatCents(cents)).toBe(text))
})

describe('centsToDecimal', () => {
  it('escribe céntimos como decimal, sin separador de miles', () => {
    expect(centsToDecimal(BigInt(118000))).toBe('1180.00')
    expect(centsToDecimal(BigInt(123456789))).toBe('1234567.89')
    expect(centsToDecimal(BigInt(5))).toBe('0.05')
    expect(centsToDecimal(BigInt(0))).toBe('0.00')
  })
})
