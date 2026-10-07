import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { catalogKeys } from '@/features/catalog/query-keys'
import { toProductQuery } from '@/features/catalog/list-options'
import type { ProductFilters, ProductListItem, ProductPage } from '@/features/catalog/types'
import { useAddSingleResult } from '@/features/proforma/hooks'
import { ProformaProvider } from '@/features/proforma/store'

const laptop: ProductListItem = {
  id: '8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c',
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  category_id: '7a2d3b8f-4c5e-4d6f-9a0b-1c2d3e4f5a6b',
  unit_price: '2590.00',
  created_at: '2026-09-30T00:00:00Z',
  updated_at: '2026-09-30T00:00:00Z',
  image_path: null,
  category_name: 'Laptops',
}
const filters: ProductFilters = {
  search: 'lap-001',
  category: null,
  page: 1,
  dateBy: 'created',
  date: null,
  from: null,
  to: null,
  sort: 'name',
}

// El mismo manejador dos veces seguidas, sin volver a dibujar la pantalla entre medias.
function EnterTwice() {
  const addSingleResult = useAddSingleResult()
  return (
    <button
      type="button"
      onClick={async () => {
        await addSingleResult(filters)
        await addSingleResult(filters)
      }}
    >
      Enter dos veces
    </button>
  )
}

describe('useAddSingleResult', () => {
  it('anuncia las unidades que de verdad hay en la proforma', async () => {
    // La búsqueda ya está en la caché: no hace falta Supabase.
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
    const page: ProductPage = { items: [laptop], total: 1, page: 1, pageSize: 20 }
    queryClient.setQueryData(catalogKeys.productList(toProductQuery(filters)), page)
    render(
      <QueryClientProvider client={queryClient}>
        <ProformaProvider>
          <EnterTwice />
        </ProformaProvider>
      </QueryClientProvider>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enter dos veces' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Laptop de 14 pulgadas: 2 unidades en la proforma',
      ),
    )
  })
})
