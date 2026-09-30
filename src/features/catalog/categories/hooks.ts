'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ActionResult } from '@/lib/action-result'
import { catalogKeys } from '../query-keys'
import type { CategoryInput } from '../types'
import { createCategory, deleteCategory, updateCategory } from './actions'
import { listCategories, listCategoryOptions } from './queries'

export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: () => listCategories(createClient()),
  })
}

export function useCategoryOptions() {
  return useQuery({
    queryKey: catalogKeys.categoryOptions,
    queryFn: () => listCategoryOptions(createClient()),
  })
}

// Tras un cambio correcto se refrescan la lista, las opciones y los productos que muestran el nombre.
export function useCategoryMutations() {
  const queryClient = useQueryClient()

  async function afterSuccess<T>(result: ActionResult<T>) {
    if (result.ok) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: catalogKeys.categories }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.categoryOptions }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.products }),
      ])
    }
    return result
  }

  return {
    create: async (input: CategoryInput) => afterSuccess(await createCategory(input)),
    rename: async (id: string, input: CategoryInput) =>
      afterSuccess(await updateCategory(id, input)),
    remove: async (id: string) => afterSuccess(await deleteCategory(id)),
  }
}
