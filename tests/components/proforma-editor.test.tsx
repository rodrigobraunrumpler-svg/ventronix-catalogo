import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import {
  ProformaEditor,
  type ProformaEditorProps,
} from '@/features/proforma/components/proforma-editor'
import type { ProductListItem } from '@/features/catalog/types'
import type { DocumentInput, GeneratedDocument } from '@/features/proforma/document/input'
import { EMPTY_DRAFT } from '@/features/proforma/draft'
import type { RucLookupResult } from '@/features/proforma/ruc'
import { ProformaProvider } from '@/features/proforma/store'
import type { ActionResult } from '@/lib/action-result'
import { completeCompany, e1Lines, freeLine, line, seedProforma } from '../support/proforma'

type Lookup = (ruc: string) => Promise<RucLookupResult>
type Generate = (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>
type Search = (term: string, signal?: AbortSignal) => Promise<ProductListItem[]>

function renderEditor(overrides: Partial<ProformaEditorProps> = {}) {
  const props: ProformaEditorProps = {
    company: { status: 'ready', profile: completeCompany },
    prices: undefined,
    lookupRuc: vi.fn<Lookup>(async () => ({ kind: 'not-found' })),
    onContinue: vi.fn(),
    onGenerate: vi.fn(),
    generatePdf: vi.fn<Generate>(async () => ({
      ok: true,
      data: { fileName: 'Proforma-borrador.pdf', base64: btoa('%PDF') },
    })),
    searchProducts: vi.fn<Search>(async () => []),
    ...overrides,
  }
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProformaProvider>
        <ProformaEditor {...props} />
        <Toaster />
      </ProformaProvider>
    </QueryClientProvider>,
  )
  return { ...props, user: userEvent.setup() }
}

const generate = () => screen.getByRole('button', { name: 'Generar proforma' })
const price = (name: string) => screen.getByLabelText(`Precio unitario de ${name}`)
const withClient = { ...EMPTY_DRAFT.client, name: 'Cliente de prueba' }
const found = (legalName: string, status = 'ACTIVO', condition = 'HABIDO'): RucLookupResult => ({
  kind: 'found',
  company: {
    ruc: '20000000001',
    legalName,
    address: 'AV. PRUEBA 123, HUAMANGA',
    status,
    condition,
  },
})

