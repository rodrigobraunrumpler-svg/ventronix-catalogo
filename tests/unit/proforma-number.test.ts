import { expect, it } from 'vitest'
import { formatProformaNumber } from '@/features/proforma/number'

it('usa cuatro cifras y más cuando hace falta', () => {
  expect(formatProformaNumber(1)).toBe('N° 0001')
  expect(formatProformaNumber(12345)).toBe('N° 12345')
})
