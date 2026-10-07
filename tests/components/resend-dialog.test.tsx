import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ResendDialog,
  type ResendDialogProps,
} from '@/features/proforma/history/components/resend-dialog'
import type { ProformaRow } from '@/features/proforma/history/queries'
import type { StoredDocument } from '@/features/proforma/history/snapshot'
import type { ActionResult } from '@/lib/action-result'

const row: ProformaRow = {
  id: '00000000-0000-4000-8000-000000000042',
  number: 42,
  issued_at: '2026-10-02T15:00:00.000Z',
  valid_until: '2026-10-09',
  client_name: 'Inversiones Nuevo Sol S.A.C.',
  client_document: '20601234567',
  client_phone: '987654321',
  item_count: 3,
  total: '7960.00',
}

const stored: StoredDocument = {
  fileName: 'Proforma-0042-Inversiones-Nuevo-Sol-SAC.pdf',
  base64: btoa('%PDF-1.4 prueba'),
  message:
    'Hola, Inversiones Nuevo Sol S.A.C. Le envío la proforma N° 0042 por S/ 7,960.00, válida hasta el 09/10/2026. Quedamos atentos. — Ventronix',
}

function renderDialog(props: Partial<ResendDialogProps> = {}) {
  const loadDocument = vi.fn(async (): Promise<StoredDocument> => stored)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResendDialog
        row={row}
        today="2026-10-06"
        onClose={vi.fn()}
        loadDocument={loadDocument}
        {...props}
      />
      <Toaster />
    </QueryClientProvider>,
  )
  return { loadDocument, user: userEvent.setup() }
}

const sendButton = () => screen.getByRole('button', { name: 'Enviar por WhatsApp' })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:proforma')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('ResendDialog', () => {
  it('muestra la proforma, el celular editable y el mensaje que se enviará', async () => {
    const { loadDocument } = renderDialog()
    const dialog = within(screen.getByRole('dialog', { name: 'Reenviar proforma N° 0042' }))
    expect(
      dialog.getByText('Inversiones Nuevo Sol S.A.C. · S/ 7,960.00 · generada el 02/10/2026'),
    ).toBeVisible()
    expect(dialog.getByLabelText('Celular del cliente')).toHaveValue('987 654 321')
    expect(await dialog.findByText(stored.message)).toBeVisible()
    expect(
      dialog.getByText(
        'Se envía el mismo documento que se generó: mismos productos, precios, fotos y datos de la empresa de ese día.',
      ),
    ).toBeVisible()
    expect(loadDocument).toHaveBeenCalledWith(row.id)
  })

  it('con WhatsApp vinculado la reenvía al celular escrito', async () => {
    const resend = vi.fn(async (): Promise<ActionResult<{ phone: string }>> => ({
      ok: true,
      data: { phone: '911 222 333' },
    }))
    const { user } = renderDialog({ resend })
    const phone = screen.getByLabelText('Celular del cliente')
    await user.clear(phone)
    await user.type(phone, '911 222 333')
    await vi.waitFor(() => expect(sendButton()).toBeEnabled())
    await user.click(sendButton())
    expect(resend).toHaveBeenCalledWith({ id: row.id, phone: '911 222 333' })
    expect(await screen.findByText('Enviada por WhatsApp al 911 222 333.')).toBeVisible()
  })

  it('sin WhatsApp vinculado descarga el PDF y abre el chat con el mensaje', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const { user } = renderDialog()
    await vi.waitFor(() => expect(sendButton()).toBeEnabled())
    await user.click(sendButton())
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/51987654321?text=${encodeURIComponent(stored.message)}`,
      '_blank',
    )
  })

  it('un celular que no es válido no deja enviar y lo explica', async () => {
    const { user } = renderDialog()
    const phone = screen.getByLabelText('Celular del cliente')
    await user.clear(phone)
    await user.type(phone, '12345')
    expect(screen.getByText('Escribe un celular de 9 dígitos que empiece por 9.')).toBeVisible()
    expect(sendButton()).toBeDisabled()
  })

  it('si no se puede preparar el PDF, lo dice y deja reintentar', async () => {
    const loadDocument = vi
      .fn<(id: string) => Promise<StoredDocument>>()
      .mockRejectedValueOnce(new Error('No encontramos esa proforma. Actualiza la lista.'))
      .mockResolvedValueOnce(stored)
    const { user } = renderDialog({ loadDocument })
    expect(await screen.findByText(/No encontramos esa proforma/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(stored.message)).toBeVisible()
  })

  it('si ya venció, lo advierte antes de reenviarla', () => {
    renderDialog({ today: '2026-10-10' })
    expect(
      screen.getByText(
        'Venció el 09/10/2026. Si los precios cambiaron, genera una proforma nueva antes de enviarla.',
      ),
    ).toBeVisible()
  })
})
