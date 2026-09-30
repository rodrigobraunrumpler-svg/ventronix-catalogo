export const SEARCH_MAX_LENGTH = 120

// Solo recorta espacios y longitud: los caracteres especiales se envían tal cual como parámetro y
// la función SQL search_products los trata como texto literal.
export function normalizeSearch(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, SEARCH_MAX_LENGTH)
}
