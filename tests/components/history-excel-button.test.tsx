import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it } from 'vitest'
import { HistoryExcelButton } from '@/features/proforma/history/components/history-excel-button'

describe('HistoryExcelButton', () => {
  it('sin nada que descargar se ve desactivado y explica por qué', async () => {
    const reason = 'No hay proformas para descargar con estos filtros.'
    render(
      <>
        <HistoryExcelButton
          filters={{ search: 'nadie', date: null, from: null, to: null }}
          unavailable={reason}
        />
        <Toaster />
      </>,
    )
    const button = screen.getByRole('button', { name: 'Descargar Excel' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    // Al pasar el mouse (title) y para los lectores de pantalla.
    expect(button).toHaveAccessibleDescription(reason)
    // Al pulsarlo, también en el teléfono.
    await userEvent.setup().click(button)
    expect(await screen.findByText(reason)).toBeVisible()
  })
})
