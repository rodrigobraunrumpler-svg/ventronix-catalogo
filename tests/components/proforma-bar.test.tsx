import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProformaBar } from '@/features/proforma/components/proforma-bar'
import { ProformaProvider, UNDO_MS } from '@/features/proforma/store'
import { discardPhotos } from '@/lib/use-photos'
import { e1Lines, freeLine, seedProforma } from '../support/proforma'

vi.mock('@/lib/use-photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-photos')>()),
  discardPhotos: vi.fn(),
}))

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

  it('con una proforma ya numerada, dice que hay cambios sin guardar', () => {
    seedProforma({ lines: e1Lines, number: 3, issuedAt: '2026-10-07T15:00:00.000Z' })
    renderBar()
    expect(bar()).toHaveTextContent('Proforma N° 0003')
    expect(bar()).toHaveTextContent('Cambios sin guardar · 3 productos · 4 unidades')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Completar proforma' })).not.toBeInTheDocument()
  })

  it('«Descartar cambios» deja lo guardado en el historial y se puede deshacer', async () => {
    seedProforma({ lines: e1Lines, number: 3, issuedAt: '2026-10-07T15:00:00.000Z' })
    const { user } = renderBar()
    await user.click(screen.getByRole('button', { name: 'Descartar cambios' }))
    expect(bar()).not.toBeInTheDocument()
    const message = await screen.findByText(
      'Descartaste los cambios de la N° 0003. Lo guardado sigue en el historial.',
    )
    expect(message).toBeVisible()
    // El aviso de «Vaciar» de la prueba anterior puede seguir saliendo: se usa el de este.
    const notice = message.closest<HTMLElement>('[data-sonner-toast]')!
    await user.click(within(notice).getByRole('button', { name: 'Deshacer' }))
    expect(bar()).toHaveTextContent('Proforma N° 0003')
  })

  it('al pasar «Deshacer» de «Vaciar», borra las fotos de los productos libres', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const free = 'lines/11111111-1111-4111-8111-111111111111.jpg'
    seedProforma({ lines: [...e1Lines, freeLine({ imagePath: free })] })
    const { user } = renderBar()
    await user.click(screen.getByRole('button', { name: 'Vaciar' }))
    expect(discardPhotos).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(UNDO_MS + 1000)
    })
    expect(discardPhotos).toHaveBeenCalledWith([free])
  })
})

afterEach(() => vi.useRealTimers())
