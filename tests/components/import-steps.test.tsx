import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DownloadStep,
  TemplateGuide,
  UploadStep,
} from '@/features/catalog/import/components/import-steps'
import { FILE_MESSAGES, IMPORT_MAX_BYTES } from '@/features/catalog/import/options'

const actions = vi.hoisted(() => ({ downloadImportTemplate: vi.fn(), exportProducts: vi.fn() }))
vi.mock('@/features/catalog/products/excel-actions', () => actions)

const excel = (fileName: string, extra: object = {}) => ({
  ok: true,
  data: { base64: btoa('xlsx'), fileName, ...extra },
})

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:excel')
  URL.revokeObjectURL = vi.fn()
})
// Cada prueba prepara sus respuestas: ninguna pasa a la siguiente.
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

function renderDownload(intent: 'create' | 'update') {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  render(
    <>
      <DownloadStep intent={intent} />
      <Toaster />
    </>,
  )
  return { click, user: userEvent.setup() }
}

describe('Paso 1: descarga el archivo', () => {
  it('para cargar productos nuevos destaca la plantilla y la descarga', async () => {
    actions.downloadImportTemplate.mockResolvedValue(excel('plantilla-carga-masiva.xlsx'))
    const { click, user } = renderDownload('create')
    expect(
      screen.getByText(/Tiene las columnas listas, tus categorías en un desplegable/),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Descargar plantilla' }))
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(
      'plantilla-carga-masiva.xlsx',
    )
    expect(await screen.findByText('Plantilla descargada')).toBeVisible()
  })

  it('para actualizar descarga todo el catálogo, sin filtros', async () => {
    actions.exportProducts.mockResolvedValue(
      excel('productos-2026-10-03.xlsx', { count: 52, truncated: false }),
    )
    const { user } = renderDownload('update')
    expect(screen.getByText(/Lo que no cambies se queda igual/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Descargar mi catálogo' }))
    expect(actions.exportProducts).toHaveBeenCalledWith(
      {
        search: '',
        category: null,
        dateBy: 'created',
        date: null,
        from: null,
        to: null,
        sort: 'name',
      },
      'report',
    )
    expect(await screen.findByText('Catálogo descargado · 52 productos')).toBeVisible()
  })

  it('con el catálogo vacío sugiere la plantilla, y avisa si pasa del límite de la carga', async () => {
    actions.exportProducts.mockResolvedValueOnce({
      ok: false,
      error: { code: 'VALIDATION', message: 'No hay productos para descargar con estos filtros.' },
    })
    const { user } = renderDownload('update')
    await user.click(screen.getByRole('button', { name: 'Descargar mi catálogo' }))
    expect(
      await screen.findByText('Tu catálogo todavía no tiene productos. Empieza con la plantilla.'),
    ).toBeVisible()

    actions.exportProducts.mockResolvedValueOnce(
      excel('productos.xlsx', { count: 6200, truncated: false }),
    )
    await user.click(screen.getByRole('button', { name: 'Descargar mi catálogo' }))
    expect(
      await screen.findByText(
        'Tu catálogo tiene 6 200 productos y cada carga acepta hasta 5 000: divide el archivo antes de subirlo.',
      ),
    ).toBeVisible()
  })
})

describe('Paso 2: la guía de la plantilla', () => {
  it('muestra la maqueta, las reglas de cada columna y los consejos', async () => {
    render(<TemplateGuide intent="create" />)
    expect(
      screen.getByRole('table', { name: 'Ejemplo de la hoja Productos de la plantilla' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Precio con IGV (S/)' })).toBeVisible()
    expect(screen.getByText('LAP-001')).toBeVisible()
    expect(screen.getByText(/Siempre obligatorio/)).toBeVisible()
    expect(screen.getByText('Puedes dejar filas vacías: se ignoran.')).toBeVisible()

    const code = screen.getByRole('button', { name: 'Código' })
    expect(code).toHaveAccessibleDescription(/Siempre obligatorio y único, hasta 64 caracteres/)
    await userEvent.setup().click(code)
    expect(screen.getByText(/Siempre obligatorio/).closest('li')).toHaveAttribute('data-active')
  })
})

describe('Paso 3: la zona de carga', () => {
  function renderUpload(props: Partial<Parameters<typeof UploadStep>[0]> = {}) {
    const onFile = vi.fn()
    render(
      <UploadStep
        file={null}
        status={null}
        error={null}
        disabled={false}
        onFile={onFile}
        {...props}
      />,
    )
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    return { onFile, input }
  }

  it('acepta un .xlsx elegido o soltado', () => {
    const { onFile, input } = renderUpload()
    expect(
      screen.getByRole('button', { name: /Arrastra tu Excel aquí o elige un archivo/ }),
    ).toHaveTextContent('Solo .xlsx · hasta 4 MB · hasta 5 000 productos')
    const file = new File(['x'], 'productos.xlsx')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)

    const zone = screen.getByRole('button', { name: /Arrastra tu Excel/ })
    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ['Files'] } })
    expect(zone).toHaveAttribute('data-dragging')
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })
    expect(onFile).toHaveBeenCalledTimes(2)
    expect(zone).not.toHaveAttribute('data-dragging')
  })

  it('rechaza en el navegador lo que no es .xlsx o pesa demasiado, con el mensaje de la spec', () => {
    const { onFile, input } = renderUpload()
    fireEvent.change(input, { target: { files: [new File(['x'], 'productos.csv')] } })
    expect(screen.getByRole('alert')).toHaveTextContent(FILE_MESSAGES.notXlsx)
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], 'grande.xlsx')] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(FILE_MESSAGES.tooBig)
    expect(onFile).not.toHaveBeenCalled()
  })

  it('con el archivo elegido muestra su chip y la espera; un error devuelve la zona', () => {
    const file = new File([new Uint8Array(350_000)], 'Productos.xlsx')
    const { rerender } = render(
      <UploadStep file={file} status="Leyendo tu Excel…" error={null} disabled onFile={vi.fn()} />,
    )
    expect(screen.getByText('Productos.xlsx')).toBeVisible()
    expect(screen.getByText('342 KB')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cambiar archivo' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Leyendo tu Excel…')

    rerender(
      <UploadStep
        file={null}
        status={null}
        error={FILE_MESSAGES.noCode}
        disabled={false}
        onFile={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(FILE_MESSAGES.noCode)
    expect(screen.getByRole('button', { name: /Arrastra tu Excel/ })).toBeEnabled()
  })
})
