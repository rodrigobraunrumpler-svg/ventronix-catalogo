import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImportScreen } from '@/features/catalog/import/components/import-screen'

// Las acciones cargan Supabase y ExcelJS en el servidor; esta prueba no las usa.
vi.mock('@/features/catalog/products/excel-actions', () => ({
  downloadImportTemplate: vi.fn(),
  exportProducts: vi.fn(),
  previewProductImport: vi.fn(),
  importProducts: vi.fn(),
  downloadImportSimulation: vi.fn(),
  downloadImportErrors: vi.fn(),
}))

function renderScreen(hasProducts: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportScreen hasProducts={hasProducts} />
    </QueryClientProvider>,
  )
}

describe('ImportScreen: entrada', () => {
  it('con el catálogo vacío propone cargar productos nuevos', () => {
    renderScreen(false)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Carga masiva de productos' }),
    ).toBeVisible()
    expect(screen.getByRole('radio', { name: /Cargar productos nuevos/ })).toBeChecked()
    expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute('href', '/products')
  })

  it('con productos propone actualizarlos, y se puede cambiar', async () => {
    renderScreen(true)
    const update = screen.getByRole('radio', { name: /Actualizar precios o datos/ })
    expect(update).toBeChecked()
    await userEvent.setup().click(screen.getByRole('radio', { name: /Cargar productos nuevos/ }))
    expect(update).not.toBeChecked()
  })

  it('responde las preguntas frecuentes', () => {
    renderScreen(true)
    expect(screen.getByText('¿Se borran los productos que no estén en el archivo?')).toBeVisible()
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0)
  })
})
