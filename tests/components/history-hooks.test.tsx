import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getProformaDocument } from '@/features/proforma/history/actions'
import { useClientLookup, useStoredDocument } from '@/features/proforma/history/hooks'
import { findClient, type ProformaRow } from '@/features/proforma/history/queries'

vi.mock('@/features/proforma/history/actions', () => ({ getProformaDocument: vi.fn() }))
vi.mock('@/features/proforma/history/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/proforma/history/queries')>()),
  findClient: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

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

function setup() {
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  )
  return renderHook(() => ({ documents: useStoredDocument(), findClient: useClientLookup() }), {
    wrapper,
  })
}

beforeEach(() => {
  vi.mocked(getProformaDocument).mockReset()
  vi.mocked(findClient).mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:pdf')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('useStoredDocument', () => {
  it('descarga el PDF guardado y lo reutiliza: un doble clic no lo genera dos veces', async () => {
    vi.mocked(getProformaDocument).mockResolvedValue({
      ok: true,
      data: { fileName: 'Proforma-0042-Cliente.pdf', base64: btoa('%PDF'), message: 'Hola' },
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { result } = setup()
    await act(() => result.current.documents.download(row))
    await act(() => result.current.documents.download(row))
    expect(getProformaDocument).toHaveBeenCalledTimes(1)
    expect(getProformaDocument).toHaveBeenCalledWith(row.id)
    expect(click).toHaveBeenCalledTimes(2)
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('Proforma-0042-Cliente.pdf')
  })

  it('si no se puede preparar el PDF, lo dice con el mensaje del servidor', async () => {
    vi.mocked(getProformaDocument).mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'No encontramos esa proforma. Actualiza la lista.' },
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { result } = setup()
    await act(() => result.current.documents.download(row))
    expect(
      await screen.findByText('No encontramos esa proforma. Actualiza la lista.'),
    ).toBeInTheDocument()
    expect(click).not.toHaveBeenCalled()
  })
})

describe('useClientLookup', () => {
  it('busca el cliente del documento y, si la consulta falla, sigue sin completar', async () => {
    const match = {
      name: 'Inversiones Nuevo Sol S.A.C.',
      phone: '987654321',
      address: 'Av. Sol 456',
      count: 6,
    }
    vi.mocked(findClient).mockResolvedValueOnce(match).mockRejectedValueOnce(new Error('sin red'))
    const { result } = setup()
    expect(await result.current.findClient('20601234567')).toEqual(match)
    expect(await result.current.findClient('12345678')).toBeNull()
  })
})
