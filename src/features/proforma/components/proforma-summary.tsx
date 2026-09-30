'use client'

import type { ReactNode } from 'react'
import { patchConditions } from '../draft'
import { formatCents, ZERO } from '../money'
import { discountError, shippingError } from '../readiness'
import { useProforma } from '../store'
import { TAX_CONFIG } from '../tax'
import { totalsFromText, type Totals } from '../totals'

const amountInput =
  'h-9 w-24 rounded-lg border border-input bg-card px-2.5 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-secondary-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

function taxNote(totals: Totals) {
  const parts = totals.pricesIncludeTax ? ['Precios incluyen IGV'] : []
  if (totals.showBreakdown) {
    parts.push(
      `Op. gravada S/ ${formatCents(totals.base)}`,
      `IGV (${TAX_CONFIG.ratePercent}%) S/ ${formatCents(totals.tax)}`,
    )
  }
  return parts.join(' · ')
}

// Total parcial, descuento %, neto, envío, total y desglose del IGV (spec §4.3).
export function ProformaSummary() {
  const { draft, update } = useProforma()
  const totals = totalsFromText(draft)
  const discountProblem = discountError(draft.discountPercent)
  const shippingProblem = shippingError(draft.shipping)
  const money = (value: bigint | undefined) =>
    value === undefined ? '—' : `S/ ${formatCents(value)}`

  return (
    <section
      aria-labelledby="proforma-summary-title"
      className="grid gap-2.5 rounded-[14px] border bg-background/60 p-4 text-sm"
    >
      <h3 id="proforma-summary-title" className="text-sm font-bold">
        Resumen
      </h3>
      <Row label="Total parcial">{money(totals?.subtotal)}</Row>
      <Row label={<label htmlFor="proforma-discount">Descuento (%)</label>}>
        <input
          id="proforma-discount"
          className={amountInput}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={draft.discountPercent}
          aria-invalid={discountProblem ? true : undefined}
          aria-describedby={discountProblem ? 'proforma-discount-error' : undefined}
          onChange={(event) =>
            update((current) => patchConditions(current, { discountPercent: event.target.value }))
          }
        />
      </Row>
      {discountProblem ? (
        <p id="proforma-discount-error" className="text-right text-xs font-medium text-destructive">
          {discountProblem}
        </p>
      ) : null}
      {totals && totals.discount > ZERO ? (
        <Row label="Descuento">− S/ {formatCents(totals.discount)}</Row>
      ) : null}
      <Row label="Neto">{money(totals?.net)}</Row>
      <Row label={<label htmlFor="proforma-shipping">Envío (S/)</label>}>
        <input
          id="proforma-shipping"
          className={amountInput}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={draft.shipping}
          aria-invalid={shippingProblem ? true : undefined}
          aria-describedby={shippingProblem ? 'proforma-shipping-error' : undefined}
          onChange={(event) =>
            update((current) => patchConditions(current, { shipping: event.target.value }))
          }
        />
      </Row>
      {shippingProblem ? (
        <p id="proforma-shipping-error" className="text-right text-xs font-medium text-destructive">
          {shippingProblem}
        </p>
      ) : null}
      <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-foreground px-3 py-2.5 text-background">
        <span className="font-bold">Total</span>
        <span className="text-lg font-extrabold text-primary tabular-nums">
          {money(totals?.total)}
        </span>
      </div>
      {totals ? (
        <p className="text-right text-xs text-muted-foreground">{taxNote(totals)}</p>
      ) : null}
    </section>
  )
}
