'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { patchConditions } from '../draft'
import { formatCents, ZERO } from '../money'
import { discountError, shippingError } from '../readiness'
import { useProforma } from '../store'
import { TAX_CONFIG } from '../tax'
import { totalsFromText } from '../totals'

const addon =
  'inline-flex h-8.5 overflow-hidden rounded-[9px] border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50'
const addonLabel =
  'grid place-items-center bg-muted px-1.75 text-[13px] font-semibold text-muted-foreground'
const amount = 'font-semibold text-foreground tabular-nums'

// Tarjeta del resumen (spec §4.3 y prototipo): totales, IGV y, al pie, lo que se le pase (el botón
// «Generar proforma» y su motivo). En PC queda fija arriba mientras se baja por los productos y el
// cliente: el total y «Generar» siempre a la vista, también en la pantalla baja de un laptop.
export function ProformaSummary({ children }: { children: ReactNode }) {
  const { draft, update } = useProforma()
  const totals = totalsFromText(draft)
  const discountProblem = discountError(draft.discountPercent)
  const shippingProblem = shippingError(draft.shipping)
  const money = (value: bigint | undefined) =>
    value === undefined ? '—' : `S/ ${formatCents(value)}`

  return (
    <section
      aria-labelledby="proforma-summary-title"
      className="flex flex-col self-start rounded-[14px] border bg-[#fafbf8] text-sm lg:sticky lg:top-0"
    >
      <h3 id="proforma-summary-title" className="px-4.5 pt-4 text-sm font-bold text-foreground">
        Resumen
      </h3>
      <div className="grid gap-3 px-4.5 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <span>Total parcial</span>
          <span className={amount}>{money(totals?.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <label htmlFor="proforma-discount">Descuento</label>
            <span className={cn(addon, discountProblem && 'border-destructive')}>
              <input
                id="proforma-discount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={draft.discountPercent}
                aria-invalid={discountProblem ? true : undefined}
                aria-describedby={discountProblem ? 'proforma-discount-error' : undefined}
                onChange={(event) =>
                  update((current) =>
                    patchConditions(current, { discountPercent: event.target.value }),
                  )
                }
                className="w-11.5 bg-transparent px-1.5 text-right text-foreground tabular-nums outline-none"
              />
              <span className={cn(addonLabel, 'border-l')}>%</span>
            </span>
          </span>
          <span className={amount}>
            {totals && totals.discount > ZERO ? (
              <>− S/ {formatCents(totals.discount)}</>
            ) : (
              money(totals ? ZERO : undefined)
            )}
          </span>
        </div>
        {discountProblem ? (
          <p id="proforma-discount-error" className="text-xs font-medium text-destructive">
            {discountProblem}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span>Neto</span>
          <span className={amount}>{money(totals?.net)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="proforma-shipping">Envío</label>
          <span className={cn(addon, shippingProblem && 'border-destructive')}>
            <span className={cn(addonLabel, 'border-r')}>S/</span>
            <input
              id="proforma-shipping"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={draft.shipping}
              aria-invalid={shippingProblem ? true : undefined}
              aria-describedby={shippingProblem ? 'proforma-shipping-error' : undefined}
              onChange={(event) =>
                update((current) => patchConditions(current, { shipping: event.target.value }))
              }
              className="w-19.5 bg-transparent px-1.75 text-right text-foreground tabular-nums outline-none"
            />
          </span>
        </div>
        {shippingProblem ? (
          <p id="proforma-shipping-error" className="text-xs font-medium text-destructive">
            {shippingProblem}
          </p>
        ) : null}
      </div>

      <div className="mx-4.5 flex items-baseline justify-between gap-3 border-t pt-3.5 pb-3">
        <span className="text-[15px] font-bold text-foreground">Total</span>
        <span className="text-[26px] font-extrabold tracking-[-0.02em] text-foreground tabular-nums">
          {money(totals?.total)}
        </span>
      </div>
      {totals && (totals.pricesIncludeTax || totals.showBreakdown) ? (
        <div className="mx-4.5 grid gap-1 rounded-[10px] border border-[#edf0e8] bg-card px-3 py-2.5 text-xs">
          {totals.pricesIncludeTax ? (
            <p className="font-semibold text-foreground">Precios incluyen IGV</p>
          ) : null}
          {totals.showBreakdown ? (
            <>
              <div className="flex justify-between gap-3">
                <span>Op. gravada</span>
                <span className="tabular-nums">S/ {formatCents(totals.base)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>IGV ({TAX_CONFIG.ratePercent}%)</span>
                <span className="tabular-nums">S/ {formatCents(totals.tax)}</span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2 px-4.5 pt-4 pb-4.5">{children}</div>
    </section>
  )
}
