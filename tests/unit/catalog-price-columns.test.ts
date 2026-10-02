import { describe, expect, it } from 'vitest'
import { priceColumns } from '@/features/catalog/price-columns'

describe('priceColumns', () => {
  it('con IGV incluido: precio con IGV y valor sin IGV, redondeado como la «Op. gravada»', () => {
    const columns = priceColumns({ mode: 'included', ratePercent: 18 })
    expect(columns.catalog).toBe('Precio con IGV (S/)')
    expect(columns.derived?.label).toBe('Valor sin IGV (S/)')
    expect(columns.derived?.from('1180.00')).toBe('1000.00')
    expect(columns.derived?.from('1.00')).toBe('0.85')
    expect(columns.note).toBe('Precios en soles (S/), con IGV incluido.')
  })

  it('con IGV aparte: el catálogo es sin IGV y se calcula el precio con IGV', () => {
    const columns = priceColumns({ mode: 'added', ratePercent: 18 })
    expect(columns.catalog).toBe('Precio sin IGV (S/)')
    expect(columns.derived?.label).toBe('Precio con IGV (S/)')
    expect(columns.derived?.from('1000.00')).toBe('1180.00')
  })

  it('sin IGV: una sola columna de precio', () => {
    expect(priceColumns({ mode: 'none', ratePercent: 18 })).toEqual({
      catalog: 'Precio (S/)',
      derived: null,
      note: 'Precios en soles (S/).',
    })
  })
})
