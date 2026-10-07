'use client'

import { Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'
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
import { ProformaProductSearch, type SearchProducts } from './proforma-product-search'

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3'

export function ProformaLines({
  prices,
  onContinue,
  searchProducts,
}: {
  prices: Map<string, string> | undefined
  onContinue: () => void
  searchProducts: SearchProducts
}) {
  const { draft } = useProforma()
  return (
    <section aria-labelledby="proforma-lines-title">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3
          id="proforma-lines-title"
          className="flex items-center gap-2 text-sm font-bold text-foreground"
        >
          Productos
          <span className="rounded-full bg-muted px-2 font-mono text-xs font-medium text-muted-foreground">
            {draft.lines.length}
          </span>
        </h3>
        <button type="button" className={cn(inlineAction, 'text-[13px]')} onClick={onContinue}>
          Seguir eligiendo productos
        </button>
      </div>
      <ProformaProductSearch searchProducts={searchProducts} />
      {draft.lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-input p-6 text-center text-muted-foreground">
          La proforma está vacía. Busca los productos aquí arriba o elígelos en la lista.
        </p>
      ) : (
        <ul className="grid rounded-xl border">
          {draft.lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              // Un producto libre no se compara con el catálogo (spec de productos libres §4.3).
              currentPrice={line.productId ? prices?.get(line.productId) : undefined}
              missing={
                prices !== undefined && line.productId !== null && !prices.has(line.productId)
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}

// PC: nombre, cantidad, precio, total y quitar en una fila (prototipo). Móvil: el nombre arriba y
// los controles debajo.
function LineRow({
  line,
  currentPrice,
  missing,
}: {
  line: ProformaLine
  currentPrice: string | undefined
  missing: boolean
}) {
  // El nombre despliega el producto completo, tal como se copió al añadirlo: el nombre sin cortar
  // y su descripción, que es la que saldrá en el documento.
  const [open, setOpen] = useState(false)
  const { update } = useProforma()
  const removeLine = useRemoveLine()
  const id = `line-${line.id}`
  const quantityProblem = quantityError(line.quantity)
  const priceProblem = priceError(line.unitPrice)
  const cents = parseCents(line.unitPrice)
  const total =
    !quantityProblem && !priceProblem && cents !== null
      ? `S/ ${formatCents(BigInt(line.quantity) * cents)}`
      : '—'
  const catalogPrice = line.catalogPrice
  // Precio del catálogo distinto del que tenía al añadirlo (spec §4.5).
  const newPrice =
    currentPrice !== undefined && currentPrice !== line.catalogPrice ? currentPrice : null
  const change = (quantity: number) => update((current) => setQuantity(current, line.id, quantity))

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-[#edf0e8] py-3 pr-3 pl-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_118px_132px_104px_36px]">
      <div className="min-w-0">
        <button
          type="button"
          aria-label={`Ver detalle de ${line.name}`}
          aria-expanded={open}
          aria-controls={open ? `${id}-detail` : undefined}
          title={line.name}
          className="block max-w-full cursor-pointer text-left decoration-primary decoration-2 underline-offset-3 hover:underline"
          onClick={() => setOpen(!open)}
        >
          <span
            className={cn('leading-snug font-semibold text-foreground', !open && 'line-clamp-2')}
          >
            {line.name}
          </span>
        </button>
        <div className="mt-0.75 flex flex-wrap items-center gap-2">
          <span className="rounded-md border bg-background px-1.5 font-mono text-xs text-secondary-foreground">
            {line.code}
          </span>
          {catalogPrice !== null && cents !== parseCents(catalogPrice) ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">Catálogo S/ {formatPrice(catalogPrice)}</span>
              <button
                type="button"
                className={cn(inlineAction, 'text-xs')}
                onClick={() => update((current) => restorePrice(current, line.id))}
              >
                Restaurar
              </button>
            </span>
          ) : null}
        </div>
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-3 sm:contents">
        <div
          className={cn(
            'inline-flex w-fit shrink-0 items-center overflow-hidden rounded-[10px] border border-input bg-card',
            quantityProblem && 'border-destructive',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-9.5 w-8.5 rounded-none"
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
            className="h-9.5 w-12 border-x bg-transparent text-center font-bold text-foreground tabular-nums outline-none"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9.5 w-8.5 rounded-none"
            aria-label={`Una unidad más de ${line.name}`}
            disabled={line.quantity >= MAX_QUANTITY}
            onClick={() => change(line.quantity + 1)}
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <div
          className={cn(
            'flex h-10 min-w-0 overflow-hidden rounded-[10px] border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 max-sm:w-33',
            priceProblem && 'border-destructive ring-3 ring-destructive/20',
          )}
        >
          <span className="grid place-items-center border-r bg-muted px-2.25 text-[13px] font-semibold text-muted-foreground">
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
              update((current) => setUnitPrice(current, line.id, event.target.value))
            }
            className="w-full min-w-0 bg-transparent px-2.25 text-foreground tabular-nums outline-none"
          />
        </div>
        <span className="ml-auto font-bold whitespace-nowrap text-foreground tabular-nums sm:ml-0 sm:text-right">
          {total}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Quitar ${line.name}`}
        title="Quitar"
        className="col-start-2 row-start-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:col-start-auto sm:row-start-auto"
        onClick={() => removeLine(line.id)}
      >
        <X aria-hidden />
      </Button>

      {open ? (
        <p
          id={`${id}-detail`}
          className="col-span-full rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-line text-secondary-foreground [overflow-wrap:anywhere]"
        >
          {line.description ?? 'Sin descripción'}
        </p>
      ) : null}
      {quantityProblem ? (
        <p
          id={`${id}-quantity-error`}
          className="col-span-full text-xs font-medium text-destructive"
        >
          Cantidad: {quantityProblem}
        </p>
      ) : null}
      {priceProblem ? (
        <p id={`${id}-price-error`} className="col-span-full text-xs font-medium text-destructive">
          {priceProblem}
        </p>
      ) : null}
      {newPrice ? (
        <p className="col-span-full text-xs text-amber-800">
          El precio del catálogo cambió a S/ {formatPrice(newPrice)} ·{' '}
          <button
            type="button"
            className={cn(inlineAction, 'text-xs')}
            onClick={() => update((current) => applyCatalogPrice(current, line.id, newPrice))}
          >
            Actualizar
          </button>
        </p>
      ) : null}
      {missing ? (
        <p className="col-span-full text-xs text-amber-800">
          Ya no está en el catálogo. Puedes quitarlo o mantenerlo con estos datos.
        </p>
      ) : null}
    </li>
  )
}
