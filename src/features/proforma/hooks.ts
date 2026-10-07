'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toProductQuery } from '@/features/catalog/list-options'
import { listProducts } from '@/features/catalog/products/queries'
import { catalogKeys } from '@/features/catalog/query-keys'
import { normalizeSearch } from '@/features/catalog/search-pattern'
import type { ProductFilters } from '@/features/catalog/types'
import { settle } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/client'
import { lookupRuc } from './actions'
import { addProduct, quantityMessage } from './draft'
import { getCurrentPrices } from './queries'
import type { RucLookupResult } from './ruc'
import { useProforma } from './store'

// Enter en el buscador añade el producto si la búsqueda deja uno solo (spec §4.1). Usa la misma
// consulta que la lista, así que no espera la pausa de 300 ms y comparte la caché.
export function useAddSingleResult() {
  const queryClient = useQueryClient()
  const { update, announce } = useProforma()
  return async (filters: ProductFilters) => {
    if (normalizeSearch(filters.search) === '') return
    const query = toProductQuery(filters)
    const page = await queryClient
      .query({
        queryKey: catalogKeys.productList(query),
        queryFn: ({ signal }) => listProducts(createClient(), query, signal),
      })
      .catch(() => null)
    if (page?.total !== 1) return
    const [product] = page.items
    announce(
      quantityMessage(
        update((current) => addProduct(current, product)),
        product,
      ),
    )
  }
}

export const proformaKeys = {
  prices: (ids: string[]) => ['proforma', 'prices', ids] as const,
  ruc: (ruc: string) => ['proforma', 'ruc', ruc] as const,
}

// Al abrir la ventana se compara con el catálogo actual, sin la caché de 5 minutos (spec §4.5).
export function useCurrentPrices(ids: string[], enabled: boolean) {
  const sorted = [...ids].sort()
  return useQuery({
    queryKey: proformaKeys.prices(sorted),
    queryFn: () => getCurrentPrices(createClient(), sorted),
    enabled: enabled && sorted.length > 0,
    staleTime: 0,
  })
}

// El resultado queda en la caché de la sesión (spec §7), que se borra al cerrar sesión. «No
// disponible» no se guarda, para poder reintentar.
export function useRucLookup() {
  const queryClient = useQueryClient()
  return (ruc: string): Promise<RucLookupResult> =>
    queryClient
      .query({
        queryKey: proformaKeys.ruc(ruc),
        queryFn: async () => {
          const result = await settle(lookupRuc(ruc))
          if (!result.ok || result.data.kind === 'unavailable') {
            throw new Error('SUNAT no disponible')
          }
          return result.data
        },
        staleTime: Infinity,
        gcTime: Infinity,
      })
      .catch((): RucLookupResult => ({ kind: 'unavailable' }))
}