describe('ProformaEditor', () => {
  it('sin lista a la que volver no ofrece «Seguir eligiendo productos»', () => {
    seedProforma({ lines: [line()] })
    renderEditor({ onContinue: undefined })
    expect(
      screen.queryByRole('button', { name: 'Seguir eligiendo productos' }),
    ).not.toBeInTheDocument()
  })

  it('calcula el resumen con el IGV incluido (ejemplo E1)', () => {
    seedProforma({ lines: e1Lines, discountPercent: '5', shipping: '20' })
    renderEditor()
    const summary = within(screen.getByRole('region', { name: 'Resumen' }))
    expect(summary.getByText('S/ 8,520.00')).toBeVisible()
    expect(summary.getByText('− S/ 426.00')).toBeVisible()
    expect(summary.getByText('S/ 8,094.00')).toBeVisible()
    expect(summary.getByText('S/ 8,114.00')).toBeVisible()
    expect(summary.getByText('Precios incluyen IGV')).toBeVisible()
    expect(summary.getByText('S/ 6,876.27')).toBeVisible()
    expect(summary.getByText('S/ 1,237.73')).toBeVisible()
    expect(screen.getByText('S/ 5,180.00')).toBeVisible()
  })

  it('«Generar» pide el nombre del cliente y se habilita al escribirlo', async () => {
    seedProforma({ lines: [line()] })
    const { onGenerate, user } = renderEditor()
    expect(generate()).toBeDisabled()
    expect(screen.getByText('Completa los datos del cliente.')).toBeVisible()
    await user.type(screen.getByLabelText('Razón social o nombre'), 'Cliente de prueba')
    expect(generate()).toBeEnabled()
    await user.click(generate())
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('un precio no válido se marca y bloquea «Generar»', async () => {
    seedProforma({ lines: [line()], client: withClient })
    const { user } = renderEditor()
    await user.clear(price('Laptop de 14 pulgadas'))
    await user.type(price('Laptop de 14 pulgadas'), '12.345')
    expect(price('Laptop de 14 pulgadas')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Revisa las cantidades y los precios.')).toBeVisible()
    expect(generate()).toBeDisabled()
  })

  it('con otro precio muestra el del catálogo y «Restaurar» lo recupera', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor()
    await user.clear(price('Laptop de 14 pulgadas'))
    await user.type(price('Laptop de 14 pulgadas'), '2400')
    expect(screen.getByText(/Catálogo S\/ 2,590\.00/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Restaurar' }))
    expect(price('Laptop de 14 pulgadas')).toHaveValue('2590.00')
  })

  it('avisa si el precio del catálogo cambió y «Actualizar» lo aplica', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor({ prices: new Map([[line().id, '2490.00']]) })
    expect(screen.getByText(/El precio del catálogo cambió a S\/ 2,490\.00/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(price('Laptop de 14 pulgadas')).toHaveValue('2490.00')
    expect(screen.queryByText(/El precio del catálogo cambió/)).not.toBeInTheDocument()
  })

  it('avisa si el producto ya no está en el catálogo', () => {
    seedProforma({ lines: [line()] })
    renderEditor({ prices: new Map() })
    expect(screen.getByText(/Ya no está en el catálogo/)).toBeVisible()
  })

  it('quitar una línea se puede deshacer', async () => {
    seedProforma({ lines: e1Lines })
    const { user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Quitar Impresora láser' }))
    expect(screen.queryByLabelText('Precio unitario de Impresora láser')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(price('Impresora láser')).toHaveValue('850')
  })

  it('con 11 dígitos consulta el RUC una vez y completa razón social y dirección', async () => {
    seedProforma({ lines: [line()] })
    const lookupRuc = vi.fn<Lookup>(async () => found('EMPRESA DE PRUEBA S.A.C.'))
    const { user } = renderEditor({ lookupRuc })
    await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
    expect(await screen.findByDisplayValue('EMPRESA DE PRUEBA S.A.C.')).toBeVisible()
    expect(lookupRuc).toHaveBeenCalledTimes(1)
    expect(lookupRuc).toHaveBeenCalledWith('20000000001')
    await user.click(screen.getByRole('button', { name: /Más datos/ }))
    expect(screen.getByLabelText('Dirección')).toHaveValue('AV. PRUEBA 123, HUAMANGA')
  })

  it('avisa sin bloquear si SUNAT no lo tiene activo y habido', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor({
      lookupRuc: vi.fn<Lookup>(async () =>
        found('EMPRESA INACTIVA S.R.L.', 'BAJA DE OFICIO', 'NO HABIDO'),
      ),
    })
    await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
    expect(
      await screen.findByText(/SUNAT lo registra como BAJA DE OFICIO · NO HABIDO/),
    ).toBeVisible()
    expect(generate()).toBeEnabled()
  })

  it('si SUNAT no responde, deja escribir a mano', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor({
      lookupRuc: vi.fn<Lookup>(async () => ({ kind: 'unavailable' })),
    })
    await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
    expect(await screen.findByText(/No pudimos consultar SUNAT/)).toBeVisible()
    await user.type(screen.getByLabelText('Razón social o nombre'), 'Cliente escrito a mano')
    expect(generate()).toBeEnabled()
  })

  it('una respuesta tardía de SUNAT no pisa un documento que ya cambió', async () => {
    seedProforma({ lines: [line()] })
    let answer: (result: RucLookupResult) => void = () => {}
    const lookupRuc = vi.fn<Lookup>(
      () => new Promise<RucLookupResult>((resolve) => (answer = resolve)),
    )
    const { user } = renderEditor({ lookupRuc })
    const document = screen.getByLabelText('RUC o DNI')
    await user.type(document, '20000000001')
    await user.clear(document)
    await user.type(document, '12345678')
    await act(async () => answer(found('EMPRESA DE PRUEBA S.A.C.')))
    expect(screen.getByLabelText('Razón social o nombre')).toHaveValue('')
  })

  it('pasar por el nombre sin escribir no lo marca en rojo; borrarlo después, sí', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor()
    const name = screen.getByLabelText('Razón social o nombre')
    const error = 'Escribe la razón social o el nombre del cliente.'
    await user.click(name)
    await user.tab()
    expect(screen.queryByText(error)).not.toBeInTheDocument()
    await user.type(name, 'a')
    await user.clear(name)
    await user.tab()
    expect(screen.getByText(error)).toBeVisible()
  })

  it('un documento que no es DNI ni RUC se marca al salir del campo', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor()
    await user.type(screen.getByLabelText('RUC o DNI'), '123')
    await user.tab()
    expect(screen.getByText('Escribe 8 dígitos para DNI u 11 para RUC.')).toBeVisible()
  })

  it('«Más datos» resume la validez y se abre solo si tiene un error', () => {
    seedProforma({ lines: [line()], validityDays: '0' })
    renderEditor()
    const more = screen.getByRole('button', { name: /Más datos/ })
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('De 1 a 365 días.')).toBeVisible()
  })

  it('«vence el» cuenta los días de Lima, como el PDF', async () => {
    // 04:30 UTC del 2 de octubre = 23:30 del 1 de octubre en Lima: con 7 días, vence el 08/10.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-02T04:30:00Z') })
    try {
      seedProforma({ lines: [line()], validityDays: '7' })
      const { user } = renderEditor()
      await user.click(screen.getByRole('button', { name: /Más datos/ }))
      expect(screen.getByText(/vence el 08\/10/)).toBeVisible()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sin los datos obligatorios de la empresa, lo dice y enlaza a «Empresa»', () => {
    seedProforma({ lines: [line()], client: withClient })
    renderEditor({ company: { status: 'ready', profile: { ...completeCompany, ruc: null } } })
    expect(screen.getByText(/Completa los datos de tu empresa: RUC\./)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ir a Empresa' })).toHaveAttribute('href', '/company')
    expect(generate()).toBeDisabled()
  })

  it('«Generar» solo se describe con un motivo cuando lo hay', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor()
    expect(generate()).toHaveAccessibleDescription('Completa los datos del cliente.')
    await user.type(screen.getByLabelText('Razón social o nombre'), 'Cliente de prueba')
    expect(generate()).not.toHaveAttribute('aria-describedby')
  })

  it('«Seguir eligiendo productos» vuelve a la lista', async () => {
    seedProforma({ lines: [line()] })
    const { onContinue, user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Seguir eligiendo productos' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('«Vista previa» abre la pestaña al instante y luego muestra el borrador', async () => {
    seedProforma({ lines: [line()] })
    URL.createObjectURL = vi.fn(() => 'blob:borrador')
    URL.revokeObjectURL = vi.fn()
    const tab = { location: { href: '' }, close: vi.fn() } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(tab)
    let finish: (value: ActionResult<GeneratedDocument>) => void = () => {}
    const generatePdf = vi.fn<Generate>(
      () => new Promise<ActionResult<GeneratedDocument>>((resolve) => (finish = resolve)),
    )
    const { user } = renderEditor({ generatePdf })
    await user.click(screen.getByRole('button', { name: 'Vista previa' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(generatePdf).toHaveBeenCalledWith(expect.objectContaining({ draft: true }))
    await act(async () =>
      finish({ ok: true, data: { fileName: 'Proforma-borrador.pdf', base64: btoa('%PDF') } }),
    )
    expect(tab.location.href).toBe('blob:borrador')
    open.mockRestore()
  })

  it('«Vista previa» espera a que la validez de la oferta sea válida', () => {
    seedProforma({ lines: [line()], validityDays: '0' })
    renderEditor()
    expect(screen.getByRole('button', { name: 'Vista previa' })).toBeDisabled()
  })

  it('si el navegador bloquea la pestaña, descarga la vista previa y lo avisa', async () => {
    seedProforma({ lines: [line()] })
    URL.createObjectURL = vi.fn(() => 'blob:borrador')
    URL.revokeObjectURL = vi.fn()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Vista previa' }))
    expect(
      await screen.findByText('Tu navegador bloqueó la pestaña nueva: descargamos el PDF.'),
    ).toBeVisible()
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('Proforma-borrador.pdf')
    open.mockRestore()
    click.mockRestore()
  })

  describe('buscar y añadir sin salir de la proforma', () => {
    const product = (id: string, name: string, code: string, price: string): ProductListItem => ({
      id,
      code,
      name,
      description: null,
      category_id: 'laptops',
      category_name: 'Laptops',
      unit_price: price,
      created_at: '',
      updated_at: '',
    })
    const lenovo = product('p1', 'Lenovo ThinkPad E14', 'LAP-001', '3590.00')
    const hp = product('p2', 'HP ProBook 440', 'LAP-002', '3790.00')
    const search = () => screen.getByRole('combobox', { name: 'Añadir producto' })

    it('Enter añade el primer resultado y deja el buscador listo para el siguiente', async () => {
      seedProforma({})
      const searchProducts = vi.fn<Search>(async () => [lenovo, hp])
      const { user } = renderEditor({ searchProducts })
      await user.type(search(), 'laptop')
      expect(await screen.findByRole('option', { name: /Lenovo ThinkPad E14/ })).toBeVisible()
      await user.keyboard('{Enter}')
      expect(price('Lenovo ThinkPad E14')).toHaveValue('3590.00')
      expect(search()).toHaveValue('')
      expect(search()).toHaveFocus()
      expect(searchProducts).toHaveBeenCalledWith('laptop', expect.anything())
    })

    it('con las flechas se elige otro resultado, y un clic también lo añade', async () => {
      seedProforma({})
      const { user } = renderEditor({ searchProducts: vi.fn<Search>(async () => [lenovo, hp]) })
      await user.type(search(), 'laptop')
      await screen.findByRole('option', { name: /HP ProBook 440/ })
      await user.keyboard('{ArrowDown}{Enter}')
      expect(price('HP ProBook 440')).toHaveValue('3790.00')
      await user.type(search(), 'lenovo')
      await user.click(await screen.findByRole('option', { name: /Lenovo ThinkPad E14/ }))
      expect(price('Lenovo ThinkPad E14')).toHaveValue('3590.00')
    })

    it('si ya está en la proforma lo dice y suma una unidad', async () => {
      seedProforma({
        lines: [line({ productId: 'p1', code: 'LAP-001', name: 'Lenovo ThinkPad E14' })],
      })
      const { user } = renderEditor({ searchProducts: vi.fn<Search>(async () => [lenovo]) })
      await user.type(search(), 'lenovo')
      expect(await screen.findByRole('option', { name: /En la proforma: 1/ })).toBeVisible()
      await user.keyboard('{Enter}')
      expect(screen.getByLabelText('Cantidad de Lenovo ThinkPad E14')).toHaveValue('2')
    })

    it('sin resultados lo dice', async () => {
      seedProforma({})
      const { user } = renderEditor({ searchProducts: vi.fn<Search>(async () => []) })
      await user.type(search(), 'xyz')
      expect(await screen.findByText('No encontramos productos con «xyz».')).toBeVisible()
    })
  })

  describe('productos libres', () => {
    const freeForm = () => within(screen.getByRole('form', { name: 'Añadir producto libre' }))

    it('se añaden sin el catálogo, con su etiqueta, y el formulario queda listo para otro', async () => {
      seedProforma({ client: withClient })
      const { user } = renderEditor()
      await user.click(screen.getByRole('button', { name: 'Añadir producto libre' }))
      const form = freeForm()
      expect(
        form.getByText('Para productos que no están en el catálogo. No se guardan en él.'),
      ).toBeVisible()
      await user.type(form.getByLabelText('Descripción'), 'Instalación en sitio')
      await user.clear(form.getByLabelText('Cantidad'))
      await user.type(form.getByLabelText('Cantidad'), '2')
      await user.type(form.getByLabelText('Precio con IGV (S/)'), '350')
      await user.click(form.getByRole('button', { name: 'Añadir a la proforma' }))
      expect(screen.getByText('Producto libre')).toBeVisible()
      expect(screen.getByLabelText('Cantidad de Instalación en sitio')).toHaveValue('2')
      expect(screen.getByLabelText('Precio unitario de Instalación en sitio')).toHaveValue('350')
      expect(form.getByLabelText('Descripción')).toHaveValue('')
      expect(form.getByLabelText('Descripción')).toHaveFocus()
      expect(form.getByRole('status')).toHaveTextContent('Añadiste «Instalación en sitio».')
      expect(form.getByRole('button', { name: 'Cerrar' })).toBeVisible()
      expect(generate()).toBeEnabled()
    })

    it('pide la descripción y un precio válido antes de añadir', async () => {
      seedProforma({})
      const { user } = renderEditor()
      await user.click(screen.getByRole('button', { name: 'Añadir producto libre' }))
      const form = freeForm()
      await user.type(form.getByLabelText('Precio con IGV (S/)'), '0')
      await user.click(form.getByRole('button', { name: 'Añadir a la proforma' }))
      expect(await form.findByText('Escribe la descripción.')).toBeVisible()
      expect(
        form.getByText('Escribe un precio mayor que cero, con hasta dos decimales.'),
      ).toBeVisible()
      expect(screen.getByText(/La proforma está vacía/)).toBeVisible()
    })

    it('«Cancelar» lo cierra y devuelve el foco al botón', async () => {
      seedProforma({})
      const { user } = renderEditor()
      const toggle = screen.getByRole('button', { name: 'Añadir producto libre' })
      await user.click(toggle)
      await user.click(freeForm().getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('form', { name: 'Añadir producto libre' })).not.toBeInTheDocument()
      expect(toggle).toHaveFocus()
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
    })

    it('no avisa de precio cambiado ni de «Ya no está en el catálogo»', () => {
      seedProforma({ lines: [freeLine({ unitPrice: '300' })] })
      renderEditor({ prices: new Map() })
      expect(screen.getByText('Producto libre')).toBeVisible()
      expect(screen.queryByText(/Ya no está en el catálogo/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Restaurar' })).not.toBeInTheDocument()
    })
  })
})
