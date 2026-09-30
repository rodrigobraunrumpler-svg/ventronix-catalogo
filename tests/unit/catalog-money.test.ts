import { describe, expect, it } from 'vitest'
import { formatPrice, unitPriceSchema } from '@/features/catalog/money'

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

it('explica el formato esperado con un ejemplo', () => {
  const result = unitPriceSchema.safeParse('12,345')
  expect(result.error?.issues[0].message).toBe(
    'Escribe solo números con hasta dos decimales, por ejemplo 1250.50.',
  )
})

describe('presentación del precio', () => {
  it.each([
    ['890.00', '890.00'],
    ['12490.00', '12,490.00'],
    ['9999999999.99', '9,999,999,999.99'],
  ])('muestra %s como %s sin pasar por coma flotante', (value, expected) => {
    expect(formatPrice(value)).toBe(expected)
  })
})
