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
}

export type Product = ProductInput & {
  id: string
  created_at: string
  updated_at: string
}

export type ProductListItem = Product & { category_name: string }
export type ProductFilters = {
  search: string
  category: string | null
  page: number
}

export type ProductPage = {
  items: ProductListItem[]
  total: number
  page: number
  pageSize: 20
}
