import { describe, expect, it } from 'vitest'
import { categoryStem, levenshtein, matchCategory } from '@/features/catalog/excel/similar'

const EXISTING = ['Impresoras', 'Impresión', 'Laptops', 'Lápices']

describe('categorías parecidas', () => {
  it('normaliza tildes, mayúsculas, espacios y el plural', () => {
    expect(categoryStem('  Impresoras ')).toBe('impresora')
    expect(categoryStem('IMPRESIÓN')).toBe('impresion')
    expect(categoryStem('Monitores')).toBe('monitor')
    expect(levenshtein('laptp', 'laptop')).toBe(1)
    expect(levenshtein('', 'abc')).toBe(3)
  })

  it('distingue la misma, casi igual, parecida y nueva', () => {
    expect(matchCategory('laptops', EXISTING)).toEqual({ kind: 'existing', target: 'Laptops' })
    expect(matchCategory('Impresora', EXISTING)).toEqual({ kind: 'near', target: 'Impresoras' })
    expect(matchCategory('Impresion', EXISTING)).toEqual({ kind: 'near', target: 'Impresión' })
    expect(matchCategory('Laptps', EXISTING)).toEqual({ kind: 'similar', target: 'Laptops' })
    expect(matchCategory('Monitores', EXISTING)).toEqual({ kind: 'new' })
  })

  it('elige la más cercana y no compara nombres de menos de 5 letras', () => {
    expect(matchCategory('Laptopz', EXISTING)).toEqual({ kind: 'similar', target: 'Laptops' })
    expect(matchCategory('Mous', ['Mesa'])).toEqual({ kind: 'new' })
  })
})
