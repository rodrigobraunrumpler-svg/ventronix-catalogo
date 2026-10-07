import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanyProfile } from '@/features/company/schemas'
import { ProformaReady } from '@/features/proforma/components/proforma-ready'
import type { DocumentInput, GeneratedDocument } from '@/features/proforma/document/input'
import { EMPTY_DRAFT, type ProformaDraft } from '@/features/proforma/draft'
import { ProformaProvider } from '@/features/proforma/store'
import type { ActionResult } from '@/lib/action-result'
import { completeCompany, line, seedProforma } from '../support/proforma'

type Generate = (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>
type Send = (input: DocumentInput) => Promise<ActionResult<{ phone: string }>>
const pdf: GeneratedDocument = {
  fileName: 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf',
  base64: btoa('%PDF-1.4 prueba'),
}

function renderReady(
  generatePdf: Generate = vi.fn<Generate>(async () => ({ ok: true, data: pdf })),
  sendByWhatsApp?: Send,
  profile: Partial<CompanyProfile> = {},
  corrected = false,
) {
  const onSaved = vi.fn()
  render(
    <ProformaProvider>
      <ProformaReady
        proforma={seeded}
        corrected={corrected}
        company={{
          status: 'ready',
          profile: { ...completeCompany, trade_name: 'Ventronix', ...profile },
        }}
        generatePdf={generatePdf}
        sendByWhatsApp={sendByWhatsApp}
        onSaved={onSaved}
        onCorrect={vi.fn()}
        onNew={vi.fn()}
      />
      <Toaster />
    </ProformaProvider>,
  )
  return { generatePdf, onSaved, user: userEvent.setup() }
}

// La proforma recién generada: la «lista» trabaja con esta copia, no con el borrador.
let seeded: ProformaDraft = EMPTY_DRAFT
function seed(phone = '900000000', quantity = 1) {
  seeded = {
    ...EMPTY_DRAFT,
    lines: [line({ quantity })],
    client: { ...EMPTY_DRAFT.client, name: 'Cliente de ejemplo S.A.C.', phone },
    number: 1,
    issuedAt: '2026-09-30T15:00:00.000Z',
  }
  seedProforma(seeded)
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:proforma')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('ProformaReady', () => {
  it('lista, dice que quedó guardada y, desde Productos, enlaza al historial', async () => {
    seed()
    render(
      <ProformaProvider>
        <ProformaReady
          proforma={seeded}
          corrected={false}
          company={{ status: 'ready', profile: completeCompany }}
          generatePdf={vi.fn<Generate>(async () => ({ ok: true, data: pdf }))}
          onSaved={vi.fn()}
          onCorrect={vi.fn()}
          onNew={vi.fn()}
          historyLink
        />
      </ProformaProvider>,
    )
    expect(await screen.findByText(/Quedó guardada en el historial/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Proformas' })).toHaveAttribute('href', '/proformas')
  })

  it('desde Proformas lo dice sin enlace', async () => {
    seed()
    renderReady()
    expect(await screen.findByText('Quedó guardada en el historial.')).toBeVisible()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

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
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const { user } = renderReady()
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    const message =
      'Hola, Cliente de ejemplo S.A.C. Le envío la proforma N° 0001 por S/ 2,590.00, válida hasta el 07/10/2026. Quedamos atentos. — Ventronix'
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/51900000000?text=${encodeURIComponent(message)}`,
      '_blank',
    )
    expect(screen.queryByText(/bloqueó/)).not.toBeInTheDocument()
  })

  it('abre el chat con el mensaje de Empresa', async () => {
    seed()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const { user } = renderReady(undefined, undefined, {
      whatsapp_message: 'Hola {cliente}, su {numero} por {total}.',
    })
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/51900000000?text=${encodeURIComponent('Hola Cliente de ejemplo S.A.C., su N° 0001 por S/ 2,590.00.')}`,
      '_blank',
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

  it('si otra pestaña cambia el borrador, sigue con la guardada y no la vuelve a guardar', async () => {
    seed()
    const { generatePdf } = renderReady()
    const download = screen.getByRole('button', { name: 'Descargar PDF' })
    await vi.waitFor(() => expect(download).toBeEnabled())
    seedProforma({ ...seeded, lines: [line({ quantity: 2 })] })
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })))
    expect(download).toBeEnabled()
    expect(screen.getByText('Cliente de ejemplo S.A.C. · Total S/ 2,590.00')).toBeVisible()
    expect(generatePdf).toHaveBeenCalledTimes(1)
  })

  it('avisa cuando quedó guardada, y no si falló', async () => {
    seed()
    const failing = vi.fn<Generate>(async () => ({
      ok: false,
      error: { code: 'UNEXPECTED', message: 'Revisa tu conexión.' },
    }))
    const { onSaved } = renderReady(failing)
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos preparar el PDF.')
    expect(onSaved).not.toHaveBeenCalled()
    cleanup()
    const saved = renderReady()
    await vi.waitFor(() => expect(saved.onSaved).toHaveBeenCalledTimes(1))
  })

  it('una corrección dice que quedó actualizada', async () => {
    seed()
    renderReady(undefined, undefined, {}, true)
    expect(screen.getByText('Proforma N° 0001 actualizada')).toBeVisible()
    await screen.findByText('Quedó guardada en el historial.')
  })

  it('si el navegador bloquea la pestaña, «Ver el documento» descarga el PDF y lo avisa', async () => {
    seed()
    vi.spyOn(window, 'open').mockReturnValue(null)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { user } = renderReady()
    const view = screen.getByRole('button', { name: 'Ver el documento' })
    await vi.waitFor(() => expect(view).toBeEnabled())
    await user.click(view)
    expect(
      await screen.findByText('Tu navegador bloqueó la pestaña nueva: descargamos el PDF.'),
    ).toBeVisible()
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(pdf.fileName)
  })

  it('si el navegador bloquea WhatsApp, ofrece abrir el chat con un enlace', async () => {
    seed()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { user } = renderReady()
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    expect(await screen.findByText('Tu navegador bloqueó la pestaña de WhatsApp.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Abrir el chat' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/wa\.me\/51900000000\?text=Hola/),
    )
  })

  it('con WhatsApp vinculado, la envía sin descargarla ni abrir el chat', async () => {
    seed()
    const open = vi.spyOn(window, 'open')
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const sendByWhatsApp = vi.fn<Send>(async () => ({ ok: true, data: { phone: '900 000 000' } }))
    const { user } = renderReady(undefined, sendByWhatsApp)
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    expect(sendByWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false, number: 1 }),
    )
    expect(await screen.findByText('Enviada por WhatsApp al 900 000 000.')).toBeVisible()
    expect(open).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })

  it('si el envío automático falla, lo dice y ofrece abrir el chat', async () => {
    seed()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const sendByWhatsApp = vi.fn<Send>(async () => ({
      ok: false,
      error: { code: 'UNEXPECTED', message: 'No pudimos enviarla por WhatsApp.' },
    }))
    const { user } = renderReady(undefined, sendByWhatsApp)
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos enviarla por WhatsApp.')
    await user.click(screen.getByRole('button', { name: 'Abrir el chat' }))
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/wa\.me\/51900000000/),
      '_blank',
    )
  })

  it('si el cliente no tiene WhatsApp, no ofrece abrir el chat', async () => {
    seed()
    const sendByWhatsApp = vi.fn<Send>(async () => ({
      ok: false,
      error: { code: 'VALIDATION', message: 'El 900 000 000 no tiene WhatsApp.' },
    }))
    const { user } = renderReady(undefined, sendByWhatsApp)
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    expect(await screen.findByRole('alert')).toHaveTextContent('El 900 000 000 no tiene WhatsApp.')
    expect(screen.queryByRole('button', { name: 'Abrir el chat' })).not.toBeInTheDocument()
  })
})
