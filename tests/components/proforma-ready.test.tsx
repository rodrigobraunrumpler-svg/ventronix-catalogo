import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProformaReady } from '@/features/proforma/components/proforma-ready'
import type { DocumentInput, GeneratedDocument } from '@/features/proforma/document/input'
import { EMPTY_DRAFT } from '@/features/proforma/draft'
import { ProformaProvider } from '@/features/proforma/store'
import type { ActionResult } from '@/lib/action-result'
import { completeCompany, line, seedProforma } from '../support/proforma'

type Generate = (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>
const pdf: GeneratedDocument = {
  fileName: 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf',
  base64: btoa('%PDF-1.4 prueba'),
}

function renderReady(
  generatePdf: Generate = vi.fn<Generate>(async () => ({ ok: true, data: pdf })),
) {
  render(
    <ProformaProvider>
      <ProformaReady
        company={{ status: 'ready', profile: { ...completeCompany, trade_name: 'Ventronix' } }}
        generatePdf={generatePdf}
        onCorrect={vi.fn()}
        onNew={vi.fn()}
      />
    </ProformaProvider>,
  )
  return { generatePdf, user: userEvent.setup() }
}

const seed = (phone = '900000000') =>
  seedProforma({
    lines: [line()],
    client: { ...EMPTY_DRAFT.client, name: 'Cliente de ejemplo S.A.C.', phone },
    number: 1,
    issuedAt: '2026-09-30T15:00:00.000Z',
  })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:proforma')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('ProformaReady', () => {
  it('prepara el PDF al entrar y lo descarga con su nombre', async () => {
    seed()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { generatePdf, user } = renderReady()
    expect(screen.getByText('Proforma N° 0001 lista')).toBeVisible()
    expect(screen.getByText('Preparando el PDF…')).toBeVisible()
    const download = screen.getByRole('button', { name: 'Descargar PDF' })
    await vi.waitFor(() => expect(download).toBeEnabled())
    expect(generatePdf).toHaveBeenCalledTimes(1)
    expect(generatePdf).toHaveBeenCalledWith(expect.objectContaining({ draft: false, number: 1 }))
    await user.click(download)
    expect(click).toHaveBeenCalledTimes(1)
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(pdf.fileName)
  })

  it('sin celular no deja enviar por WhatsApp y lo explica', async () => {
    seed('')
    renderReady()
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled(),
    )
    expect(screen.getByRole('button', { name: 'Enviar por WhatsApp' })).toBeDisabled()
    expect(
      screen.getByText('Añade el celular del cliente para enviarla por WhatsApp.'),
    ).toBeVisible()
  })

  it('en la PC descarga el PDF y abre el chat del cliente con el mensaje', async () => {
    seed()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { user } = renderReady()
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    const message =
      'Hola, Cliente de ejemplo S.A.C. Le envío la proforma N° 0001 por S/ 2,590.00, válida hasta el 07/10/2026. Quedamos atentos. — Ventronix'
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/51900000000?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener',
    )
  })

  it('si no se puede preparar el PDF, lo dice y deja reintentar', async () => {
    seed()
    const generatePdf = vi
      .fn<Generate>()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'UNEXPECTED',
          message: 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.',
        },
      })
      .mockResolvedValueOnce({ ok: true, data: pdf })
    const { user } = renderReady(generatePdf)
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos preparar el PDF.')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled(),
    )
    expect(generatePdf).toHaveBeenCalledTimes(2)
  })
})
