import { describe, expect, it } from 'vitest'
import {
  cellPrice,
  cellText,
  cleanText,
  priceText,
  readCell,
  type Cell,
} from '@/features/catalog/excel/normalize'

const text = (value: string): Cell => ({ kind: 'text', value })
const number = (value: number): Cell => ({ kind: 'number', value })

describe('readCell', () => {
  it('reconoce cada tipo de celda de ExcelJS', () => {
    expect(readCell(null)).toEqual({ kind: 'empty' })
    expect(readCell('   ')).toEqual({ kind: 'empty' })
    expect(readCell('\u200b')).toEqual({ kind: 'empty' })
    expect(readCell('LAP-001')).toEqual(text('LAP-001'))
    expect(readCell(12)).toEqual(number(12))
    expect(readCell(true)).toEqual({ kind: 'boolean', value: true })
    expect(readCell(new Date('2026-10-01T00:00:00Z'))).toEqual({
      kind: 'date',
      value: new Date('2026-10-01T00:00:00Z'),
    })
    expect(readCell({ richText: [{ text: 'LAP-' }, { text: '001' }] })).toEqual(text('LAP-001'))
    expect(readCell({ text: 'HP 14', hyperlink: 'https://x.test' })).toEqual(text('HP 14'))
    expect(readCell({ formula: 'A1*2', result: 1299.9, date1904: false })).toEqual(number(1299.9))
  })

  it('una fórmula sin calcular y un error de Excel son errores con su motivo', () => {
    expect(readCell({ formula: 'B9', date1904: false })).toMatchObject({
      kind: 'error',
      message: 'Fórmula sin calcular. Abre el archivo en Excel y guárdalo de nuevo.',
    })
    expect(readCell({ error: '#N/A' } as never)).toEqual({
      kind: 'error',
      message: 'La celda tiene un error de Excel (#N/A).',
      shown: '#N/A',
    })
  })
})

describe('cellText', () => {
  it('quita caracteres invisibles y une las tildes a su letra', () => {
    expect(cellText(text('LAP-001\u200b'))).toEqual({ ok: true, value: 'LAP-001' })
    expect(cellText(text('\ufeffImpresio\u0301n'))).toEqual({ ok: true, value: 'Impresión' })
  })

  it('limpia espacios, espacios no separables y saltos de línea', () => {
    expect(cellText(text('  HP  LaserJet\nPro  '))).toEqual({ ok: true, value: 'HP LaserJet Pro' })
    expect(cleanText('Línea 1  \r\n\r\n  Línea  2 ')).toBe('Línea 1\n\nLínea 2')
    expect(cellText(text(' Uno \n Dos '), { multiline: true })).toEqual({
      ok: true,
      value: 'Uno\nDos',
    })
  })

  it('un número entero se escribe sin notación científica; con decimales, en el código es error', () => {
    expect(cellText(number(123456789012), { integerOnly: true })).toEqual({
      ok: true,
      value: '123456789012',
    })
    expect(cellText(number(12.5), { integerOnly: true })).toEqual({
      ok: false,
      error: 'No puede tener decimales. Escríbelo como texto.',
    })
    expect(cellText(number(3.5))).toEqual({ ok: true, value: '3.5' })
  })

  it('fechas y booleanos pasan a texto; la fecha en UTC, sin correr el día', () => {
    expect(cellText({ kind: 'date', value: new Date('2026-10-01T00:00:00Z') })).toEqual({
      ok: true,
      value: '01/10/2026',
    })
    expect(cellText({ kind: 'boolean', value: false })).toEqual({ ok: true, value: 'FALSO' })
  })
})

describe('precios', () => {
  it.each([
    ['1250.50', '1250.50'],
    ['1250,50', '1250.50'],
    ['1,250.50', '1250.50'],
    ['1.250,50', '1250.50'],
    ['S/ 1250.50', '1250.50'],
    ['S/. 99', '99'],
    ['1,299', '1299'],
    ['1.299', '1299'],
    ['12,5', '12.5'],
    ['1,299,000', '1299000'],
  ])('«%s» se lee como %s', (input, expected) => {
    expect(priceText(input)).toBe(expected)
  })

  it('pasa por la regla del formulario y devuelve dos decimales', () => {
    expect(cellPrice(text('S/ 1,250.5'))).toEqual({ ok: true, value: '1250.50' })
    expect(cellPrice(number(1299.8999999))).toEqual({ ok: true, value: '1299.90' })
    expect(cellPrice(number(2590))).toEqual({ ok: true, value: '2590.00' })
    expect(cellPrice({ kind: 'empty' })).toEqual({ ok: true, value: '' })
  })

  it('explica cada precio que no sirve', () => {
    expect(cellPrice(number(12.345))).toEqual({
      ok: false,
      error: 'Tiene más de dos decimales.',
    })
    expect(cellPrice(text('-5'))).toEqual({ ok: false, error: 'Debe ser mayor que cero.' })
    expect(cellPrice(number(0))).toEqual({ ok: false, error: 'Debe ser mayor que cero.' })
    expect(cellPrice(text('0,00'))).toEqual({ ok: false, error: 'Debe ser mayor que cero.' })
    expect(cellPrice(text('abc'))).toEqual({
      ok: false,
      error: 'Escribe solo números con hasta dos decimales, por ejemplo 1250.50.',
    })
    expect(cellPrice(number(12345678901))).toEqual({
      ok: false,
      error: 'No puede pasar de 9,999,999,999.99.',
    })
    expect(cellPrice({ kind: 'boolean', value: true })).toEqual({
      ok: false,
      error: 'Escribe el precio como número, por ejemplo 1250.50.',
    })
  })
})
