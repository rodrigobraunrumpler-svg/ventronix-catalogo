import { describe, expect, it } from 'vitest'
import { settle } from '@/lib/action-result'

describe('settle', () => {
  it('convierte una acción rechazada (red o servidor) en un error visible', async () => {
    expect(await settle(Promise.reject(new TypeError('Failed to fetch')))).toEqual({
      ok: false,
      error: {
        code: 'UNEXPECTED',
        message: 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.',
      },
    })
  })

  it('deja pasar la respuesta de la acción', async () => {
    const result = { ok: true as const, data: null }
    expect(await settle(Promise.resolve(result))).toBe(result)
  })
})
