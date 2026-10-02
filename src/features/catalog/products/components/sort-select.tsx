'use client'

import { ArrowDownUp, ChevronDown } from 'lucide-react'
import { PRODUCT_SORTS, SORT_LABELS, type ProductSort } from '../../list-options'

// Orden de la lista (spec del Excel §4.4). Un <select> nativo: accesible y cómodo en el celular.
// field-sizing-content lo deja del ancho de la opción elegida (Chrome y Edge): la cabecera cabe en
// una línea en un laptop. Donde no se admite, mide lo que la opción más larga.
export function SortSelect({
  value,
  onChange,
}: {
  value: ProductSort
  onChange: (sort: ProductSort) => void
}) {
  return (
    <div className="relative flex items-center">
      <ArrowDownUp
        className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
      <label htmlFor="product-sort" className="sr-only">
        Ordenar por
      </label>
      <select
        id="product-sort"
        value={value}
        onChange={(event) => onChange(event.target.value as ProductSort)}
        className="h-8 cursor-pointer appearance-none rounded-lg border border-input bg-background/60 pr-7 pl-8 text-[13px] text-secondary-foreground outline-none field-sizing-content focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {PRODUCT_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}
