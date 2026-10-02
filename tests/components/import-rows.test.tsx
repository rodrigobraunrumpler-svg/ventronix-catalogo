import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  ErrorsNotice,
  ImportActionBar,
  ReviewNotice,
} from '@/features/catalog/import/components/import-action-bar'
import { PreviewRows } from '@/features/catalog/import/components/preview-rows'
import type { RowTab } from '@/features/catalog/import/format'
import type { ImportPreview, PreviewCounts, PreviewRow } from '@/features/catalog/import/types'

const row = (line: number, overrides: Partial<PreviewRow> = {}): PreviewRow => ({
  line,
  status: 'create',
  action: 'create',
  code: `P-${line}`,
  name: `Producto ${line}`,
  category: 'Laptops',
  price: '100.00',
  priceBeforeTax: null,
  changes: [],
  warnings: [],
  errors: [],
  ...overrides,
})

function countsOf(rows: PreviewRow[]): PreviewCounts {
  const counts: PreviewCounts = {
    create: 0,
    update: 0,
    unchanged: 0,
    review: 0,
    error: 0,
    omitted: 0,
  }
  for (const item of rows) counts[item.status] += 1
  return counts
}

function Rows({ rows, initial = 'all' }: { rows: PreviewRow[]; initial?: RowTab }) {
  const [tab, setTab] = useState<RowTab>(initial)
  return <PreviewRows rows={rows} counts={countsOf(rows)} mode="all" tab={tab} onTab={setTab} />
}

describe('PreviewRows', () => {
  const mixed = [
    row(2),
    row(3, {
      status: 'update',
      action: 'update',
      changes: [{ field: 'price', before: '1200.00', after: '1350.00' }],
    }),
    row(4, {
      status: 'review',
      action: 'update',
      warnings: ['El precio baja un 90 %. ¿Es correcto?'],
      changes: [{ field: 'price', before: '1000.00', after: '100.00' }],
    }),
    row(5, {
      status: 'error',
      action: null,
      price: null,
      errors: ['Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50.'],
    }),
  ]

  it('muestra cada estado con texto, su detalle y la cifra de cada pestaña', async () => {
    render(<Rows rows={mixed} />)
    expect(screen.getByRole('tab', { name: /Todas\s*4/ })).toHaveAttribute('aria-selected', 'true')
    const table = within(screen.getByRole('table', { name: /Todas: Filas 1–4 de 4/ }))
    expect(table.getByText('Precio: S/ 1,200.00 → S/ 1,350.00 (+12.5 %)')).toBeVisible()
    expect(table.getByText('El precio baja un 90 %. ¿Es correcto?')).toBeVisible()
    expect(table.getAllByText('Con errores')).toHaveLength(1)

    await userEvent.setup().click(screen.getByRole('tab', { name: /Con errores\s*1/ }))
    const errors = within(screen.getByRole('table'))
    expect(errors.getAllByRole('row')).toHaveLength(2)
    expect(errors.getByText(/Precio: escribe solo números/)).toBeVisible()
  })

  it('en móvil cada fila es una tarjeta con la misma información', () => {
    render(<Rows rows={mixed} />)
    const cards = within(screen.getByRole('list', { name: /Todas: Filas 1–4 de 4/ }))
    expect(cards.getAllByText(/^Fila \d+$/)).toHaveLength(4)
    expect(cards.getByText('Precio: S/ 1,200.00 → S/ 1,350.00 (+12.5 %)')).toBeVisible()
  })

  it('busca por código o nombre y pagina de 50 en 50', async () => {
    const many = Array.from({ length: 120 }, (_, index) => row(index + 2))
    many[80] = row(82, { name: 'Impresión láser' })
    const user = userEvent.setup()
    render(<Rows rows={many} />)
    expect(screen.getByText('Filas 1–50 de 120')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getByText('Filas 51–100 de 120')).toBeVisible()

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }),
      'impresion',
    )
    expect(screen.getByText('Filas 1–1 de 1')).toBeVisible()
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'xyz')
    expect(screen.getByText('Ninguna fila coincide con «xyz».')).toBeVisible()
  })
})

const preview = (overrides: Partial<ImportPreview> = {}): ImportPreview => ({
  fileName: 'productos.xlsx',
  sheetName: 'Productos',
  columns: ['code', 'name', 'description', 'category', 'price'],
  partialNotice: null,
  ignoredNotice: null,
  rows: [],
  counts: { create: 48, update: 12, unchanged: 5, review: 0, error: 3, omitted: 0 },
  prices: { up: 12, down: 0, upAverage: 0.05, downAverage: null },
  choices: [],
  bars: [],
  undecided: 0,
  importable: 60,
  updates: 12,
  ...overrides,
})

function renderBar(props: Partial<Parameters<typeof ImportActionBar>[0]> = {}) {
  const handlers = { onChooseAnother: vi.fn(), onDownload: vi.fn(), onImport: vi.fn() }
  render(
    <ImportActionBar
      preview={preview()}
      importing={false}
      refreshing={false}
      downloading={null}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('ImportActionBar', () => {
  it('pide confirmación antes de actualizar productos existentes', async () => {
    const { onImport, user } = renderBar()
    expect(screen.getByRole('region', { name: 'Importación' })).toHaveTextContent(
      '48 nuevos · 12 se actualizan',
    )
    await user.click(screen.getByRole('button', { name: 'Importar 60 productos' }))
    const dialog = screen.getByRole('alertdialog', { name: '¿Actualizar 12 productos existentes?' })
    expect(dialog).toHaveTextContent('Al terminar podrás descargar un comprobante para revertirlo.')
    await user.click(within(dialog).getByRole('button', { name: 'Importar' }))
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('solo con productos nuevos importa sin preguntar', async () => {
    const { onImport, user } = renderBar({
      preview: preview({
        updates: 0,
        counts: { create: 3, update: 0, unchanged: 0, review: 0, error: 0, omitted: 0 },
        importable: 3,
      }),
    })
    await user.click(screen.getByRole('button', { name: 'Importar 3 productos' }))
    expect(onImport).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('explica por qué no se puede importar y bloquea todo mientras importa', () => {
    const { rerender } = render(
      <ImportActionBar
        preview={preview({ undecided: 2 })}
        importing={false}
        refreshing={false}
        downloading={null}
        onChooseAnother={vi.fn()}
        onDownload={vi.fn()}
        onImport={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Importar 60 productos' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Decide 2 categorías antes de importar.')

    rerender(
      <ImportActionBar
        preview={preview()}
        importing
        refreshing={false}
        downloading={null}
        onChooseAnother={vi.fn()}
        onDownload={vi.fn()}
        onImport={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Importando 60 productos…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Elegir otro archivo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descargar simulación' })).toBeDisabled()
  })

  it('el aviso de errores descarga las filas aparte', async () => {
    const onDownload = vi.fn()
    render(<ErrorsNotice errors={3} downloading={null} onDownload={onDownload} />)
    expect(
      screen.getByText(
        '3 filas con errores no se importarán. Corrígelas y vuelve a subir el archivo, o descárgalas aparte.',
      ),
    ).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Descargar filas con errores' }))
    expect(onDownload).toHaveBeenCalledWith('errors')
  })

  it('las filas para revisar se importan igual, y dice cómo corregirlas', () => {
    render(<ReviewNotice reviews={2} />)
    expect(
      screen.getByText(
        '2 filas para revisar se importarán igual. Si alguna no es correcta, corrígela en el Excel y vuelve a subir el archivo.',
      ),
    ).toBeVisible()
  })
})
