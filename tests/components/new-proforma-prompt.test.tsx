import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewProformaPrompt } from '@/features/proforma/history/components/new-proforma-prompt'

function renderPrompt() {
  const handlers = { onKeep: vi.fn(), onStartNew: vi.fn(), onClose: vi.fn() }
  render(<NewProformaPrompt open summary="3 productos · S/ 1,234.00" {...handlers} />)
  const dialog = within(screen.getByRole('alertdialog', { name: '¿Empezar una proforma nueva?' }))
  return { ...handlers, dialog, user: userEvent.setup() }
}

describe('NewProformaPrompt', () => {
  it('explica qué se perdería y deja el foco en la opción segura', () => {
    const { dialog } = renderPrompt()
    expect(
      dialog.getByText(
        'Tienes una proforma sin generar (3 productos · S/ 1,234.00). Si empiezas otra, esa se borra.',
      ),
    ).toBeVisible()
    expect(dialog.getByRole('button', { name: 'Seguir con la actual' })).toHaveFocus()
  })

  it('«Seguir con la actual» la conserva', async () => {
    const { dialog, onKeep, onStartNew, user } = renderPrompt()
    await user.click(dialog.getByRole('button', { name: 'Seguir con la actual' }))
    expect(onKeep).toHaveBeenCalledTimes(1)
    expect(onStartNew).not.toHaveBeenCalled()
  })

  it('«Empezar una nueva» avisa a quien la abrió', async () => {
    const { dialog, onKeep, onStartNew, user } = renderPrompt()
    await user.click(dialog.getByRole('button', { name: 'Empezar una nueva' }))
    expect(onStartNew).toHaveBeenCalledTimes(1)
    expect(onKeep).not.toHaveBeenCalled()
  })

  it('avisa cuando terminó de cerrarse, para abrir la proforma sin dos ventanas a la vez', async () => {
    const onClosed = vi.fn()
    const props = { summary: '1 producto · S/ 350.00', onKeep: vi.fn(), onStartNew: vi.fn() }
    const { rerender } = render(
      <NewProformaPrompt open onClose={vi.fn()} onClosed={onClosed} {...props} />,
    )
    expect(onClosed).not.toHaveBeenCalled()
    rerender(<NewProformaPrompt open={false} onClose={vi.fn()} onClosed={onClosed} {...props} />)
    await vi.waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1))
  })
})
