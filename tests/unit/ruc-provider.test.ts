import { describe, expect, it, vi } from 'vitest'
import { isActiveTaxpayer } from '@/features/proforma/ruc'
import {
  decolectaProvider,
  getRucProvider,
  stubRucProvider,
} from '@/features/proforma/ruc-provider'

const signal = new AbortController().signal
const sunat = {
  razon_social: 'EMPRESA DE PRUEBA S.A.C.',
  numero_documento: '20000000001',
  estado: 'ACTIVO',
  condicion: 'HABIDO',
  direccion: 'AV. PRUEBA 123',
  distrito: 'AYACUCHO',
  provincia: 'HUAMANGA',
  departamento: 'AYACUCHO',
}
const respond = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))

describe('decolectaProvider', () => {
  it('devuelve razón social, dirección completa, estado y condición', async () => {
    const fetcher = respond(200, sunat)
    const result = await decolectaProvider('clave', fetcher).lookup('20000000001', signal)
    expect(result).toEqual({
      kind: 'found',
      company: {
        ruc: '20000000001',
        legalName: 'EMPRESA DE PRUEBA S.A.C.',
        address: 'AV. PRUEBA 123, AYACUCHO, HUAMANGA, AYACUCHO',
        status: 'ACTIVO',
        condition: 'HABIDO',
      },
    })
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.decolecta.com/v1/sunat/ruc?numero=20000000001')
    expect(init?.headers).toEqual({ Authorization: 'Bearer clave' })
  })

  it('omite las partes de la dirección que SUNAT marca con «-»', async () => {
    const fetcher = respond(200, {
      ...sunat,
      direccion: '-',
      distrito: '-',
      provincia: '',
      departamento: null,
    })
    const result = await decolectaProvider('clave', fetcher).lookup('20000000001', signal)
    expect(result).toMatchObject({ kind: 'found', company: { address: null } })
  })

  it.each([
    [404, 'not-found'],
    [422, 'not-found'],
    [400, 'unavailable'],
    [500, 'unavailable'],
  ])('HTTP %i → %s', async (status, kind) => {
    expect(await decolectaProvider('clave', respond(status)).lookup('20000000001', signal)).toEqual(
      {
        kind,
      },
    )
  })

  it('una respuesta con otra forma, un corte o el tiempo agotado → no disponible', async () => {
    const odd = respond(200, { mensaje: 'otra cosa' })
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    const slow = vi.fn<typeof fetch>(async () => {
      throw new DOMException('The operation was aborted.', 'TimeoutError')
    })
    for (const fetcher of [odd, offline, slow]) {
      expect(await decolectaProvider('clave', fetcher).lookup('20000000001', signal)).toEqual({
        kind: 'unavailable',
      })
    }
  })
})

describe('getRucProvider', () => {
  it('el proveedor de prueba solo se usa fuera de producción', async () => {
    expect(getRucProvider({ RUC_PROVIDER: 'stub', NODE_ENV: 'development' })).toBe(stubRucProvider)
    const production = getRucProvider({ RUC_PROVIDER: 'stub', NODE_ENV: 'production' })
    expect(production).not.toBe(stubRucProvider)
    expect(await production.lookup('20000000001', signal)).toEqual({ kind: 'unavailable' })
  })

  it('sin clave de Decolecta, la consulta no está disponible', async () => {
    expect(await getRucProvider({}).lookup('20000000001', signal)).toEqual({ kind: 'unavailable' })
  })

  it('los RUC de prueba cubren activo, de baja, sin servicio y no encontrado', async () => {
    const kinds = await Promise.all(
      ['20000000001', '20000000010', '20000000036', '20000000028'].map((ruc) =>
        stubRucProvider.lookup(ruc, signal),
      ),
    )
    expect(kinds.map((result) => result.kind)).toEqual([
      'found',
      'found',
      'unavailable',
      'not-found',
    ])
  })
})

describe('isActiveTaxpayer', () => {
  it('solo ACTIVO y HABIDO es un contribuyente activo', () => {
    const company = {
      ruc: '20000000001',
      legalName: 'X',
      address: null,
      status: 'ACTIVO',
      condition: 'HABIDO',
    }
    expect(isActiveTaxpayer(company)).toBe(true)
    expect(isActiveTaxpayer({ ...company, condition: 'NO HABIDO' })).toBe(false)
    expect(isActiveTaxpayer({ ...company, status: 'BAJA DE OFICIO' })).toBe(false)
  })
})
