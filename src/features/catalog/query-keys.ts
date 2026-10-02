import type { ProductQuery } from './types'

export const catalogKeys = {
  all: ['catalog'] as const,
  categories: ['catalog', 'categories'] as const,
  categoryOptions: ['catalog', 'category-options'] as const,
  products: ['catalog', 'products'] as const,
  productList: (query: ProductQuery) => ['catalog', 'products', 'list', query] as const,
  product: (id: string) => ['catalog', 'products', 'detail', id] as const,
  // Bajo «products»: lo que refresca la lista refresca también los indicadores.
  stats: ['catalog', 'products', 'stats'] as const,
}
