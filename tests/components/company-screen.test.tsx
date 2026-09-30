import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CompanyScreen } from '@/features/company/components/company-screen'

// La consulta no responde nunca: la pantalla se queda cargando.
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/features/company/queries', () => ({ getCompanyProfile: () => new Promise(() => {}) }))

it('mientras carga muestra un esqueleto del formulario, no un texto suelto', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CompanyScreen />
    </QueryClientProvider>,
  )
  expect(screen.getByText('Cargando los datos de tu empresa…')).toBeInTheDocument()
  expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
})
