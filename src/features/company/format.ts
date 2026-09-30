import type { CompanyProfile, WalletKind } from './schemas'

const WALLET_LABELS: Record<WalletKind, string> = {
  yape: 'Yape',
  plin: 'Plin',
  ambos: 'Yape / Plin',
}

// Como lo muestra el documento: «Yape: …», «Plin: …» o «Yape / Plin: …» (spec §6.2).
export const walletLabel = (kind: WalletKind) => WALLET_LABELS[kind]

export const formatMobile = (digits: string) =>
  digits.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3')

// Lo que el documento necesita sí o sí (spec §6.2).
export function missingCompanyFields(profile: CompanyProfile) {
  const missing: string[] = []
  if (!profile.legal_name) missing.push('razón social')
  if (!profile.ruc) missing.push('RUC')
  if (!profile.address) missing.push('dirección')
  if (profile.phones.length === 0) missing.push('teléfono')
  return missing
}
