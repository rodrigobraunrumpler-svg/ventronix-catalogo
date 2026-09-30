// Dinero de la proforma en céntimos enteros (bigint): nunca pasa por coma flotante (spec §5.1).
export const ZERO = BigInt(0)
export const HUNDRED = BigInt(100)

// Como el precio del catálogo: punto o coma decimal, hasta dos decimales, sin separador de miles.
const AMOUNT_TEXT = /^\d{1,10}(?:[.,]\d{1,2})?$/
const PERCENT_TEXT = /^\d{1,3}(?:[.,]\d{1,2})?$/

function splitDecimal(text: string) {
  const [whole, fraction = ''] = text.replace(',', '.').split('.')
  return { whole, fraction: fraction.padEnd(2, '0') }
}

export function parseCents(text: string): bigint | null {
  const value = text.trim()
  if (!AMOUNT_TEXT.test(value)) return null
  const { whole, fraction } = splitDecimal(value)
  return BigInt(whole) * HUNDRED + BigInt(fraction)
}

// De 0 a 100 %, en centésimas de punto: 12,5 % → 1250.
export function parsePercent(text: string): number | null {
  const value = text.trim()
  if (!PERCENT_TEXT.test(value)) return null
  const { whole, fraction } = splitDecimal(value)
  const basisPoints = Number(whole) * 100 + Number(fraction)
  return basisPoints <= 10000 ? basisPoints : null
}

// Redondeo al entero más cercano, con las mitades hacia arriba (valores no negativos).
export function divideRoundingHalfUp(numerator: bigint, denominator: bigint) {
  return (numerator * BigInt(2) + denominator) / (denominator * BigInt(2))
}

export function formatCents(cents: bigint) {
  const whole = (cents / HUNDRED).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${whole}.${(cents % HUNDRED).toString().padStart(2, '0')}`
}
