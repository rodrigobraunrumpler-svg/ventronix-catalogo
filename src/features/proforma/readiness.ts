import { missingCompanyFields } from '@/features/company/format'
import type { CompanyProfile } from '@/features/company/schemas'
import { digitsOnly, documentError, isValidMobile } from '@/lib/peru'
import type { ProformaClient, ProformaDraft } from './draft'
import { parseCents, parsePercent, ZERO } from './money'
import { isValidQuantity, totalsFromText } from './totals'

export type CompanyStatus =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; profile: CompanyProfile }

export const quantityError = (quantity: number) =>
  isValidQuantity(quantity) ? null : 'De 1 a 9 999.'

export function priceError(text: string) {
  const cents = parseCents(text)
  return cents !== null && cents > ZERO
    ? null
    : 'Escribe un precio mayor que cero, con hasta dos decimales.'
}

export const discountError = (text: string) =>
  text.trim() === '' || parsePercent(text) !== null
    ? null
    : 'De 0 a 100 %, con hasta dos decimales.'

export const shippingError = (text: string) =>
  text.trim() === '' || parseCents(text) !== null
    ? null
    : 'Escribe un monto con hasta dos decimales.'

// Vacío usa la validez por defecto de la empresa.
export function validityError(text: string) {
  const value = text.trim()
  if (value === '') return null
  return /^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 365
    ? null
    : 'De 1 a 365 días.'
}

export function clientErrors(client: ProformaClient) {
  const phone = client.phone.trim()
  return {
    name: client.name.trim() === '' ? 'Escribe la razón social o el nombre del cliente.' : null,
    document: documentError(client.document),
    phone:
      phone === '' || (/^[\d ]+$/.test(phone) && isValidMobile(digitsOnly(phone)))
        ? null
        : 'Escribe un celular de 9 dígitos que empiece por 9.',
  }
}

const listFormat = new Intl.ListFormat('es', { type: 'conjunction' })

// Por qué «Generar proforma» sigue deshabilitado (spec §4.3); null si se puede generar.
export function generateBlocker(
  draft: ProformaDraft,
  company: CompanyStatus,
): { message: string; companyLink?: true } | null {
  if (draft.lines.length === 0) return { message: 'Añade al menos un producto.' }
  if (draft.lines.some((line) => quantityError(line.quantity) || priceError(line.unitPrice))) {
    return { message: 'Revisa las cantidades y los precios.' }
  }
  if (discountError(draft.discountPercent) || shippingError(draft.shipping)) {
    return { message: 'Revisa el descuento y el envío.' }
  }
  const client = clientErrors(draft.client)
  if (client.name || client.document || client.phone || validityError(draft.validityDays)) {
    return { message: 'Completa los datos del cliente.' }
  }
  const totals = totalsFromText(draft)
  if (!totals || totals.total <= ZERO) return { message: 'El total debe ser mayor que cero.' }
  if (!totals.withinLimit) return { message: 'El total no puede llegar a S/ 10,000,000,000.' }
  if (company.status === 'loading') return { message: 'Cargando los datos de tu empresa…' }
  if (company.status === 'error') {
    return {
      message: 'No pudimos cargar los datos de tu empresa. Cierra la ventana e inténtalo de nuevo.',
    }
  }
  const missing = missingCompanyFields(company.profile)
  if (missing.length > 0) {
    return {
      message: `Completa los datos de tu empresa: ${listFormat.format(missing)}.`,
      companyLink: true,
    }
  }
  return null
}

// Al abrir la ventana, el foco va al primer campo pendiente (spec §4.3).
export function firstPendingField(draft: ProformaDraft) {
  for (const line of draft.lines) {
    if (quantityError(line.quantity)) return `line-${line.id}-quantity`
    if (priceError(line.unitPrice)) return `line-${line.id}-price`
  }
  const client = clientErrors(draft.client)
  if (client.name) return 'client-name'
  if (client.document) return 'client-document'
  if (client.phone) return 'client-phone'
  if (validityError(draft.validityDays)) return 'client-validity'
  if (discountError(draft.discountPercent)) return 'proforma-discount'
  if (shippingError(draft.shipping)) return 'proforma-shipping'
  return 'generate-proforma'
}
