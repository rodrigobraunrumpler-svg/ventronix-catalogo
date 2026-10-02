import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportScreen } from '@/features/catalog/import/components/import-screen'
import { FILE_MESSAGES } from '@/features/catalog/import/options'
import type { ImportOutcome, ImportPreview, PreviewRow } from '@/features/catalog/import/types'
import type { ActionResult } from '@/lib/action-result'

const actions = vi.hoisted(() => ({
  downloadImportTemplate: vi.fn(),
  exportProducts: vi.fn(),
  previewProductImport: vi.fn(),
  importProducts: vi.fn(),
  downloadImportSimulation: vi.fn(),
  downloadImportErrors: vi.fn(),
}))
vi.mock('@/features/catalog/products/excel-actions', () => actions)

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

const PREVIEW: ImportPreview = {
  fileName: 'productos.xlsx',
  sheetName: 'Productos',
  columns: ['code', 'name', 'description', 'category', 'price'],
  partialNotice: null,
  ignoredNotice: null,
  rows: [
    row(2),
    row(3, {
      status: 'update',
      action: 'update',
      changes: [{ field: 'price', before: '1200.00', after: '1350.00' }],
    }),
    row(4, { category: 'Laptps' }),
    row(5, {
      status: 'error',
      action: null,
      errors: ['Precio: está vacío. Escríbelo o quita la columna del archivo.'],
    }),
  ],
  counts: { create: 2, update: 1, unchanged: 0, review: 0, error: 1, omitted: 0 },
  prices: { up: 1, down: 0, upAverage: 0.125, downAverage: null },
  choices: [
    {
      key: 'laptps',
      name: 'Laptps',
      kind: 'similar',
      suggestion: 'Laptops',
      decision: null,
      products: 1,
    },
  ],
  bars: [{ name: 'Laptops', products: 3, tag: null }],
  undecided: 1,
  importable: 3,
  updates: 1,
}

const DECIDED: ImportPreview = {
  ...PREVIEW,
  choices: [{ ...PREVIEW.choices[0], decision: { action: 'use', target: 'Laptops' } }],
  undecided: 0,
}

const OUTCOME: ImportOutcome = {
  created: 2,
  updated: 1,
  unchanged: 0,
  skipped: 0,
  errors: 1,
  categoriesCreated: [],
  receipt: { base64: btoa('xlsx'), fileName: 'comprobante-importacion-2026-10-03-1015.xlsx' },
}

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function renderScreen() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <ImportScreen hasProducts />
      <Toaster />
    </QueryClientProvider>,
  )
  return { invalidate, user: userEvent.setup() }
}

const choose = (file = new File(['x'], 'productos.xlsx')) =>
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

