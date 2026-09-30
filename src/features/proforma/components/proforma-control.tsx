'use client'

import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProductListItem } from '@/features/catalog/types'
import { addProduct, findLine, quantityMessage, setQuantity } from '../draft'
import { useProforma, useRemoveLine } from '../store'
import { MAX_QUANTITY } from '../totals'

// «Añadir» y luego [− n +] en cada producto de la lista (spec §4.1). Bajar de 1 lo quita.
export function ProformaControl({ product }: { product: ProductListItem }) {
  const { draft, update, announce } = useProforma()
  const removeLine = useRemoveLine()
  const line = findLine(draft, product.id)

  function add() {
    announce(
      quantityMessage(
        update((current) => addProduct(current, product)),
        product,
      ),
    )
  }

  function decrease() {
    if (!line || line.quantity <= 1) {
      removeLine(product.id)
      return
    }
    const next = update((current) => setQuantity(current, product.id, line.quantity - 1))
    announce(quantityMessage(next, product))
  }

  if (!line) {
    return (
      <Button
        variant="outline"
        size="sm"
        aria-label={`Añadir ${product.name} a la proforma`}
        onClick={add}
      >
        <Plus aria-hidden />
        Añadir
      </Button>
    )
  }

  return (
    <div
      role="group"
      aria-label={`Cantidad de ${product.name} en la proforma`}
      className="inline-flex items-center overflow-hidden rounded-[9px] border border-primary bg-card"
    >
      <Button
        variant="ghost"
        size="icon"
        className="rounded-none"
        aria-label={
          line.quantity <= 1
            ? `Quitar ${product.name} de la proforma`
            : `Una unidad menos de ${product.name}`
        }
        onClick={decrease}
      >
        <Minus aria-hidden />
      </Button>
      <span className="grid h-9 min-w-9.5 place-items-center border-x bg-[#f6fbef] px-1 text-sm font-bold text-foreground tabular-nums">
        {line.quantity}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-none"
        aria-label={`Una unidad más de ${product.name}`}
        disabled={line.quantity >= MAX_QUANTITY}
        onClick={add}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  )
}
