// Resultado de la consulta de RUC (spec §7). Se importa en el cliente: sin secretos.
export type RucCompany = {
  ruc: string
  legalName: string
  address: string | null
  status: string // ACTIVO, BAJA DE OFICIO…
  condition: string // HABIDO, NO HABIDO…
}

export type RucLookupResult =
  { kind: 'found'; company: RucCompany } | { kind: 'not-found' } | { kind: 'unavailable' }

// Aviso no bloqueante si SUNAT no lo tiene activo y habido (spec §4.5).
export const isActiveTaxpayer = (company: RucCompany) =>
  company.status === 'ACTIVO' && company.condition === 'HABIDO'
