import { describe, expect, it } from 'vitest'
import { PAIRING_CODE, pairingCode, whatsappNumber } from '@/features/whatsapp/format'

describe('pairingCode', () => {
  it('son 8 caracteres del alfabeto de WhatsApp: sin 0, O, I ni U', () => {
    for (let index = 0; index < 50; index++) expect(pairingCode()).toMatch(PAIRING_CODE)
    expect('1Z1Z89AY').toMatch(PAIRING_CODE)
    expect('0OIU1234').not.toMatch(PAIRING_CODE)
  })

  it('reparte los bytes al azar por todo el alfabeto', () => {
    const bytes = Uint8Array.from([0, 31, 32, 63, 7, 8, 9, 30])
    expect(pairingCode(() => bytes)).toBe('1Z1Z89AY')
  })
})

describe('whatsappNumber', () => {
  it('antepone el código de Perú al celular', () => {
    expect(whatsappNumber('987 654 321')).toBe('51987654321')
  })
})
