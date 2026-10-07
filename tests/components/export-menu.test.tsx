import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it } from 'vitest'
import { ExportMenu } from '@/features/catalog/products/components/export-menu'

const filters = {
  search: 'nada',
  category: null,
  dateBy: 'created',
  date: null,
  from: null,
  to: null,
  sort: 'name',
} as const

describe('ExportMenu', () => {
  it('sin productos que descargar se ve desactivado y explica por qué', async () => {
    const reason = 'No hay productos para descargar con estos filtros.'
    render(
      <>
        <ExportMenu filters={filters} disabled />
        <Toaster />
      </>,
    )
    const button = screen.getByRole('button', { name: 'Descargar Excel' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAccessibleDescription(reason)
    await userEvent.setup().click(button)
    expect(await screen.findByText(reason)).toBeVisible()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
