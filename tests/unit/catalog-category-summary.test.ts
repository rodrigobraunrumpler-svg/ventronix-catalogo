import { describe, expect, it } from 'vitest'
import { summarizeByCategory } from '@/features/catalog/excel/category-summary'

describe('summarizeByCategory', () => {
  it('cuenta y calcula mínimo, máximo y promedio por categoría, en céntimos', () => {
    const summary = summarizeByCategory([
      { category_name: 'Laptops', unit_price: '100.00' },
      { category_name: 'Impresoras', unit_price: '99.99' },
      { category_name: 'Laptops', unit_price: '300.00' },
      { category_name: 'Laptops', unit_price: '250.50' },
    ])
    expect(summary.categories).toEqual([
      { category: 'Impresoras', count: 1, min: '99.99', max: '99.99', average: '99.99' },
      { category: 'Laptops', count: 3, min: '100.00', max: '300.00', average: '216.83' },
    ])
    expect(summary.total).toEqual({
      category: 'Total',
      count: 4,
      min: '99.99',
      max: '300.00',
      average: '187.62',
    })
  })

  it('sin filas no hay total', () => {
    expect(summarizeByCategory([])).toEqual({ categories: [], total: null })
  })
})
