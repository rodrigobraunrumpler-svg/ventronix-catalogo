import { describe, expect, it } from 'vitest'
import { readImportRequest } from '@/features/catalog/excel/import-request'
import {
  DEFAULT_IMPORT_OPTIONS,
  FILE_MESSAGES,
  IMPORT_MAX_BYTES,
} from '@/features/catalog/import/options'

function form(file: File | null, options: unknown = DEFAULT_IMPORT_OPTIONS) {
  const data = new FormData()
  if (file) data.set('file', file)
  data.set('options', typeof options === 'string' ? options : JSON.stringify(options))
  return data
}

describe('readImportRequest', () => {
  it('devuelve el archivo y las opciones validadas', () => {
    const file = new File(['x'], 'productos.xlsx')
    const request = readImportRequest(form(file, { ...DEFAULT_IMPORT_OPTIONS, mode: 'update' }))
    expect(request).toMatchObject({ ok: true, options: { mode: 'update', pricesIncludeTax: true } })
  })

  it('sin archivo o con más de 4 MB, con el mensaje de la spec', () => {
    expect(readImportRequest(form(null))).toEqual({ ok: false, message: FILE_MESSAGES.notXlsx })
    const big = new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], 'productos.xlsx')
    expect(readImportRequest(form(big))).toEqual({ ok: false, message: FILE_MESSAGES.tooBig })
  })

  it('rechaza opciones que no valen', () => {
    const file = new File(['x'], 'productos.xlsx')
    const message =
      'Las opciones de la importación no son válidas. Recarga la página e inténtalo de nuevo.'
    expect(readImportRequest(form(file, '{no es json'))).toEqual({ ok: false, message })
    expect(readImportRequest(form(file, { ...DEFAULT_IMPORT_OPTIONS, mode: 'delete' }))).toEqual({
      ok: false,
      message,
    })
  })
})
