import type { ProductFilters } from './types'

export const catalogKeys = {
  all: ['catalog'] as const,
  categories: ['catalog', 'categories'] as const,
  categoryOptions: ['catalog', 'category-options'] as const,
  products: ['catalog', 'products'] as const,
  productList: (filters: ProductFilters) => ['catalog', 'products', 'list', filters] as const,
  product: (id: string) => ['catalog', 'products', 'detail', id] as const,
}
