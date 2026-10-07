import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  ProformaPanel,
  type ProformaPanelProps,
} from '@/features/proforma/components/proforma-panel'
import type { DocumentInput, GeneratedDocument } from '@/features/proforma/document/input'
import { draftSchema, EMPTY_DRAFT, PROFORMA_DRAFT_KEY } from '@/features/proforma/draft'
import type { RucLookupResult } from '@/features/proforma/ruc'
import { ProformaProvider } from '@/features/proforma/store'
import type { ActionResult } from '@/lib/action-result'
import { readDraft } from '@/lib/drafts'
import { completeCompany, line, seedProforma } from '../support/proforma'

function renderPanel(overrides: Partial<ProformaPanelProps> = {}) {
  const props: ProformaPanelProps = {
    company: { status: 'ready', profile: completeCompany },
    prices: undefined,
    lookupRuc: vi.fn<(ruc: string) => Promise<RucLookupResult>>(async () => ({
      kind: 'not-found',
    })),
    reserveNumber: vi.fn(async (): Promise<ActionResult<number>> => ({ ok: true, data: 1 })),
    onContinue: vi.fn(),
    onFinish: vi.fn(),
    generatePdf: vi.fn<(input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>>(
      () => new Promise(() => {}),
    ),
    searchProducts: vi.fn(async () => []),
    findClient: vi.fn(async () => null),
    uploadPhoto: vi.fn(async () => ''),
    ...overrides,
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProformaProvider>
        <ProformaPanel {...props} />
      </ProformaProvider>
    </QueryClientProvider>,
  )
  return { ...props, user: userEvent.setup() }
}

const readyToGenerate = {
  lines: [line()],
  client: { ...EMPTY_DRAFT.client, name: 'Cliente de prueba' },
}
const generate = () => screen.getByRole('button', { name: 'Generar proforma' })
const pdf: GeneratedDocument = { fileName: 'Proforma-0001.pdf', base64: btoa('%PDF-1.4 prueba') }
const savesPdf = () =>
  vi.fn(async (): Promise<ActionResult<GeneratedDocument>> => ({ ok: true, data: pdf }))
const stored = () => readDraft(PROFORMA_DRAFT_KEY, draftSchema)

describe('ProformaPanel', () => {
  it('«Generar» asigna el número; «Corregir» lo conserva y no pide otro', async () => {
    seedProforma(readyToGenerate)
    const { reserveNumber, user } = renderPanel()
    await user.click(generate())
    expect(await screen.findByText('Proforma N° 0001 lista')).toBeVisible()
    expect(screen.getByText('Cliente de prueba · Total S/ 2,590.00')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Corregir' }))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios de la N° 0001' }))
    expect(await screen.findByText('Proforma N° 0001 actualizada')).toBeVisible()
    expect(reserveNumber).toHaveBeenCalledTimes(1)
  })

  it('al quedar guardada, la proforma se vacía y la «lista» sigue con la guardada', async () => {
    seedProforma(readyToGenerate)
    const { user } = renderPanel({ generatePdf: savesPdf() })
    await user.click(generate())
    await vi.waitFor(() => expect(stored()).toMatchObject({ lines: [], number: null }))
    expect(screen.getByText('Proforma N° 0001 lista')).toBeVisible()
    expect(screen.getByText('Cliente de prueba · Total S/ 2,590.00')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled()
  })

  it('si no se pudo guardar, la proforma se conserva para reintentar', async () => {
    seedProforma(readyToGenerate)
    const generatePdf = vi.fn(async (): Promise<ActionResult<GeneratedDocument>> => ({
      ok: false,
      error: { code: 'UNEXPECTED', message: 'Revisa tu conexión.' },
    }))
    const { user } = renderPanel({ generatePdf })
    await user.click(generate())
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos preparar el PDF.')
    expect(stored()).toMatchObject({ number: 1, client: { name: 'Cliente de prueba' } })
    expect(stored()?.lines).toHaveLength(1)
  })

  it('si la proforma cambia mientras se guarda, no la vuelve a guardar ni la vacía', async () => {
    seedProforma(readyToGenerate)
    let finish: (result: ActionResult<GeneratedDocument>) => void = () => {}
    const generatePdf = vi.fn(
      () => new Promise<ActionResult<GeneratedDocument>>((resolve) => (finish = resolve)),
    )
    const { user } = renderPanel({ generatePdf })
    await user.click(generate())
    await screen.findByText('Proforma N° 0001 lista')
    // Otra pestaña le sube la cantidad mientras se guarda.
    seedProforma({ ...stored(), lines: [line({ quantity: 2 })] })
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })))
    await act(async () => finish({ ok: true, data: pdf }))
    expect(generatePdf).toHaveBeenCalledTimes(1)
    expect(stored()?.lines[0]).toMatchObject({ quantity: 2 })
    expect(screen.getByText('Cliente de prueba · Total S/ 2,590.00')).toBeVisible()
  })

  it('«Corregir» recupera la guardada con su número aunque ya se haya vaciado', async () => {
    seedProforma(readyToGenerate)
    const { reserveNumber, user } = renderPanel({ generatePdf: savesPdf() })
    await user.click(generate())
    await vi.waitFor(() => expect(stored()).toMatchObject({ lines: [], number: null }))
    await user.click(screen.getByRole('button', { name: 'Corregir' }))
    expect(screen.getByLabelText('Razón social o nombre')).toHaveValue('Cliente de prueba')
    expect(stored()).toMatchObject({ number: 1 })
    await user.click(screen.getByRole('button', { name: 'Guardar cambios de la N° 0001' }))
    expect(await screen.findByText('Proforma N° 0001 actualizada')).toBeVisible()
    expect(reserveNumber).toHaveBeenCalledTimes(1)
  })

  it('avisa qué proforma quedó guardada mientras la muestra, y cuándo deja de mostrarla', async () => {
    seedProforma(readyToGenerate)
    const onSavedChange = vi.fn()
    const { user } = renderPanel({ generatePdf: savesPdf(), onSavedChange })
    await user.click(generate())
    await vi.waitFor(() =>
      expect(onSavedChange).toHaveBeenLastCalledWith(expect.objectContaining({ number: 1 })),
    )
    await user.click(screen.getByRole('button', { name: 'Corregir' }))
    expect(onSavedChange).toHaveBeenLastCalledWith(null)
  })

  it('un doble clic pide un solo número', async () => {
    seedProforma(readyToGenerate)
    let finish: (result: ActionResult<number>) => void = () => {}
    const reserveNumber = vi.fn(
      () => new Promise<ActionResult<number>>((resolve) => (finish = resolve)),
    )
    const { user } = renderPanel({ reserveNumber })
    const button = generate()
    await user.click(button)
    await user.click(button)
    expect(reserveNumber).toHaveBeenCalledTimes(1)
    finish({ ok: true, data: 7 })
    expect(await screen.findByText('Proforma N° 0007 lista')).toBeVisible()
  })

  it('si falla, lo dice, conserva lo escrito y deja reintentar', async () => {
    seedProforma(readyToGenerate)
    const reserveNumber = vi
      .fn<() => Promise<ActionResult<number>>>()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'UNEXPECTED',
          message: 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.',
        },
      })
      .mockResolvedValueOnce({ ok: true, data: 2 })
    const { user } = renderPanel({ reserveNumber })
    await user.click(generate())
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu conexión')
    expect(screen.getByLabelText('Razón social o nombre')).toHaveValue('Cliente de prueba')
    await user.click(generate())
    expect(await screen.findByText('Proforma N° 0002 lista')).toBeVisible()
  })

  it('«Nueva proforma» vacía el borrador, libera el número y cierra', async () => {
    seedProforma(readyToGenerate)
    const { onFinish, user } = renderPanel()
    await user.click(generate())
    await user.click(await screen.findByRole('button', { name: 'Nueva proforma' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(readDraft(PROFORMA_DRAFT_KEY, draftSchema)).toMatchObject({ lines: [], number: null })
  })
})
