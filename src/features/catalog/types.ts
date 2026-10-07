import type { DateField, DatePreset, ProductSort } from './list-options'

export type Category = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type CategoryOption = Pick<Category, 'id' | 'name'>
// La tarjeta Categorías muestra cuántos productos tiene cada una (spec §7).
export type CategoryListItem = Category & { product_count: number }
export type CategoryInput = { name: string }

export type ProductInput = {
  code: string
  name: string
  description: string | null
  category_id: string
  unit_price: string
  image_path: string | null // foto opcional: products/<uuid>.jpg
}

export type Product = ProductInput & {
  id: string
  created_at: string
  updated_at: string
}

export type ProductListItem = Product & { category_name: string }
// Estado de la lista en la URL (spec del Excel §4.5).
export type ProductFilters = {
  search: string
  category: string | null
  page: number
  dateBy: DateField
  date: DatePreset | null
  from: string | null
  to: string | null
  sort: ProductSort
}

// Lo que se pide a la base: la fecha ya resuelta en días de Lima. Lo nuevo es opcional para que la
// búsqueda de la proforma, que solo busca por texto, siga igual.
export type ProductQuery = {
  search: string
  category: string | null
  page: number
  dateBy?: DateField
  dateFrom?: string | null
  dateTo?: string | null
  sort?: ProductSort
}

export type ProductPage = {
  items: ProductListItem[]
  total: number
  page: number
  pageSize: number
}

// Cifras de los indicadores de la cabecera (spec del Excel §4.1).
export type CatalogStats = { products: number; createdThisMonth: number; updatedLast7Days: number }
