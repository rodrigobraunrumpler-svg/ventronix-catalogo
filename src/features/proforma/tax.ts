import { divideRoundingHalfUp, HUNDRED, ZERO } from './money'

// IGV en un módulo aislado (spec §5.2): cambiar de modo es cambiar TAX_CONFIG, nada más.
export type TaxMode = 'included' | 'included-hidden' | 'added' | 'none'
export type TaxConfig = { mode: TaxMode; ratePercent: number }

// ponytail: incluido con desglose por defecto; falta confirmarlo con quien envió el ejemplo (spec §12).
export const TAX_CONFIG: TaxConfig = { mode: 'included', ratePercent: 18 }

export type TaxResult = {
  base: bigint // Op. gravada
  tax: bigint // IGV
  total: bigint // lo que paga el cliente
  showBreakdown: boolean
  pricesIncludeTax: boolean
}

export function applyTax(amount: bigint, config: TaxConfig = TAX_CONFIG): TaxResult {
  const rate = BigInt(config.ratePercent)
  if (config.mode === 'added') {
    const tax = divideRoundingHalfUp(amount * rate, HUNDRED)
    return { base: amount, tax, total: amount + tax, showBreakdown: true, pricesIncludeTax: false }
  }
  if (config.mode === 'none') {
    return { base: amount, tax: ZERO, total: amount, showBreakdown: false, pricesIncludeTax: false }
  }
  // Incluido: se redondea la base y el IGV es la diferencia, así ambos suman exactamente el total.
  const base = divideRoundingHalfUp(amount * HUNDRED, HUNDRED + rate)
  return {
    base,
    tax: amount - base,
    total: amount,
    showBreakdown: config.mode === 'included',
    pricesIncludeTax: true,
  }
}
