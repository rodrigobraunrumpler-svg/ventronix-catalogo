import { describe, expect, it } from 'vitest'
import { pageList, searchParsers } from '@/features/catalog/search-params'
import { normalizeSearch } from '@/features/catalog/search-pattern'

describe('parámetros de la URL', () => {
  it.each([
    ['1', 1],
    ['7', 7],
  ])('acepta la página %s', (value, expected) => {
    expect(searchParsers.page.parse(value)).toBe(expected)
  })

  it.each(['0', '-3', '2.5', 'abc', ''])('descarta la página %j (vuelve a la 1)', (value) => {
    expect(searchParsers.page.parse(value)).toBeNull()
    expect(searchParsers.page.defaultValue).toBe(1)
  })

  it('acepta una categoría con UUID válido', () => {
    const id = '6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a'
    expect(searchParsers.category.parse(id)).toBe(id)
  })

  it.each(['laptops', '123', "'; drop table products;--"])(
    'descarta la categoría %j (sin filtro)',
    (value) => {
      expect(searchParsers.category.parse(value)).toBeNull()
    },
  )

  it('limita la búsqueda a 120 caracteres', () => {
    expect(searchParsers.search.parse('a'.repeat(300))).toHaveLength(120)
    expect(searchParsers.search.defaultValue).toBe('')
  })
})

describe('texto de búsqueda', () => {
  it('quita espacios exteriores y repetidos', () => {
    expect(normalizeSearch('   laptop    14  ')).toBe('laptop 14')
  })

  it('conserva literales los caracteres especiales', () => {
    expect(normalizeSearch(`50% _x_ (a,b) "q" \\ /`)).toBe(`50% _x_ (a,b) "q" \\ /`)
  })

  it('limita la longitud a 120 caracteres', () => {
    expect(normalizeSearch('b'.repeat(200))).toHaveLength(120)
  })
})

describe('números de página visibles', () => {
  it('muestra todas cuando son pocas', () => {
    expect(pageList(2, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it('resume con puntos suspensivos cuando son muchas', () => {
    expect(pageList(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20])
    expect(pageList(1, 20)).toEqual([1, 2, 'gap', 20])
    expect(pageList(20, 20)).toEqual([1, 'gap', 19, 20])
  })
})
