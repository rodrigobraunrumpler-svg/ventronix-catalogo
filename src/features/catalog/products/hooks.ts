'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ActionResult } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/client'
import { catalogKeys } from '../query-keys'
import type { ProductInput } from '../types'
import { createProduct, deleteProduct, updateProduct } from './actions'
import { getProduct } from './queries'

// Tras un cambio correcto se refrescan los productos y los contadores de las categorías.
export function useProductMutations() {
  const queryClient = useQueryClient()

  async function afterSuccess<T>(result: ActionResult<T>) {
    if (result.ok) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: catalogKeys.products }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.categories }),
      ])
    }
    return result
  }

  return {
    create: async (input: ProductInput) => afterSuccess(await createProduct(input)),
    update: async (id: string, input: ProductInput) => afterSuccess(await updateProduct(id, input)),
    remove: async (id: string) => afterSuccess(await deleteProduct(id)),
  }
}

// Datos actuales del producto al abrir la edición (puede haber cambiado desde que se listó).
export function useProduct(id: string | null) {
  return useQuery({
    queryKey: catalogKeys.product(id ?? ''),
    queryFn: () => getProduct(createClient(), id ?? ''),
    enabled: id !== null,
  })
}
