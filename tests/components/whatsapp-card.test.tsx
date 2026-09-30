import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { WhatsAppCard, type WhatsAppCardProps } from '@/features/whatsapp/components/whatsapp-card'
import { PAIRING_CODE } from '@/features/whatsapp/format'
import type { WhatsAppStatus } from '@/features/whatsapp/schemas'
import type { ActionResult } from '@/lib/action-result'

type Link = WhatsAppCardProps['onLink']
type Unlink = WhatsAppCardProps['onUnlink']

const unlinked: WhatsAppStatus = { configured: true, phone: null, linkedAt: null }
const linked: WhatsAppStatus = {
  configured: true,
  phone: '987654321',
  linkedAt: '2026-09-30T15:00:00.000Z',
}
const ok = (data: WhatsAppStatus): ActionResult<WhatsAppStatus> => ({ ok: true, data })

function renderCard(overrides: Partial<WhatsAppCardProps> = {}) {
  const props: WhatsAppCardProps = {
    status: unlinked,
    onLink: vi.fn<Link>(async () => ok(linked)),
    onUnlink: vi.fn<Unlink>(async () => ok(unlinked)),
    ...overrides,
  }
  const view = render(
    <>
      <WhatsAppCard {...props} />
      <Toaster />
    </>,
  )
  return { ...props, ...view, user: userEvent.setup() }
}

describe('WhatsAppCard', () => {
  it('sin clave en el servidor explica qué falta y no deja vincular', () => {
    renderCard({ status: { configured: false, phone: null, linkedAt: null } })
    expect(screen.getByText(/falta configurar WHATSAPP_SESSION_KEY/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Vincular WhatsApp' })).not.toBeInTheDocument()
  })

  it('vincula: muestra el código al instante y espera a que se escriba en el teléfono', async () => {
    let finish: (result: ActionResult<WhatsAppStatus>) => void = () => {}
    const onLink = vi.fn<Link>(() => new Promise((resolve) => (finish = resolve)))
    const { user, rerender } = renderCard({ onLink })
    await user.click(screen.getByRole('button', { name: 'Vincular WhatsApp' }))
    const dialog = screen.getByRole('dialog', { name: 'Vincular WhatsApp' })
    await user.type(
      within(dialog).getByLabelText('Celular de WhatsApp de la empresa'),
      '987 654 321',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Generar código' }))
    const [input] = onLink.mock.calls[0]
    expect(input.phone).toBe('987654321')
    expect(input.code).toMatch(PAIRING_CODE)
    expect(
      within(dialog).getByText(`${input.code.slice(0, 4)}-${input.code.slice(4)}`),
    ).toBeVisible()
    expect(within(dialog).getByText(/Esperando a que escribas el código/)).toBeVisible()
    finish(ok(linked))
    expect(await screen.findByText('WhatsApp vinculado.')).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<WhatsAppCard status={linked} onLink={onLink} onUnlink={vi.fn<Unlink>()} />)
    expect(screen.getByText(/987 654 321/)).toBeVisible()
  })

  it('un celular no válido no pide código', async () => {
    const { onLink, user } = renderCard()
    await user.click(screen.getByRole('button', { name: 'Vincular WhatsApp' }))
    const dialog = screen.getByRole('dialog', { name: 'Vincular WhatsApp' })
    await user.type(within(dialog).getByLabelText('Celular de WhatsApp de la empresa'), '12345')
    await user.click(within(dialog).getByRole('button', { name: 'Generar código' }))
    expect(
      within(dialog).getByText('Escribe un celular de 9 dígitos que empiece con 9.'),
    ).toBeVisible()
    expect(onLink).not.toHaveBeenCalled()
  })

  it('si no se vincula a tiempo, lo dice y deja generar otro código', async () => {
    const onLink = vi
      .fn<Link>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'UNEXPECTED', message: 'No se vinculó a tiempo. Genera otro código.' },
      })
      .mockResolvedValueOnce(ok(linked))
    const { user } = renderCard({ onLink })
    await user.click(screen.getByRole('button', { name: 'Vincular WhatsApp' }))
    const dialog = screen.getByRole('dialog', { name: 'Vincular WhatsApp' })
    await user.type(within(dialog).getByLabelText('Celular de WhatsApp de la empresa'), '987654321')
    await user.click(within(dialog).getByRole('button', { name: 'Generar código' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No se vinculó a tiempo.')
    await user.click(within(dialog).getByRole('button', { name: 'Generar otro código' }))
    expect(onLink).toHaveBeenCalledTimes(2)
    expect(onLink.mock.calls[1][0].code).not.toBe(onLink.mock.calls[0][0].code)
  })

  it('vinculado: muestra el número y desvincula tras confirmarlo', async () => {
    const { onUnlink, user } = renderCard({ status: linked })
    expect(screen.getByText(/987 654 321/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Desvincular' }))
    const confirm = screen.getByRole('alertdialog', { name: 'Desvincular WhatsApp' })
    await user.click(within(confirm).getByRole('button', { name: 'Desvincular' }))
    expect(onUnlink).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('WhatsApp desvinculado.')).toBeVisible()
  })
})
