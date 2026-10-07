import { describe, expect, it } from 'vitest'
import {
  decimalText,
  digitsOnly,
  documentError,
  documentKind,
  isValidMobile,
  isValidRuc,
} from '@/lib/peru'

describe('isValidRuc', () => {
  // 20000000010: el dígito calculado es 10 → 0. 20000000061: es 11 → 1.
  it.each(['20000000001', '20000000010', '20000000061', '20601030013', '10412345679'])(
    'acepta %s',
    (ruc) => expect(isValidRuc(ruc)).toBe(true),
  )
  it.each(['20000000002', '30000000001', '2000000000', '2000000000a', ''])('rechaza %j', (ruc) =>
    expect(isValidRuc(ruc)).toBe(false),
  )
})

describe('documento del cliente', () => {
  it('distingue RUC y DNI por el número de dígitos', () => {
    expect(documentKind('20000000001')).toBe('ruc')
    expect(documentKind('12345678')).toBe('dni')
    expect(documentKind('123')).toBeNull()
  })
  it('vacío o válido no tiene error', () => {
    expect(documentError('')).toBeNull()
    expect(documentError('12345678')).toBeNull()
    expect(documentError('20000000001')).toBeNull()
  })
  it('explica el largo y el dígito verificador', () => {
    expect(documentError('123')).toBe('Escribe 8 dígitos para DNI u 11 para RUC.')
    expect(documentError('20000000002')).toBe('Este RUC no es válido. Revisa los 11 dígitos.')
  })
})

describe('celular y dígitos', () => {
  it('celular: 9 dígitos que empiezan por 9', () => {
    expect(isValidMobile('987654321')).toBe(true)
    expect(isValidMobile('887654321')).toBe(false)
    expect(isValidMobile('98765432')).toBe(false)
  })
  it('decimalText deja solo dígitos, punto y coma: un monto no admite letras', () => {
    expect(decimalText('S/ 1a2b3,5x0')).toBe('123,50')
    expect(decimalText('12.5 %')).toBe('12.5')
    // Los separadores se dejan tal cual: el formato lo valida quien lo lee (sin recortar el monto).
    expect(decimalText('1,234.50')).toBe('1,234.50')
  })

  it('digitsOnly quita espacios y signos', () => {
    expect(digitsOnly('987 654-321')).toBe('987654321')
  })
})
