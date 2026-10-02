import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CategoryDecisions,
  ImportOptionsPanel,
  SummaryCards,
  VisualSummary,
} from '@/features/catalog/import/components/import-preview'
import { DEFAULT_IMPORT_OPTIONS } from '@/features/catalog/import/options'
import type { PreviewCounts } from '@/features/catalog/import/types'

const counts: PreviewCounts = {
  create: 3,
  update: 1,
  unchanged: 1,
  review: 2,
  error: 2,
  omitted: 4,
}

describe('vista previa: resumen', () => {
  it('las tarjetas muestran cada cifra y filtran al pulsarlas', async () => {
    const onSelect = vi.fn()
    render(<SummaryCards counts={counts} active="error" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /Con errores/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.setup().click(screen.getByRole('button', { name: /Para revisar/ }))
    expect(onSelect).toHaveBeenCalledWith('review')
  })

  it('las opciones avisan el cambio y cuentan las filas omitidas', async () => {
    const onChange = vi.fn()
    render(
      <ImportOptionsPanel
        options={{ ...DEFAULT_IMPORT_OPTIONS, mode: 'update' }}
        counts={counts}
        disabled={false}
        onChange={onChange}
      />,
    )
    expect(
      screen.getByText('4 filas omitidas por el modo «Solo actualizar los existentes».'),
    ).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole('radio', { name: 'No incluyen IGV: sumar 18 %' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_IMPORT_OPTIONS,
      mode: 'update',
      pricesIncludeTax: false,
    })
  })

  it('precios y categorías llevan su cifra en texto', () => {
    render(
      <VisualSummary
        prices={{ up: 150, down: 3, upAverage: 0.082, downAverage: -0.04 }}
        bars={[
          { name: 'Laptops', products: 12, tag: null },
          { name: 'Monitores', products: 3, tag: 'new' },
          { name: 'Laptps', products: 1, tag: 'similar' },
        ]}
      />,
    )
    expect(screen.getByText(/Suben 150/).closest('p')).toHaveTextContent(
      'Suben 150 (promedio +8.2 %) · Bajan 3 (promedio −4.0 %)',
    )
    expect(screen.getByText('nueva')).toBeVisible()
    expect(screen.getByText('¿parecida?')).toBeVisible()
    expect(screen.getByText('12 productos')).toBeVisible()
  })

  it('una categoría parecida pide decidir y la casi igual ya viene decidida', async () => {
    const onDecide = vi.fn()
    render(
      <CategoryDecisions
        choices={[
          {
            key: 'impresora',
            name: 'Impresora',
            kind: 'near',
            suggestion: 'Impresoras',
            decision: { action: 'use', target: 'Impresoras' },
            products: 4,
          },
          {
            key: 'laptps',
            name: 'Laptps',
            kind: 'similar',
            suggestion: 'Laptops',
            decision: null,
            products: 1,
          },
          {
            key: 'monitores',
            name: 'Monitores',
            kind: 'new',
            suggestion: null,
            decision: { action: 'create' },
            products: 3,
          },
        ]}
        disabled={false}
        onDecide={onDecide}
      />,
    )
    expect(
      screen.getByText('Decide 1 categoría antes de importar: así no se crean duplicadas.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Usar "Impresoras"' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('Elige una opción para poder importar.')).toBeVisible()
    expect(screen.getByText(/Se crearán:/).closest('p')).toHaveTextContent(
      'Se crearán: Monitores (3)',
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar "Laptops"' }))
    expect(onDecide).toHaveBeenCalledWith('laptps', { action: 'use', target: 'Laptops' })
  })
})
