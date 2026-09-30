import { describe, expect, it } from 'vitest'
import { unitPriceSchema } from '@/features/catalog/money'

describe('precio unitario', () => {
  it.each([
    ['125', '125.00'],
    [' 125,5 ', '125.50'],
    ['0001.05', '1.05'],
    ['0.01', '0.01'],
    ['9999999999.99', '9999999999.99'],
  ])('normaliza %s', (input, expected) => {
    expect(unitPriceSchema.parse(input)).toBe(expected)
  })

  it.each(['', '0', '0.00', '-1', '1.999', '1,000.00', '1e3', 'NaN', '10000000000'])(
    'rechaza %s',
    (input) => {
      expect(unitPriceSchema.safeParse(input).success).toBe(false)
    },
  )
})
