import { describe, expect, it } from 'vitest'
import {
  documentDates,
  documentFileName,
  whatsappLink,
  whatsappMessage,
  wrapCode,
} from '@/features/proforma/document/format'

describe('documentDates', () => {
  it('usa el día de Lima aunque en UTC ya sea el siguiente', () => {
    expect(documentDates(new Date('2026-10-01T03:00:00Z'), 7)).toEqual({
      date: '30/09/2026',
      validUntil: '07/10/2026',
    })
  })

  it('cruza meses y años', () => {
    expect(documentDates(new Date('2026-12-28T15:00:00Z'), 7)).toEqual({
      date: '28/12/2026',
      validUntil: '04/01/2027',
    })
  })
})

describe('documentFileName', () => {
  it.each([
    [1, 'Cliente de ejemplo S.A.C.', 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf'],
    [12345, 'Ñandú & Cía. E.I.R.L.', 'Proforma-12345-Nandu-Cia-EIRL.pdf'],
    [null, 'José Pérez', 'Proforma-borrador-Jose-Perez.pdf'],
    [7, '***', 'Proforma-0007.pdf'],
  ])('%s · %s', (number, client, expected) => {
    expect(documentFileName(number, client)).toBe(expected)
  })
})

describe('WhatsApp', () => {
  const message = whatsappMessage({
    clientName: 'Cliente de ejemplo S.A.C.',
    numberLabel: 'N° 0001',
    total: 'S/ 8,114.00',
    validUntil: '07/10/2026',
    sender: 'Ventronix',
  })

  it('escribe el saludo, el número, el total y la validez sin doble punto', () => {
    expect(message).toBe(
      'Hola, Cliente de ejemplo S.A.C. Le envío la proforma N° 0001 por S/ 8,114.00, válida hasta el 07/10/2026. Quedamos atentos. — Ventronix',
    )
  })

  it('abre el chat del celular peruano con el mensaje', () => {
    expect(whatsappLink('987 654 321', 'Hola, ¿qué tal?')).toBe(
      'https://wa.me/51987654321?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F',
    )
  })
})

describe('wrapCode', () => {
  it('deja igual un código que cabe', () => {
    expect(wrapCode('LAP-001', 9)).toBe('LAP-001')
  })

  it('parte tras los guiones, como el navegador', () => {
    expect(wrapCode('HP-LASERJET-M404DN', 9)).toBe('HP-\nLASERJET-\nM404DN')
  })

  it('parte entre palabras sin dejar el espacio al final', () => {
    expect(wrapCode('TONER HP CF258A', 9)).toBe('TONER HP\nCF258A')
  })

  it('un tramo sin separadores se corta cada tantos caracteres', () => {
    expect(wrapCode('ABCDEFGHIJKLMNOPQRS', 9)).toBe('ABCDEFGHI\nJKLMNOPQR\nS')
  })
})
