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

function Item({ label, children, wide }: { label: string; children: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold wrap-break-word">{children || '—'}</dd>
    </div>
  )
}

// Cómo saldrán estos datos en la proforma (spec §6.2).
export function CompanyPreview({ values }: { values: PreviewValues }) {
  const legal = text(values.legal_name)
  const trade = text(values.trade_name)
  const phones = (values.phones ?? []).map((phone) => text(phone.number)).filter(Boolean)
  const days = Number(values.default_validity_days)
  const validity = Number.isInteger(days) && days >= 1 && days <= 365 ? days : '—'
  const accounts = values.bank_accounts ?? []
  const wallets = values.wallets ?? []

  return (
    <aside
      aria-label="Vista previa"
      className="grid overflow-hidden rounded-[14px] border bg-card text-sm xl:sticky xl:top-8"
    >
      <div className="bg-black px-5 py-4 text-white">
        <p className="text-base font-bold">{trade || legal || 'Nombre de tu empresa'}</p>
        {trade && legal ? <p className="text-xs text-white/70">{legal}</p> : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 border-b px-5 py-4">
        <Item label="RUC">{text(values.ruc)}</Item>
        <Item label="Teléfono">{phones.join(' / ')}</Item>
        <Item label="Dirección" wide>
          {text(values.address)}
        </Item>
        <Item label="Correo" wide>
          {text(values.email)}
        </Item>
      </dl>
      <div className="grid gap-4 px-5 py-4">
        <div>
          <h3 className="mb-1.5 text-[13px] font-bold">Términos y condiciones</h3>
          <ol className="grid list-decimal gap-0.5 pl-5 text-[13px] text-secondary-foreground">
            <li>Validez de la oferta: {validity} días.</li>
            {text(values.payment_terms) ? <li>{text(values.payment_terms)}</li> : null}
            {text(values.return_policy) ? <li>{text(values.return_policy)}</li> : null}
          </ol>
        </div>
        <div className="grid gap-2 text-[13px]">
          <h3 className="font-bold">Cuentas para el pago</h3>
          {accounts.length === 0 && wallets.length === 0 ? (
            <p className="text-muted-foreground">Aún no hay cuentas ni números.</p>
          ) : null}
          {accounts.map((account, index) => (
            <div key={index}>
              <p className="font-semibold">
                {text(account.bank) || 'Banco'} · Cta. {text(account.account) || '—'}
              </p>
              <p>CCI {digitsOnly(account.cci ?? '') || '—'}</p>
              <p className="text-muted-foreground">
                Titular: {text(account.holder) || legal || 'la razón social'}
              </p>
            </div>
          ))}
          {wallets.map((wallet, index) => (
            <p key={index}>
              {walletLabel(wallet.kind ?? 'yape')}:{' '}
              {formatMobile(digitsOnly(wallet.number ?? '')) || '—'}
            </p>
          ))}
        </div>
      </div>
      <p className="border-t px-5 py-2 text-xs text-muted-foreground">
        Así saldrán estos datos en cada proforma.
      </p>
    </aside>
  )
}
