import { formatMobile, missingCompanyFields, walletLabel } from '@/features/company/format'
import type { CompanyProfile } from '@/features/company/schemas'
import { digitsOnly, documentKind } from '@/lib/peru'
import { formatCents, parseCents, parsePercent, ZERO } from '../money'
import { formatProformaNumber } from '../number'
import { clientErrors, validityError } from '../readiness'
import { TAX_CONFIG } from '../tax'
import { totalsFromText } from '../totals'
import { documentDates, documentFileName } from './format'
import type { DocumentInput } from './input'
import { amountInWords } from './words'

type Pair = { label: string; value: string }

// Textos del documento, listos para dibujar (spec del documento §4).
export type DocumentModel = {
  draft: boolean
  title: string
  author: string
  fileName: string
  numberLabel: string | null
  date: string
  validUntil: string
  company: Pair[]
  // Pesos de la pizarra: el cliente en negrita, su RUC o DNI seminegrita, lo demás normal.
  client: (Pair & { weight: 400 | 600 | 700 })[]
  rows: {
    quantity: string
    code: string
    name: string
    description: string | null
    unitPrice: string
    total: string
  }[]
  adjustments: Pair[]
  total: string
  taxNote: string | null
  amountInWords: string
  terms: string[]
  payments: string[]
}

const money = (cents: bigint) => `S/ ${formatCents(cents)}`

// Celulares de 9 dígitos agrupados («987 654 321»); lo demás, tal como se escribió.
function phoneLabel(value: string) {
  const digits = digitsOnly(value)
  return digits.length === 9 ? formatMobile(digits) : value.trim()
}

// 5 → «5%», 12,5 → «12.5%».
const percentLabel = (text: string) => `${(parsePercent(text) ?? 0) / 100}%`

// Por qué no se puede generar el documento; null si se puede (spec del documento §8). El borrador
// solo necesita cifras válidas: sirve para ver cómo va quedando.
export function documentProblem(input: DocumentInput, company: CompanyProfile) {
  const totals = totalsFromText(input)
  if (!totals || totals.total <= ZERO || !totals.withinLimit) {
    return 'Revisa las cantidades, los precios y los totales.'
  }
  if (input.draft) return null
  if (missingCompanyFields(company).length > 0) {
    return 'Completa los datos de tu empresa antes de generar el documento.'
  }
  const client = clientErrors(input.client)
  if (client.name || client.document || client.phone || validityError(input.validityDays)) {
    return 'Completa los datos del cliente.'
  }
  if (input.number === null) return 'Genera la proforma para asignarle su número.'
  return null
}

export function buildDocumentModel(
  input: DocumentInput,
  company: CompanyProfile,
  now: Date,
): DocumentModel {
  const totals = totalsFromText(input)
  if (!totals) throw new Error('La proforma no es válida.')
  const validityDays = Number(input.validityDays || company.default_validity_days)
  const issued = input.issuedAt ? new Date(input.issuedAt) : now
  const { date, validUntil } = documentDates(issued, validityDays)
  const numberLabel = input.number === null ? null : formatProformaNumber(input.number)
  const hasDiscount = totals.discount > ZERO
  const hasShipping = totals.shipping > ZERO
  const tax = totals.pricesIncludeTax ? ['Precios incluyen IGV'] : []
  if (totals.showBreakdown) {
    tax.push(
      `Op. gravada ${money(totals.base)}`,
      `IGV (${TAX_CONFIG.ratePercent}%) ${money(totals.tax)}`,
    )
  }

  return {
    draft: input.draft,
    title: numberLabel ? `Proforma ${numberLabel}` : 'Proforma (borrador)',
    author: company.trade_name || company.legal_name || 'Ventronix',
    fileName: documentFileName(input.draft ? null : input.number, input.client.name),
    numberLabel,
    date,
    validUntil,
    company: [
      { label: 'RUC', value: company.ruc ?? '' },
      { label: 'Dirección', value: company.address ?? '' },
      { label: 'Teléfono', value: company.phones.map(phoneLabel).join(' / ') },
      { label: 'Correo', value: company.email ?? '' },
    ].filter((item) => item.value),
    client: (
      [
        { label: 'Cliente', value: input.client.name.trim(), weight: 700 },
        {
          label: documentKind(input.client.document) === 'dni' ? 'DNI' : 'RUC',
          value: input.client.document,
          weight: 600,
        },
        { label: 'Dirección', value: input.client.address.trim(), weight: 400 },
        { label: 'Celular', value: phoneLabel(input.client.phone), weight: 400 },
        { label: 'Tiempo de entrega', value: input.client.deliveryTime.trim(), weight: 400 },
      ] satisfies DocumentModel['client']
    ).filter((item) => item.value),
    rows: input.lines.map((line, index) => ({
      quantity: String(line.quantity),
      code: line.code,
      name: line.name,
      description: line.description?.trim() || null,
      unitPrice: formatCents(parseCents(line.unitPrice) ?? ZERO),
      total: formatCents(totals.lineTotals[index]),
    })),
    adjustments: [
      ...(hasDiscount || hasShipping
        ? [{ label: 'Total parcial', value: money(totals.subtotal) }]
        : []),
      ...(hasDiscount
        ? [
            {
              label: `Descuento (${percentLabel(input.discountPercent)})`,
              value: `− ${money(totals.discount)}`,
            },
            { label: 'Neto', value: money(totals.net) },
          ]
        : []),
      ...(hasShipping ? [{ label: 'Envío', value: money(totals.shipping) }] : []),
    ],
    total: money(totals.total),
    taxNote: tax.length > 0 ? tax.join(' · ') : null,
    amountInWords: amountInWords(totals.total),
    terms: [
      `Validez de la oferta: ${validityDays} días.`,
      company.payment_terms,
      company.return_policy,
    ].filter((term): term is string => Boolean(term)),
    payments: [
      // Como la pizarra: «Banco · Cta. …» y debajo «CCI …»; el titular solo si no es la empresa.
      ...company.bank_accounts.flatMap((account) => [
        `${account.bank} · Cta. ${account.account}`,
        `CCI ${account.cci}`,
        ...(account.holder && account.holder !== company.legal_name
          ? [`Titular: ${account.holder}`]
          : []),
      ]),
      ...company.wallets.map(
        (wallet) => `${walletLabel(wallet.kind)}: ${formatMobile(wallet.number)}`,
      ),
    ],
  }
}
