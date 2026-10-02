'use client'

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useQueryStates } from 'nuqs'
import { useEffect, useState } from 'react'
import { settle, type ActionResult } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/client'
import { toProductQuery } from '../list-options'
import { catalogKeys } from '../query-keys'
import { searchParsers } from '../search-params'
import type { ProductInput } from '../types'
import { createProduct, deleteProduct, updateProduct } from './actions'
import { getProduct, listProducts } from './queries'

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
    create: async (input: ProductInput) => afterSuccess(await settle(createProduct(input))),
    update: async (id: string, input: ProductInput) =>
      afterSuccess(await settle(updateProduct(id, input))),
    remove: async (id: string) => afterSuccess(await settle(deleteProduct(id))),
  }
}

// Datos actuales del producto al abrir la edición (puede haber cambiado desde que se listó, por
// ejemplo en otro dispositivo): aquí no se usa la caché de 5 minutos.
export function useProduct(id: string | null) {
  return useQuery({
    queryKey: catalogKeys.product(id ?? ''),
    queryFn: () => getProduct(createClient(), id ?? ''),
    enabled: id !== null,
    staleTime: 0,
  })
}

// Búsqueda, categoría y página viven en la URL (spec §7); cada cambio de filtro añade una entrada
// al historial para que atrás/adelante los restauren.
export function useCatalogFilters() {
  return useQueryStates(searchParsers, { history: 'push' })
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// La búsqueda espera 300 ms; claves distintas por filtro y la señal de cancelación evitan que una
// respuesta antigua sustituya a la actual. La fecha viaja ya resuelta en días de Lima.
export function useProducts() {
  const [filters] = useCatalogFilters()
  const search = useDebouncedValue(filters.search, 300)
  const current = toProductQuery({ ...filters, search })
  return {
    filters,
    query: useQuery({
      queryKey: catalogKeys.productList(current),
      queryFn: ({ signal }) => listProducts(createClient(), current, signal),
      placeholderData: keepPreviousData,
    }),
  }
}
