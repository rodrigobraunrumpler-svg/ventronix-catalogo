import { Eye } from 'lucide-react'
import Image from 'next/image'
import { digitsOnly } from '@/lib/peru'
import { formatMobile, walletLabel } from '../format'
import type { WalletKind } from '../schemas'

// Lo que se está escribiendo, aún sin validar.
type PreviewValues = {
  legal_name?: string | null
  trade_name?: string | null
  ruc?: string | null
  address?: string | null
  phones?: { number?: string }[]
  email?: string | null
  payment_terms?: string | null
  return_policy?: string | null
  default_validity_days?: unknown
  bank_accounts?: { bank?: string; account?: string; cci?: string; holder?: string | null }[]
  wallets?: { kind?: WalletKind; number?: string }[]
}

const text = (value: string | null | undefined) => value?.trim() ?? ''

// 987654321 → 987 654 321; lo demás, tal como se escribió.
function groupPhone(value: string) {
  const digits = digitsOnly(value)
  return digits.length === 9 ? formatMobile(digits) : value
}

const block = 'grid gap-1 border-b border-[#edf0e8] px-4.5 py-3.5 text-xs text-secondary-foreground'

// Cómo saldrán estos datos en la proforma (spec §6.2 y prototipo). Lo que falta se ve entre
// corchetes, para saber qué completar.
export function CompanyPreview({ values }: { values: PreviewValues }) {
  const legal = text(values.legal_name)
  const trade = text(values.trade_name)
  const phones = (values.phones ?? []).map((phone) => text(phone.number)).filter(Boolean)
  const days = Number(values.default_validity_days)
  const validity = Number.isInteger(days) && days >= 1 && days <= 365 ? days : '—'
  const holder = legal || '[Razón social]'
  const accounts = (values.bank_accounts ?? []).filter((account) =>
    [account.bank, account.account, account.cci].some((value) => text(value)),
  )
  const wallets = (values.wallets ?? []).filter((wallet) => text(wallet.number))

  return (
    <aside
      aria-labelledby="company-preview-title"
      className="overflow-hidden rounded-[14px] border bg-card xl:sticky xl:top-8"
    >
      <h2
        id="company-preview-title"
        className="flex items-center gap-2 border-b px-4.5 py-3.5 text-[13px] font-semibold text-muted-foreground"
      >
        <Eye className="size-3.75" aria-hidden />
        Así saldrá en tus proformas
      </h2>
      <div className="flex items-center justify-between gap-3 bg-black px-4.5 py-3.5">
        <Image
          src="/brand/ventronix-logo-proforma.jpg"
          alt="Ventronix"
          width={132}
          height={75}
          unoptimized
          className="h-auto w-33"
        />
        <span className="text-[13px] font-extrabold tracking-[0.08em] text-white">PROFORMA</span>
      </div>
      <div className={block}>
        <p className="text-sm font-bold text-foreground">
          {[legal || '[Razón social]', trade].filter(Boolean).join(' · ')}
        </p>
        <p>RUC {digitsOnly(values.ruc ?? '') || '[RUC]'}</p>
        <p>{text(values.address) || '[Dirección]'}</p>
        <p>{phones.length > 0 ? `Tel. ${phones.map(groupPhone).join(' / ')}` : '[Teléfonos]'}</p>
        {text(values.email) ? <p>{text(values.email)}</p> : null}
      </div>
      <div className={block}>
        <p className="mb-0.5 font-bold text-foreground">Términos y condiciones</p>
        <p>1. Validez de la oferta: {validity} días.</p>
        <p>2. {text(values.payment_terms) || '[Condición de pago]'}</p>
        <p>3. {text(values.return_policy) || '[Política de devoluciones]'}</p>
      </div>
      <div className="grid gap-1 px-4.5 pt-3.5 pb-4.5 text-xs text-secondary-foreground">
        <p className="mb-0.5 font-bold text-foreground">Cuentas para el pago</p>
        {accounts.map((account, index) => (
          <p key={index}>
            {text(account.bank) || '[Banco]'} · Cta. {text(account.account) || '[número]'}
            {text(account.cci) ? ` · CCI ${digitsOnly(account.cci ?? '')}` : ''} ·{' '}
            {text(account.holder) || holder}
          </p>
        ))}
        {wallets.map((wallet, index) => (
          <p key={index} className="font-semibold text-foreground">
            {walletLabel(wallet.kind ?? 'yape')}: {groupPhone(text(wallet.number))}
          </p>
        ))}
        {accounts.length === 0 && wallets.length === 0 ? (
          <p className="text-muted-foreground">[Añade una cuenta o un número de Yape o Plin]</p>
        ) : null}
      </div>
    </aside>
  )
}
