import { searchParsers } from '@/features/catalog/search-params'

// Búsqueda, fechas y página del historial en la URL (spec de productos libres §4.2): recargar o
// compartir el enlace muestra lo mismo. Los mismos parsers que Productos.
export const historyParsers = {
  search: searchParsers.search,
  page: searchParsers.page,
  date: searchParsers.date,
  from: searchParsers.from,
  to: searchParsers.to,
}
