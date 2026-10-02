import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

describe('ProformaPanel', () => {
  it('«Generar» asigna el número; «Corregir» lo conserva y no pide otro', async () => {
    seedProforma(readyToGenerate)
    const { reserveNumber, user } = renderPanel()
    await user.click(generate())
    expect(await screen.findByText('Proforma N° 0001 lista')).toBeVisible()
    expect(screen.getByText('Cliente de prueba · Total S/ 2,590.00')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Corregir' }))
    await user.click(generate())
    expect(await screen.findByText('Proforma N° 0001 lista')).toBeVisible()
    expect(reserveNumber).toHaveBeenCalledTimes(1)
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
