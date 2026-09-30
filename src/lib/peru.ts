// Documentos y teléfonos de Perú. Sin dependencias: se usa en el cliente y en el servidor.
export const digitsOnly = (value: string) => value.replace(/\D/g, '')

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

// RUC: prefijo de contribuyente (10, 15, 17 o 20), 11 dígitos y dígito verificador (módulo 11).
export function isValidRuc(value: string) {
  if (!/^(10|15|17|20)\d{9}$/.test(value)) return false
  const sum = RUC_WEIGHTS.reduce((total, weight, index) => total + weight * Number(value[index]), 0)
  const check = 11 - (sum % 11)
  return (check === 10 ? 0 : check === 11 ? 1 : check) === Number(value[10])
}

export function documentKind(value: string): 'ruc' | 'dni' | null {
  if (/^\d{11}$/.test(value)) return 'ruc'
  if (/^\d{8}$/.test(value)) return 'dni'
  return null
}

// Opcional en la proforma: vacío no es error (spec §4.3).
export function documentError(value: string) {
  if (value === '') return null
  const kind = documentKind(value)
  if (kind === null) return 'Escribe 8 dígitos para DNI u 11 para RUC.'
  if (kind === 'ruc' && !isValidRuc(value)) return 'Este RUC no es válido. Revisa los 11 dígitos.'
  return null
}

export const isValidMobile = (value: string) => /^9\d{8}$/.test(value)
