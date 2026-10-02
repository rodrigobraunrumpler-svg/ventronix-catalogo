import { createParser, parseAsStringLiteral } from 'nuqs'
import { DATE_FIELDS, DATE_PRESETS, isIsoDay, PRODUCT_SORTS } from './list-options'
import { idSchema } from './schemas'
import { SEARCH_MAX_LENGTH } from './search-pattern'

// Un valor inválido en la URL vuelve a su valor por defecto sin bloquear la pantalla.
const pageParser = createParser({
  parse: (value: string) => {
    const page = Number(value)
    return value !== '' && Number.isInteger(page) && page >= 1 ? page : null
  },
  serialize: (page: number) => String(page),
}).withDefault(1)

const categoryParser = createParser({
  parse: (value: string) => (idSchema.safeParse(value).success ? value : null),
  serialize: (value: string) => value,
})

const searchParser = createParser({
  parse: (value: string) => value.slice(0, SEARCH_MAX_LENGTH),
  serialize: (value: string) => value,
}).withDefault('')

// Un día mal escrito o que no existe (2026-02-30) se ignora, como cualquier valor inválido.
const dayParser = createParser({
  parse: (value: string) => (isIsoDay(value) ? value : null),
  serialize: (value: string) => value,
})

export const searchParsers = {
  search: searchParser,
  category: categoryParser,
  page: pageParser,
  dateBy: parseAsStringLiteral(DATE_FIELDS).withDefault('created'),
  date: parseAsStringLiteral(DATE_PRESETS),
  from: dayParser,
  to: dayParser,
  sort: parseAsStringLiteral(PRODUCT_SORTS).withDefault('name'),
}

// Páginas visibles: primera, última y las vecinas de la actual; 'gap' marca un salto.
export function pageList(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b)
  return pages.flatMap((page, index) =>
    index > 0 && page - pages[index - 1] > 1 ? (['gap', page] as const) : [page],
  )
}
