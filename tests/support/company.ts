import type { CompanyProfile } from '@/features/company/schemas'

// Como la crea la migración: sin datos y con 7 días de validez.
export const emptyCompany: CompanyProfile = {
  legal_name: null,
  trade_name: null,
  ruc: null,
  address: null,
  phones: [],
  email: null,
  payment_terms: null,
  return_policy: null,
  default_validity_days: 7,
  bank_accounts: [],
  wallets: [],
  updated_at: '2026-09-30T00:00:00Z',
}

// Solo lo obligatorio (spec §6.2): razón social, RUC, dirección y un teléfono.
export const completeCompany: CompanyProfile = {
  ...emptyCompany,
  legal_name: 'Empresa de Pruebas S.A.C.',
  ruc: '20000000001',
  address: 'Av. Prueba 123, Huamanga',
  phones: ['066 312345'],
}
