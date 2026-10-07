import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing'
import { describe, expect, it, vi } from 'vitest'
import { HistoryFilters } from '@/features/proforma/history/components/history-filters'
import { HistoryResults } from '@/features/proforma/history/components/history-results'
import type { HistoryPage, ProformaRow } from '@/features/proforma/history/queries'

const row = (number: number, overrides: Partial<ProformaRow> = {}): ProformaRow => ({
  id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
  number,
  issued_at: '2026-10-02T15:00:00.000Z',
  valid_until: '2026-10-09',
  client_name: 'Inversiones Nuevo Sol S.A.C.',
  client_document: '20601234567',
  client_phone: '987654321',
  item_count: 3,
  total: '7960.00',
  ...overrides,
})

const page = (overrides: Partial<HistoryPage> = {}): HistoryPage => ({
  items: [row(42), row(41, { client_name: 'José Pérez', client_document: '', total: '350.00' })],
  total: 22,
  sum: '152300.50',
  all: 48,
  thisMonth: 12,
  ...overrides,
})

function renderResults(data = page(), today = '2026-10-06', updating = false) {
  const handlers = {
    onPage: vi.fn(),
    onClear: vi.fn(),
    onNew: vi.fn(),
    onView: vi.fn(),
    onDownload: vi.fn(),
    onClient: vi.fn(),
    onResend: vi.fn(),
  }
  render(
    <HistoryResults
      page={2}
      data={data}
      today={today}
      updating={updating}
      pendingId={null}
      {...handlers}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('HistoryResults', () => {
  it('«Reenviar» abre la ventana de esa proforma', async () => {
    const { onResend, user } = renderResults()
    const table = within(screen.getByRole('table'))
    await user.click(table.getByRole('button', { name: 'Reenviar la proforma N° 0042' }))
    expect(onResend).toHaveBeenCalledWith(expect.objectContaining({ number: 42 }))
  })

  it('muestra cada proforma, la suma del periodo y qué filas se ven', () => {
    renderResults()
    const table = within(screen.getByRole('table', { name: 'Proformas guardadas' }))
    const [first, second] = table.getAllByRole('row').slice(1)
    for (const text of [
      '0042',
      '02/10/2026',
      'Inversiones Nuevo Sol S.A.C.',
      '20601234567',
      'S/ 7,960.00',
      '09/10/2026',
    ]) {
      expect(first).toHaveTextContent(text)
    }
    expect(second).toHaveTextContent('—')
    expect(screen.getByText('22 proformas')).toBeVisible()
    expect(screen.getByText('S/ 152,300.50')).toBeVisible()
    expect(screen.getByText('Proformas 21–22 de 22')).toBeVisible()
  })

  it('cambia de página y abre o descarga el PDF de una fila', async () => {
    const { onPage, onView, onDownload, user } = renderResults()
    await user.click(screen.getByRole('button', { name: 'Página 1' }))
    expect(onPage).toHaveBeenCalledWith(1)
    const table = within(screen.getByRole('table'))
    await user.click(table.getByRole('button', { name: 'Ver PDF de la proforma N° 0042' }))
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ number: 42 }))
    await user.click(table.getByRole('button', { name: 'Descargar PDF de la proforma N° 0041' }))
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ number: 41 }))
  })

  it('las tarjetas (tablet y laptop pequeño) también abren el PDF', async () => {
    const { onView, user } = renderResults()
    const cards = within(screen.getByRole('list'))
    await user.click(cards.getByRole('button', { name: 'Ver PDF de la proforma N° 0042' }))
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ number: 42 }))
  })

  it('marca «Vencida» la que ya pasó su validez, en días de Lima', () => {
    renderResults(page(), '2026-10-10')
    const [first] = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(first).toHaveTextContent('Vencida')
  })

  it('el último día de validez todavía no está vencida', () => {
    renderResults(page(), '2026-10-09')
    expect(screen.queryByText('Vencida')).not.toBeInTheDocument()
  })

  it('el nombre del cliente muestra todas sus proformas', async () => {
    const { onClient, user } = renderResults()
    const table = within(screen.getByRole('table'))
    await user.click(
      table.getByRole('button', { name: 'Ver las proformas de Inversiones Nuevo Sol S.A.C.' }),
    )
    expect(onClient).toHaveBeenCalledWith(expect.objectContaining({ number: 42 }))
  })

  it('mientras llega otra página o búsqueda, la actual se atenúa sin vaciarse', () => {
    renderResults(page(), '2026-10-06', true)
    expect(screen.getByRole('table').parentElement).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('table')).toHaveTextContent('0042')
  })

  it('sin proformas invita a crear la primera', async () => {
    const { onNew, user } = renderResults(page({ items: [], total: 0, all: 0, sum: '0' }))
    expect(screen.getByText('Todavía no hay proformas guardadas')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Nueva proforma' }))
    expect(onNew).toHaveBeenCalled()
  })

  it('sin resultados ofrece limpiar los filtros', async () => {
    const { onClear, user } = renderResults(page({ items: [], total: 0, sum: '0' }))
    expect(screen.getByText('Ninguna proforma coincide con la búsqueda')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(onClear).toHaveBeenCalled()
  })
})

describe('HistoryFilters', () => {
  it('la búsqueda y las fechas van a la URL y vuelven a la página 1', async () => {
    const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>()
    render(
      <NuqsTestingAdapter searchParams="?page=3" onUrlUpdate={onUrlUpdate} hasMemory>
        <HistoryFilters />
      </NuqsTestingAdapter>,
    )
    const last = () => onUrlUpdate.mock.lastCall![0].searchParams
    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText('Buscar por cliente, RUC, DNI, celular o N° de proforma'),
      'perez',
    )
    expect(last().get('search')).toBe('perez')
    expect(last().has('page')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Filtrar por fecha' }))
    await user.click(screen.getByRole('radio', { name: 'Este mes' }))
    expect(last().get('date')).toBe('month')
    await user.click(screen.getByRole('button', { name: /Limpiar/ }))
    expect(last().toString()).toBe('')
  })
})
