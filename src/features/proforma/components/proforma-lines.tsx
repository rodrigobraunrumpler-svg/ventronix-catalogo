'use client'

import { Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/features/catalog/money'
import { cn } from '@/lib/utils'
import {
  applyCatalogPrice,
  restorePrice,
  setQuantity,
  setUnitPrice,
  type ProformaLine,
} from '../draft'
import { formatCents, parseCents } from '../money'
import { priceError, quantityError } from '../readiness'
import { useProforma, useRemoveLine } from '../store'
import { MAX_QUANTITY } from '../totals'

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-2'

export function ProformaLines({
  prices,
  onContinue,
}: {
  prices: Map<string, string> | undefined
  onContinue: () => void
}) {
  const { draft } = useProforma()
  return (
    <section aria-labelledby="proforma-lines-title" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="proforma-lines-title" className="text-sm font-bold">
          Productos
        </h3>
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onContinue}>
          Seguir eligiendo productos
        </Button>
      </div>
      {draft.lines.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Aún no hay productos. Vuelve a la lista y pulsa «Añadir».
        </p>
      ) : (
        <ul className="grid gap-2">
          {draft.lines.map((line) => (
            <LineRow
              key={line.productId}
              line={line}
              currentPrice={prices?.get(line.productId)}
              missing={prices !== undefined && !prices.has(line.productId)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function LineRow({
  line,
  currentPrice,
  missing,
}: {
  line: ProformaLine
  currentPrice: string | undefined
  missing: boolean
}) {
  const { update } = useProforma()
  const removeLine = useRemoveLine()
  const id = `line-${line.productId}`
  const quantityProblem = quantityError(line.quantity)
  const priceProblem = priceError(line.unitPrice)
  const cents = parseCents(line.unitPrice)
  const total =
    !quantityProblem && !priceProblem && cents !== null
      ? `S/ ${formatCents(BigInt(line.quantity) * cents)}`
      : '—'
  const edited = cents !== parseCents(line.catalogPrice)
  // Precio del catálogo distinto del que tenía al añadirlo (spec §4.5).
  const newPrice =
    currentPrice !== undefined && currentPrice !== line.catalogPrice ? currentPrice : null
  const change = (quantity: number) =>
    update((current) => setQuantity(current, line.productId, quantity))

  return (
    <li className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 font-semibold" title={line.name}>
            {line.name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{line.code}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Quitar ${line.name}`}
          title="Quitar"
          className="hover:bg-destructive/10 hover:text-destructive"
          onClick={() => removeLine(line.productId)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            'inline-flex items-center rounded-lg border bg-card',
            quantityProblem && 'border-destructive',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Una unidad menos de ${line.name}`}
            disabled={line.quantity <= 1}
            onClick={() => change(line.quantity - 1)}
          >
            <Minus aria-hidden />
          </Button>
          <input
            id={`${id}-quantity`}
            aria-label={`Cantidad de ${line.name}`}
            aria-invalid={quantityProblem ? true : undefined}
            aria-describedby={quantityProblem ? `${id}-quantity-error` : undefined}
            inputMode="numeric"
            autoComplete="off"
            value={line.quantity === 0 ? '' : String(line.quantity)}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, 5)
              change(digits === '' ? 0 : Number(digits))
            }}
            className="h-9 w-14 bg-transparent text-center font-semibold tabular-nums outline-none"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Una unidad más de ${line.name}`}
            disabled={line.quantity >= MAX_QUANTITY}
            onClick={() => change(line.quantity + 1)}
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <div
          className={cn(
            'flex h-9 overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
            priceProblem && 'border-destructive ring-3 ring-destructive/20',
          )}
        >
          <span className="grid place-items-center border-r bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
            S/
          </span>
          <input
            id={`${id}-price`}
            aria-label={`Precio unitario de ${line.name}`}
            aria-invalid={priceProblem ? true : undefined}
            aria-describedby={priceProblem ? `${id}-price-error` : undefined}
            inputMode="decimal"
            autoComplete="off"
            value={line.unitPrice}
            onChange={(event) =>
              update((current) => setUnitPrice(current, line.productId, event.target.value))
            }
            className="w-28 min-w-0 bg-transparent px-2.5 text-right tabular-nums outline-none"
          />
        </div>
        <p className="ml-auto text-right whitespace-nowrap tabular-nums">
          <span className="mr-1 text-xs text-muted-foreground">Total</span>
          <span className="font-bold">{total}</span>
        </p>
      </div>
      {quantityProblem ? (
        <p id={`${id}-quantity-error`} className="text-xs font-medium text-destructive">
          Cantidad: {quantityProblem}
        </p>
      ) : null}
      {priceProblem ? (
        <p id={`${id}-price-error`} className="text-xs font-medium text-destructive">
          {priceProblem}
        </p>
      ) : null}
      {edited ? (
        <p className="text-xs text-muted-foreground">
          Catálogo S/ {formatPrice(line.catalogPrice)} ·{' '}
          <button
            type="button"
            className={inlineAction}
            onClick={() => update((current) => restorePrice(current, line.productId))}
          >
            Restaurar
          </button>
        </p>
      ) : null}
      {newPrice ? (
        <p className="text-xs text-amber-800">
          El precio del catálogo cambió a S/ {formatPrice(newPrice)} ·{' '}
          <button
            type="button"
            className={inlineAction}
            onClick={() =>
              update((current) => applyCatalogPrice(current, line.productId, newPrice))
            }
          >
            Actualizar
          </button>
        </p>
      ) : null}
      {missing ? (
        <p className="text-xs text-amber-800">
          Ya no está en el catálogo. Puedes quitarlo o mantenerlo con estos datos.
        </p>
      ) : null}
    </li>
  )
}
