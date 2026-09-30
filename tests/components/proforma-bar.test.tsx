import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { ProformaBar } from '@/features/proforma/components/proforma-bar'
import { ProformaProvider } from '@/features/proforma/store'
import { e1Lines, seedProforma } from '../support/proforma'

function renderBar() {
  const onComplete = vi.fn()
  render(
    <ProformaProvider>
      <ProformaBar onComplete={onComplete} />
      <Toaster />
    </ProformaProvider>,
  )
  return { onComplete, user: userEvent.setup() }
}

const bar = () => screen.queryByRole('region', { name: 'Proforma' })

describe('ProformaBar', () => {
  it('no aparece sin productos', () => {
    renderBar()
    expect(bar()).not.toBeInTheDocument()
  })

  it('muestra productos, unidades y el total con IGV (ejemplo E1)', () => {
    seedProforma({ lines: e1Lines, discountPercent: '5', shipping: '20' })
    renderBar()
    expect(bar()).toHaveTextContent('3 productos · 4 unidades')
    expect(bar()).toHaveTextContent('Total con IGV')
    expect(bar()).toHaveTextContent('S/ 8,114.00')
  })

  it('«Completar proforma» abre la ventana', async () => {
    seedProforma({ lines: e1Lines })
    const { onComplete, user } = renderBar()
    await user.click(screen.getByRole('button', { name: 'Completar proforma' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('«Vaciar» quita todo y «Deshacer» lo devuelve', async () => {
    seedProforma({ lines: e1Lines, discountPercent: '5', shipping: '20' })
    const { user } = renderBar()
    await user.click(screen.getByRole('button', { name: 'Vaciar' }))
    expect(bar()).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(bar()).toHaveTextContent('S/ 8,114.00')
  })
})
