import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { openState, sealState, sessionKey } from '@/features/whatsapp/session-crypto'

const key = randomBytes(32)

describe('cifrado de la sesión', () => {
  it('cifra y descifra; lo cifrado no deja ver el contenido', () => {
    const sealed = sealState('{"creds":"secreto"}', key)
    expect(sealed).not.toContain('secreto')
    expect(openState(sealed, key)).toBe('{"creds":"secreto"}')
  })

  it('con otra clave o alterado, no se abre', () => {
    const sealed = sealState('{"creds":"secreto"}', key)
    expect(() => openState(sealed, randomBytes(32))).toThrow()
    const bytes = Buffer.from(sealed, 'base64')
    bytes[bytes.length - 1] ^= 1
    expect(() => openState(bytes.toString('base64'), key)).toThrow()
  })

  it('lee la clave del entorno: 32 bytes en base64', () => {
    expect(sessionKey({ WHATSAPP_SESSION_KEY: key.toString('base64') })).toEqual(key)
    expect(sessionKey({})).toBeNull()
    expect(sessionKey({ WHATSAPP_SESSION_KEY: ' ' })).toBeNull()
    expect(() => sessionKey({ WHATSAPP_SESSION_KEY: 'corta' })).toThrow('WHATSAPP_SESSION_KEY')
  })
})
