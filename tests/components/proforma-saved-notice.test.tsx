import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { draftSchema, EMPTY_DRAFT, PROFORMA_DRAFT_KEY } from '@/features/proforma/draft'
import { ProformaProvider, useSavedNotice } from '@/features/proforma/store'
import { readDraft } from '@/lib/drafts'
import { e1Lines, line, seedProforma } from '../support/proforma'

const saved = {
  ...EMPTY_DRAFT,
  lines: [line()],
  client: { ...EMPTY_DRAFT.client, name: 'Cliente de prueba' },
  number: 3,
  issuedAt: '2026-10-07T15:00:00.000Z',
}

function Closing({ reopen }: { reopen: () => void }) {
  const notify = useSavedNotice(reopen)
  return (
    <button type="button" onClick={() => notify(saved)}>
      Cerrar
    </button>
  )
}

function renderNotice() {
  const reopen = vi.fn()
  render(
    <ProformaProvider>
      <Closing reopen={reopen} />
      <Toaster />
    </ProformaProvider>,
  )
  return { reopen, user: userEvent.setup() }
}

describe('aviso al cerrar una proforma guardada', () => {
  it('«Corregir» la recupera con su número y la abre', async () => {
    const { reopen, user } = renderNotice()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(await screen.findByText('Proforma N° 0003 guardada en el historial')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Corregir' }))
    expect(reopen).toHaveBeenCalledTimes(1)
    expect(readDraft(PROFORMA_DRAFT_KEY, draftSchema)).toMatchObject({
      number: 3,
      client: { name: 'Cliente de prueba' },
    })
  })

  it('si ya empezaste otra, «Corregir» no la pisa y lo explica', async () => {
    seedProforma({ lines: e1Lines })
    const { reopen, user } = renderNotice()
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await user.click(await screen.findByRole('button', { name: 'Corregir' }))
    expect(
      await screen.findByText('Tienes otra proforma en curso. Vacíala para corregir la N° 0003.'),
    ).toBeVisible()
    expect(reopen).not.toHaveBeenCalled()
    expect(readDraft(PROFORMA_DRAFT_KEY, draftSchema)).toMatchObject({ number: null })
  })
})