const sentOptions = (call: number) =>
  JSON.parse(String((actions.previewProductImport.mock.calls[call][0] as FormData).get('options')))

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:excel')
  URL.revokeObjectURL = vi.fn()
})
// Cada prueba prepara sus respuestas: ninguna pasa a la siguiente.
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('ImportScreen: recorrido completo', () => {
  it('lee, revisa, decide, confirma, importa y entrega el comprobante', async () => {
    const reading = deferred<ActionResult<ImportPreview>>()
    actions.previewProductImport.mockReturnValueOnce(reading.promise)
    const { invalidate, user } = renderScreen()

    choose()
    expect(screen.getByRole('status')).toHaveTextContent('Leyendo tu Excel…')
    expect(screen.getByText('productos.xlsx')).toBeVisible()
    await act(async () => reading.resolve(ok(PREVIEW)))

    const heading = screen.getByRole('heading', { name: 'Esto es lo que va a pasar' })
    expect(heading).toHaveFocus()
    expect(screen.getByRole('tab', { name: /Con errores/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Importar 3 productos' })).toBeDisabled()

    // Decidir la categoría parecida vuelve a pedir la vista previa con la decisión.
    actions.previewProductImport.mockResolvedValueOnce(ok(DECIDED))
    await user.click(screen.getByRole('button', { name: 'Usar "Laptops"' }))
    expect(sentOptions(1).categoryMap).toEqual({ laptps: { action: 'use', target: 'Laptops' } })
    const importButton = screen.getByRole('button', { name: 'Importar 3 productos' })
    await vi.waitFor(() => expect(importButton).toBeEnabled())

    // Hay un producto existente que cambia: se confirma antes.
    actions.importProducts.mockResolvedValueOnce(ok(OUTCOME))
    await user.click(importButton)
    const dialog = screen.getByRole('alertdialog', { name: '¿Actualizar 1 producto existente?' })
    await user.click(within(dialog).getByRole('button', { name: 'Importar' }))

    const done = await screen.findByRole('heading', {
      name: '¡Listo! Tu catálogo está actualizado',
    })
    expect(done).toHaveFocus()
    expect(screen.getByText('2 productos creados · 1 actualizado')).toBeVisible()
    expect(screen.getByText('1 fila no se importó.')).toBeVisible()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['catalog'] })
    expect(screen.getByRole('link', { name: 'Ver productos' })).toHaveAttribute(
      'href',
      '/products?dateBy=updated&date=today&sort=updated',
    )

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Descargar comprobante' }))
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(OUTCOME.receipt.fileName)
    expect(actions.importProducts).toHaveBeenCalledOnce()
  })

  it('al cambiar una opción recalcula la vista previa y lo anuncia', async () => {
    actions.previewProductImport.mockResolvedValueOnce(ok(DECIDED))
    const { user } = renderScreen()
    choose()
    await screen.findByRole('heading', { name: 'Esto es lo que va a pasar' })

    const refresh = deferred<ActionResult<ImportPreview>>()
    actions.previewProductImport.mockReturnValueOnce(refresh.promise)
    await user.click(screen.getByRole('radio', { name: 'No incluyen IGV: sumar 18 %' }))
    expect(sentOptions(1)).toMatchObject({ pricesIncludeTax: false, mode: 'all' })
    expect(screen.getByRole('status')).toHaveTextContent('Revisando 4 filas…')
    expect(screen.getByRole('button', { name: 'Importar 3 productos' })).toBeDisabled()
    await act(async () => refresh.resolve(ok(DECIDED)))
    expect(screen.getByRole('button', { name: 'Importar 3 productos' })).toBeEnabled()
  })

  it('un archivo que no sirve muestra su mensaje y deja elegir otro', async () => {
    actions.previewProductImport.mockResolvedValueOnce({
      ok: false,
      error: { code: 'VALIDATION', message: FILE_MESSAGES.noCode },
    })
    renderScreen()
    choose()
    expect(await screen.findByRole('alert')).toHaveTextContent(FILE_MESSAGES.noCode)
    expect(screen.getByRole('button', { name: /Arrastra tu Excel/ })).toBeEnabled()
  })

  it('si la base falla no se guarda nada; si se corta la red, revisa cómo quedó el catálogo', async () => {
    actions.previewProductImport.mockResolvedValue(ok({ ...DECIDED, updates: 0 }))
    actions.importProducts.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'UNEXPECTED',
        message: 'No se pudo completar la operación. Inténtalo de nuevo.',
      },
    })
    const { user } = renderScreen()
    choose()
    const importButton = await screen.findByRole('button', { name: 'Importar 3 productos' })
    await user.click(importButton)
    expect(
      await screen.findByText(
        'No se importó nada. Revisa tu conexión e inténtalo de nuevo; tu archivo sigue seleccionado.',
      ),
    ).toBeVisible()
    await vi.waitFor(() => expect(importButton).toBeEnabled())
    expect(actions.previewProductImport).toHaveBeenCalledOnce()

    actions.importProducts.mockRejectedValueOnce(new Error('red caída'))
    await user.click(importButton)
    expect(
      await screen.findByText(
        'Se cortó la conexión durante la importación. Revisamos tu archivo otra vez: la vista previa muestra cómo quedó tu catálogo.',
      ),
    ).toBeVisible()
    await vi.waitFor(() => expect(actions.previewProductImport).toHaveBeenCalledTimes(2))
  })

  it('cada archivo nuevo empieza con las opciones por defecto', async () => {
    actions.previewProductImport.mockResolvedValue(ok(DECIDED))
    const { user } = renderScreen()
    choose()
    await user.click(await screen.findByRole('radio', { name: 'No incluyen IGV: sumar 18 %' }))
    expect(sentOptions(1)).toMatchObject({ pricesIncludeTax: false })
    const another = screen.getByRole('button', { name: 'Elegir otro archivo' })
    await vi.waitFor(() => expect(another).toBeEnabled())
    await user.click(another)
    choose(new File(['y'], 'comprobante.xlsx'))
    await screen.findByRole('heading', { name: 'Esto es lo que va a pasar' })
    expect(sentOptions(2)).toEqual({ pricesIncludeTax: true, mode: 'all', categoryMap: {} })
  })

  it('«Elegir otro archivo» vuelve a la zona de carga con el foco en ella', async () => {
    actions.previewProductImport.mockResolvedValueOnce(ok(DECIDED))
    const { user } = renderScreen()
    choose()
    await user.click(await screen.findByRole('button', { name: 'Elegir otro archivo' }))
    expect(screen.getByRole('button', { name: /Arrastra tu Excel/ })).toHaveFocus()
    expect(
      screen.queryByRole('heading', { name: 'Esto es lo que va a pasar' }),
    ).not.toBeInTheDocument()
  })
})
