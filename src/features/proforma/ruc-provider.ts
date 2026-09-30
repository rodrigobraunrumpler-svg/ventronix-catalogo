import 'server-only'
import { z } from 'zod'
import type { RucLookupResult } from './ruc'

// Proveedor intercambiable (spec §7): Decolecta en producción y uno de prueba en las e2e.
export type RucProvider = {
  lookup: (ruc: string, signal: AbortSignal) => Promise<RucLookupResult>
}

const decolectaSchema = z.object({
  razon_social: z.string(),
  numero_documento: z.string(),
  estado: z.string(),
  condicion: z.string(),
  direccion: z.string().nullish(),
  distrito: z.string().nullish(),
  provincia: z.string().nullish(),
  departamento: z.string().nullish(),
})

function present(value: string | null | undefined) {
  const text = value?.trim()
  return text && text !== '-' ? text : null
}

export function decolectaProvider(token: string, fetcher: typeof fetch = fetch): RucProvider {
  return {
    async lookup(ruc, signal) {
      try {
        const response = await fetcher(`https://api.decolecta.com/v1/sunat/ruc?numero=${ruc}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
          cache: 'no-store',
        })
        if (response.status === 404 || response.status === 422) return { kind: 'not-found' }
        if (!response.ok) return { kind: 'unavailable' }
        const data = decolectaSchema.parse(await response.json())
        const address = [data.direccion, data.distrito, data.provincia, data.departamento]
          .map(present)
          .filter(Boolean)
          .join(', ')
        return {
          kind: 'found',
          company: {
            ruc: data.numero_documento,
            legalName: data.razon_social,
            address: address || null,
            status: data.estado,
            condition: data.condicion,
          },
        }
      } catch (error) {
        // Corte, tiempo agotado o respuesta inesperada: se escribe a mano. Nunca se registra la clave.
        console.error('[proforma] consulta de RUC:', error instanceof Error ? error.name : error)
        return { kind: 'unavailable' }
      }
    },
  }
}

const stubCompany = (
  ruc: string,
  legalName: string,
  status = 'ACTIVO',
  condition = 'HABIDO',
): RucLookupResult => ({
  kind: 'found',
  company: {
    ruc,
    legalName,
    address: 'AV. PRUEBA 123, HUAMANGA, HUAMANGA, AYACUCHO',
    status,
    condition,
  },
})

// Solo para pruebas automáticas y desarrollo (RUC_PROVIDER=stub). Cualquier otro RUC: no encontrado.
const STUB_RESULTS: Record<string, RucLookupResult> = {
  '20000000001': stubCompany('20000000001', 'EMPRESA DE PRUEBA S.A.C.'),
  '20000000010': stubCompany(
    '20000000010',
    'EMPRESA INACTIVA S.R.L.',
    'BAJA DE OFICIO',
    'NO HABIDO',
  ),
  '20000000036': { kind: 'unavailable' },
}

export const stubRucProvider: RucProvider = {
  lookup: async (ruc) => STUB_RESULTS[ruc] ?? { kind: 'not-found' },
}

const unavailableProvider: RucProvider = { lookup: async () => ({ kind: 'unavailable' }) }

export function getRucProvider(env: Record<string, string | undefined> = process.env): RucProvider {
  if (env.RUC_PROVIDER === 'stub' && env.NODE_ENV !== 'production') return stubRucProvider
  return env.DECOLECTA_TOKEN ? decolectaProvider(env.DECOLECTA_TOKEN) : unavailableProvider
}
