import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WHATSAPP_MESSAGE,
  MESSAGE_FIELDS,
  documentDates,
  documentFileName,
  flowPieces,
  unknownMessageFields,
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

describe('mensaje de WhatsApp', () => {
  const data = {
    clientName: 'Cliente de ejemplo S.A.C.',
    numberLabel: 'N° 0001',
    total: 'S/ 8,114.00',
    validUntil: '07/10/2026',
    sender: 'Ventronix',
  }

  it('sin mensaje en Empresa usa el original, sin doble punto', () => {
    const expected =
      'Hola, Cliente de ejemplo S.A.C. Le envío la proforma N° 0001 por S/ 8,114.00, válida hasta el 07/10/2026. Quedamos atentos. — Ventronix'
    expect(whatsappMessage(null, data)).toBe(expected)
    expect(whatsappMessage('   ', data)).toBe(expected)
  })

  it('reemplaza los datos del mensaje de Empresa y deja tal cual lo demás', () => {
    expect(
      whatsappMessage(
        'Buen día, {cliente}. Adjunto la {numero} por {total} ({vence}). {precio} — {empresa}',
        data,
      ),
    ).toBe(
      'Buen día, Cliente de ejemplo S.A.C. Adjunto la N° 0001 por S/ 8,114.00 (07/10/2026). {precio} — Ventronix',
    )
  })

  it('reconoce los datos aunque se escriban con mayúsculas, tildes o espacios', () => {
    expect(whatsappMessage('Hola {Cliente}, su {Número} por { TOTAL }.', data)).toBe(
      'Hola Cliente de ejemplo S.A.C., su N° 0001 por S/ 8,114.00.',
    )
  })

  it('dice qué va entre llaves y no es un dato, sin repetirlo', () => {
    expect(unknownMessageFields('Hola {cliente}: {precio}, {Fecha} y {precio}')).toEqual([
      '{precio}',
      '{Fecha}',
    ])
    expect(unknownMessageFields(DEFAULT_WHATSAPP_MESSAGE)).toEqual([])
  })

  it('el mensaje original usa todos los datos', () => {
    for (const field of MESSAGE_FIELDS) expect(DEFAULT_WHATSAPP_MESSAGE).toContain(field.token)
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

describe('flowPieces', () => {
  const nb = '\u00a0'

  it('sin palabras largas deja el texto entero', () => {
    expect(flowPieces('Jr. Asamblea 245, Huamanga')).toBeNull()
    expect(flowPieces('Cambios dentro de los 7 días. Electroencefalografista')).toBeNull()
  })

  it('parte un correo largo en sus puntos y antes de la arroba', () => {
    expect(flowPieces('ventronix.solucionestecnologicas@gmail.com')).toEqual([
      ['ventronix.', 'solucionestecnologicas', '@gmail.', 'com'],
    ])
  })

  it('reparte palabra a palabra, con el espacio pegado al final de cada una', () => {
    expect(flowPieces('Ficha: https://www.ejemplo.com/productos/i5-16gb')).toEqual([
      [`Ficha:${nb}`, 'https:/', '/', 'www.', 'ejemplo.', 'com/', 'productos/', 'i5-', '16gb'],
    ])
  })

  it('un tramo de más de 24 caracteres sin separadores se corta cada 20', () => {
    expect(flowPieces('A'.repeat(30))).toEqual([['A'.repeat(20), 'A'.repeat(10)]])
  })

  it('respeta los saltos de línea y las líneas vacías', () => {
    expect(flowPieces('Uno dos\n\nhttps://www.ejemplo.com/productos/computadoras')).toEqual([
      [`Uno${nb}`, 'dos'],
      [nb],
      ['https:/', '/', 'www.', 'ejemplo.', 'com/', 'productos/', 'computadoras'],
    ])
  })
})
