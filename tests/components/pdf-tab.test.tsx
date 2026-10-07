import { within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openFile, pdfTab, SLOW_MS } from '@/features/proforma/document/files'

// Una pestaña nueva con su documento en blanco y su ventana, como la que abre el navegador.
function fakeTab(closed = false) {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  const tab = {
    document: frame.contentDocument!,
    closed,
    location: { href: '' },
    close: vi.fn(),
    opener: window,
  }
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  return tab
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.querySelectorAll('iframe').forEach((frame) => frame.remove())
})

describe('pestaña del PDF', () => {
  it('mientras se prepara muestra la carga con el logo, su título y el ícono', () => {
    const tab = fakeTab()
    expect(pdfTab('Proforma N° 0003', 'Preparando la proforma N° 0003…')).toBe(tab)
    const page = within(tab.document.body)
    expect(tab.document.title).toBe('Proforma N° 0003')
    expect(tab.document.documentElement.lang).toBe('es')
    expect(page.getByRole('status')).toHaveTextContent('Preparando la proforma N° 0003…')
    expect(page.getByRole('img', { name: 'Ventronix' }).getAttribute('src')).toMatch(
      /\/brand\/ventronix-logo-proforma\.jpg$/,
    )
    expect(tab.document.querySelector('link[rel="icon"]')?.getAttribute('href')).toMatch(
      /\/favicon\.ico$/,
    )
  })

  it('si tarda más de lo normal, lo dice', () => {
    vi.useFakeTimers()
    const tab = fakeTab()
    pdfTab('Proforma N° 0003', 'Preparando la proforma N° 0003…')
    const page = within(tab.document.body)
    expect(page.queryByText('Está tardando más de lo normal…')).not.toBeInTheDocument()
    vi.advanceTimersByTime(SLOW_MS)
    expect(page.getByText('Está tardando más de lo normal…')).toBeInTheDocument()
  })

  it('si no se puede escribir en la pestaña, igual la devuelve para mostrar el PDF', () => {
    const tab = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    expect(pdfTab('Proforma N° 0003', 'Preparando la proforma N° 0003…')).toBe(tab)
  })

  it('si la persona cerró la pestaña de carga, no la vuelve a abrir ni falla', () => {
    URL.createObjectURL = vi.fn(() => 'blob:proforma')
    URL.revokeObjectURL = vi.fn()
    const tab = fakeTab(true)
    const file = new File(['%PDF'], 'Proforma-0003.pdf', { type: 'application/pdf' })
    expect(openFile(file, tab as unknown as Window)).toBe(true)
    expect(tab.location.href).toBe('')
  })
})
