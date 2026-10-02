import {
  CATEGORY_SIMILARITY_DISTANCE,
  CATEGORY_SIMILARITY_MIN_LENGTH,
  categoryKey,
} from '../import/options'

// Sin dependencias del servidor: se prueba aparte (spec §9.2).

export type CategoryMatch =
  { kind: 'existing' | 'near' | 'similar'; target: string } | { kind: 'new' }

// Minúsculas, sin tildes ni espacios dobles y sin la «s» o «es» del plural (spec §9.4).
export const categoryStem = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?:es|s)$/, '')

export function levenshtein(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

// La misma (como el índice único), casi igual (tildes, mayúsculas, espacios o plural), parecida
// (hasta 2 letras de diferencia en nombres de 5 o más) o nueva. Con varias, la más cercana.
export function matchCategory(name: string, existing: string[]): CategoryMatch {
  const key = categoryKey(name)
  const same = existing.find((candidate) => categoryKey(candidate) === key)
  if (same) return { kind: 'existing', target: same }
  const stem = categoryStem(name)
  let best: { target: string; distance: number } | null = null
  for (const candidate of [...existing].sort((a, b) => a.localeCompare(b, 'es'))) {
    const other = categoryStem(candidate)
    if (other === stem) return { kind: 'near', target: candidate }
    if (
      stem.length < CATEGORY_SIMILARITY_MIN_LENGTH ||
      other.length < CATEGORY_SIMILARITY_MIN_LENGTH
    ) {
      continue
    }
    const distance = levenshtein(stem, other)
    if (distance <= CATEGORY_SIMILARITY_DISTANCE && (!best || distance < best.distance)) {
      best = { target: candidate, distance }
    }
  }
  return best ? { kind: 'similar', target: best.target } : { kind: 'new' }
}
