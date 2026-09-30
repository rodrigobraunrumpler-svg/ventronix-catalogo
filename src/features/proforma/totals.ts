import { divideRoundingHalfUp, parseCents, parsePercent, ZERO } from './money'
import { applyTax, TAX_CONFIG, type TaxConfig, type TaxResult } from './tax'

export const MAX_QUANTITY = 9999
// Tope (spec §5.1): cada total de línea y el total, menores que S/ 10 000 000 000.
export const AMOUNT_LIMIT = BigInt('1000000000000')

export const isValidQuantity = (quantity: number) =>
  Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY

export type TotalsInput = {
  lines: { quantity: number; unitPrice: bigint }[]
  discountBasisPoints: number
  shipping: bigint
}

export type Totals = TaxResult & {
  lineTotals: bigint[]
  subtotal: bigint
  discount: bigint
  net: bigint
  shipping: bigint
  withinLimit: boolean
}

export function calculateTotals(input: TotalsInput, config: TaxConfig = TAX_CONFIG): Totals {
  const lineTotals = input.lines.map((line) => BigInt(line.quantity) * line.unitPrice)
  const subtotal = lineTotals.reduce((sum, value) => sum + value, ZERO)
  const discount = divideRoundingHalfUp(subtotal * BigInt(input.discountBasisPoints), BigInt(10000))
  const net = subtotal - discount
  const taxed = applyTax(net + input.shipping, config)
  const withinLimit = [...lineTotals, taxed.total].every((value) => value < AMOUNT_LIMIT)
  return { ...taxed, lineTotals, subtotal, discount, net, shipping: input.shipping, withinLimit }
}

// Valores tal como se escriben en la proforma; descuento o envío vacíos cuentan como cero.
export type WrittenValues = {
  lines: { quantity: number; unitPrice: string }[]
  discountPercent: string
  shipping: string
}

// null si algún valor escrito no es válido: la pantalla lo marca y no muestra totales falsos.
export function totalsFromText(
  values: WrittenValues,
  config: TaxConfig = TAX_CONFIG,
): Totals | null {
  const discount = values.discountPercent.trim() === '' ? 0 : parsePercent(values.discountPercent)
  const shipping = values.shipping.trim() === '' ? ZERO : parseCents(values.shipping)
  if (discount === null || shipping === null) return null
  const lines: TotalsInput['lines'] = []
  for (const line of values.lines) {
    const unitPrice = parseCents(line.unitPrice)
    if (unitPrice === null || unitPrice <= ZERO || !isValidQuantity(line.quantity)) return null
    lines.push({ quantity: line.quantity, unitPrice })
  }
  return calculateTotals({ lines, discountBasisPoints: discount, shipping }, config)
}
