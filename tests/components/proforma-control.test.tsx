import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it } from 'vitest'
import type { ProductListItem } from '@/features/catalog/types'
import { ProformaControl } from '@/features/proforma/components/proforma-control'
import { ProformaProvider } from '@/features/proforma/store'
import { line, seedProforma } from '../support/proforma'

const laptop: ProductListItem = {
  id: line().productId,
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  category_id: '7a2d3b8f-4c5e-4d6f-9a0b-1c2d3e4f5a6b',
  unit_price: '2590.00',
  created_at: '2026-09-30T00:00:00Z',
  updated_at: '2026-09-30T00:00:00Z',
  category_name: 'Laptops',
}

function renderControl() {
  render(
    <ProformaProvider>
      <ProformaControl product={laptop} />
      <Toaster />
    </ProformaProvider>,
  )
  return userEvent.setup()
}

const quantity = () =>
  screen.getByRole('group', { name: 'Cantidad de Laptop de 14 pulgadas en la proforma' })

describe('ProformaControl', () => {
  it('Añadir pasa a [− n +] y lo anuncia', async () => {
    const user = renderControl()
    await user.click(
      screen.getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' }),
    )
    expect(quantity()).toHaveTextContent('1')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Laptop de 14 pulgadas: 1 unidad en la proforma',
    )
    await user.click(
      screen.getByRole('button', { name: 'Una unidad más de Laptop de 14 pulgadas' }),
    )
    expect(quantity()).toHaveTextContent('2')
    expect(screen.getByRole('status')).toHaveTextContent('2 unidades en la proforma')
    await user.click(
      screen.getByRole('button', { name: 'Una unidad menos de Laptop de 14 pulgadas' }),
    )
    expect(quantity()).toHaveTextContent('1')
  })

  it('bajar de 1 lo quita y «Deshacer» lo devuelve', async () => {
    const user = renderControl()
    await user.click(
      screen.getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Quitar Laptop de 14 pulgadas de la proforma' }),
    )
    expect(
      screen.getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' }),
    ).toBeVisible()
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(quantity()).toHaveTextContent('1')
  })

  it('no pasa de 9 999 unidades', () => {
    seedProforma({ lines: [line({ quantity: 9999 })] })
    renderControl()
    expect(
      screen.getByRole('button', { name: 'Una unidad más de Laptop de 14 pulgadas' }),
    ).toBeDisabled()
  })
})
