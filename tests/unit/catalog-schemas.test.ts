import { describe, expect, it } from 'vitest'
import { categorySchema, idSchema, productSchema } from '@/features/catalog/schemas'

const categoryId = '6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a'

const validProduct = {
  code: 'lap-001',
  name: 'Laptop de 14 pulgadas',
  description: 'Diseño ligero',
  category_id: categoryId,
  unit_price: '2590',
}

describe('categorySchema', () => {
  it('quita los espacios exteriores del nombre', () => {
    expect(categorySchema.parse({ name: '  Laptops  ' })).toEqual({ name: 'Laptops' })
  })

  it.each(['', '   '])('rechaza un nombre vacío (%j)', (name) => {
    expect(categorySchema.safeParse({ name }).success).toBe(false)
  })

  it('rechaza un nombre de más de 120 caracteres', () => {
    expect(categorySchema.safeParse({ name: 'a'.repeat(121) }).success).toBe(false)
  })
})

describe('productSchema', () => {
  it('guarda el código sin espacios exteriores y en mayúsculas', () => {
    expect(productSchema.parse({ ...validProduct, code: '  lap-001 ' }).code).toBe('LAP-001')
  })

  it.each(['', '   '])('rechaza un código vacío (%j)', (code) => {
    expect(productSchema.safeParse({ ...validProduct, code }).success).toBe(false)
  })

  it('rechaza un código de más de 64 caracteres', () => {
    expect(productSchema.safeParse({ ...validProduct, code: 'A'.repeat(65) }).success).toBe(false)
  })

  it.each(['', '   '])('rechaza un nombre vacío (%j)', (name) => {
    expect(productSchema.safeParse({ ...validProduct, name }).success).toBe(false)
  })

  it('rechaza un nombre de más de 120 caracteres', () => {
    expect(productSchema.safeParse({ ...validProduct, name: 'a'.repeat(121) }).success).toBe(false)
  })

  it.each(['', '   ', null, undefined])(
    'guarda una descripción vacía como null (%j)',
    (description) => {
      expect(productSchema.parse({ ...validProduct, description }).description).toBeNull()
    },
  )

  it('rechaza una descripción de más de 2000 caracteres', () => {
    const description = 'a'.repeat(2001)
    expect(productSchema.safeParse({ ...validProduct, description }).success).toBe(false)
  })

  it('rechaza una categoría que no es un UUID', () => {
    expect(productSchema.safeParse({ ...validProduct, category_id: 'laptops' }).success).toBe(false)
  })

  it('normaliza el precio a dos decimales', () => {
    expect(productSchema.parse(validProduct).unit_price).toBe('2590.00')
  })

  it('no acepta ID ni fechas desde el formulario', () => {
    const parsed = productSchema.parse({
      ...validProduct,
      id: categoryId,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    expect(parsed).toEqual({
      code: 'LAP-001',
      name: 'Laptop de 14 pulgadas',
      description: 'Diseño ligero',
      category_id: categoryId,
      unit_price: '2590.00',
    })
  })
})

describe('idSchema', () => {
  it('acepta un UUID', () => {
    expect(idSchema.safeParse(categoryId).success).toBe(true)
  })

  it.each(['', 'abc', '123'])('rechaza %j', (value) => {
    expect(idSchema.safeParse(value).success).toBe(false)
  })
})
