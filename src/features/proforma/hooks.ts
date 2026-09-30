'use client'

import { useQueryClient } from '@tanstack/react-query'
import { listProducts } from '@/features/catalog/products/queries'
import { catalogKeys } from '@/features/catalog/query-keys'
import { normalizeSearch } from '@/features/catalog/search-pattern'
import type { ProductFilters } from '@/features/catalog/types'
import { createClient } from '@/lib/supabase/client'
import { addProduct, findLine, unitsText } from './draft'
import { useProforma } from './store'

// Enter en el buscador añade el producto si la búsqueda deja uno solo (spec §4.1). Usa la misma
// consulta que la lista, así que no espera la pausa de 300 ms y comparte la caché.
export function useAddSingleResult() {
  const queryClient = useQueryClient()
  const { draft, update, announce } = useProforma()
  return async (filters: ProductFilters) => {
    if (normalizeSearch(filters.search) === '') return
    const page = await queryClient
      .fetchQuery({
        queryKey: catalogKeys.productList(filters),
        queryFn: ({ signal }) => listProducts(createClient(), filters, signal),
      })
      .catch(() => null)
    if (page?.total !== 1) return
    const [product] = page.items
    update((current) => addProduct(current, product))
    const quantity = (findLine(draft, product.id)?.quantity ?? 0) + 1
    announce(`${product.name}: ${unitsText(quantity)} en la proforma`)
  }
}
