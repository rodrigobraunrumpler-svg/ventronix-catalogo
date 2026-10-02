import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

function renderScreen() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportScreen />
    </QueryClientProvider>,
  )
}

const follows = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('ImportScreen: entrada', () => {
  it('lo primero es dónde subir el Excel; los archivos para descargar van después', () => {
    renderScreen()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Carga masiva de productos' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute('href', '/products')
    const upload = screen.getByRole('heading', { level: 2, name: 'Sube tu Excel' })
    const zone = screen.getByRole('button', { name: /Arrastra tu Excel aquí/ })
    const files = screen.getByRole('heading', { level: 2, name: '¿Aún no tienes el archivo?' })
    expect(follows(upload, zone) && follows(zone, files)).toBe(true)
    expect(
      screen.getByText(
        'Nada se guarda hasta que confirmes: primero verás qué pasará con cada fila.',
      ),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Descargar plantilla' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Descargar mi catálogo' })).toBeVisible()
  })

  it('la guía de cada columna empieza plegada, y responde las preguntas frecuentes', () => {
    renderScreen()
    expect(screen.getByText('¿Cómo completo el archivo?').closest('details')).not.toHaveAttribute(
      'open',
    )
    expect(screen.getByText('¿Se borran los productos que no estén en el archivo?')).toBeVisible()
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0)
  })
})
