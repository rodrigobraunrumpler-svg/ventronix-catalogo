import { centsToDecimal, divideRoundingHalfUp, parseCents } from '@/features/proforma/money'

export type CategorySummary = {
  category: string
  count: number
  min: string
  max: string
  average: string
}

type PricedRow = { category_name: string; unit_price: string }

function summarize(category: string, prices: bigint[]): CategorySummary {
  const total = prices.reduce((sum, price) => sum + price, BigInt(0))
  return {
    category,
    count: prices.length,
    min: centsToDecimal(prices.reduce((a, b) => (b < a ? b : a))),
    max: centsToDecimal(prices.reduce((a, b) => (b > a ? b : a))),
    average: centsToDecimal(divideRoundingHalfUp(total, BigInt(prices.length))),
  }
}

// Resumen del reporte por categoría (spec del Excel §5.2), en céntimos: sin errores de redondeo.
export function summarizeByCategory(rows: PricedRow[]) {
  const byCategory = new Map<string, bigint[]>()
  for (const row of rows) {
    const price = parseCents(row.unit_price)
    if (price === null) continue
    const prices = byCategory.get(row.category_name)
    if (prices) prices.push(price)
    else byCategory.set(row.category_name, [price])
  }
  const categories = [...byCategory]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([category, prices]) => summarize(category, prices))
  const all = [...byCategory.values()].flat()
  return { categories, total: all.length > 0 ? summarize('Total', all) : null }
}
