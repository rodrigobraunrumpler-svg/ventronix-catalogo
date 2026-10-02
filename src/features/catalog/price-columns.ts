import { centsToDecimal, parseCents } from '@/features/proforma/money'
import { applyTax, TAX_CONFIG, type TaxConfig } from '@/features/proforma/tax'

export type PriceColumns = {
  catalog: string
  derived: { label: string; from: (price: string) => string } | null
  note: string
}

const cents = (price: string) => parseCents(price) ?? BigInt(0)

// Títulos y nota del precio según el IGV (spec del Excel §3). El catálogo guarda el precio tal como
// se vende; la otra columna se calcula con el mismo módulo que la proforma. Fuera de excel/: la
// carga masiva (fase 2) muestra estos títulos en el navegador.
export function priceColumns(config: TaxConfig = TAX_CONFIG): PriceColumns {
  if (config.mode === 'none') {
    return { catalog: 'Precio (S/)', derived: null, note: 'Precios en soles (S/).' }
  }
  if (config.mode === 'added') {
    return {
      catalog: 'Precio sin IGV (S/)',
      derived: {
        label: 'Precio con IGV (S/)',
        from: (price) => centsToDecimal(applyTax(cents(price), config).total),
      },
      note: `Precios en soles (S/), sin IGV (${config.ratePercent} %).`,
    }
  }
  return {
    catalog: 'Precio con IGV (S/)',
    derived: {
      label: 'Valor sin IGV (S/)',
      from: (price) => centsToDecimal(applyTax(cents(price), config).base),
    },
    note: 'Precios en soles (S/), con IGV incluido.',
  }
}
