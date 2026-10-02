'use client'

import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { formatPrice } from '@/features/catalog/money'
import { normalizeSearch } from '@/features/catalog/search-pattern'
import type { ProductListItem } from '@/features/catalog/types'
import { cn } from '@/lib/utils'
import { addProduct, findLine, quantityMessage } from '../draft'
import { useProforma } from '../store'

export type SearchProducts = (term: string, signal?: AbortSignal) => Promise<ProductListItem[]>

const MAX_RESULTS = 6

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// Buscar y añadir sin salir de la proforma: Enter añade el resultado marcado (el primero, o el que
// se elija con ↑ ↓) y un clic también. El buscador queda vacío y con el foco, listo para el
// siguiente producto.
export function ProformaProductSearch({ searchProducts }: { searchProducts: SearchProducts }) {
  const id = useId()
  const { draft, update, announce } = useProforma()
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const query = normalizeSearch(useDebounced(term, 250))
  const results = useQuery({
    queryKey: ['proforma', 'search', query],
    queryFn: ({ signal }) => searchProducts(query, signal),
    enabled: query !== '',
    staleTime: 30_000,
  })
  const items = (results.data ?? []).slice(0, MAX_RESULTS)
  const open = focused && normalizeSearch(term) !== ''
  const current = Math.min(active, items.length - 1)

  function add(product: ProductListItem) {
    announce(
      quantityMessage(
        update((draft) => addProduct(draft, product)),
        product,
      ),
    )
    setTerm('')
    setActive(0)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive(Math.max(0, Math.min(current + step, items.length - 1)))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (items[current]) add(items[current])
    } else if (event.key === 'Escape' && term !== '') {
      // La ventana no se cierra: Escape solo borra la búsqueda (ver ProformaDialog).
      setTerm('')
    }
  }

  return (
    <div className="relative mb-3">
      <Search
        className="pointer-events-none absolute top-3 left-3.5 size-4.5 text-muted-foreground"
        aria-hidden
      />
      <label htmlFor={`${id}-input`} className="sr-only">
        Añadir producto
      </label>
      <input
        id={`${id}-input`}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && items[current] ? `${id}-${items[current].id}` : undefined}
        data-clears-on-escape={term !== '' ? true : undefined}
        value={term}
        maxLength={120}
        autoComplete="off"
        placeholder="Buscar y añadir: nombre o código…"
        className="h-11 w-full rounded-[10px] border border-input bg-background/60 pr-3.5 pl-10.5 text-[15px] outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/50"
        onChange={(event) => {
          setTerm(event.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border bg-popover shadow-lg">
          {query === '' || (results.isPending && results.isFetching) ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Buscando…</p>
          ) : results.isError ? (
            <p role="alert" className="px-4 py-3 text-sm text-destructive">
              No pudimos buscar. Revisa tu conexión e inténtalo de nuevo.
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No encontramos productos con «{query}».
            </p>
          ) : (
            <ul
              id={`${id}-list`}
              role="listbox"
              aria-label="Productos encontrados"
              className="py-1"
            >
              {items.map((product, index) => {
                const quantity = findLine(draft, product.id)?.quantity
                return (
                  <li
                    key={product.id}
                    id={`${id}-${product.id}`}
                    role="option"
                    aria-selected={index === current}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-3.5 py-2.5',
                      index === current && 'bg-accent',
                    )}
                    // El clic no le quita el foco al buscador: se sigue escribiendo.
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => add(product)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{product.name}</p>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{product.code}</span>
                        {quantity ? (
                          <span className="font-semibold text-ring">
                            En la proforma: {quantity}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span className="font-bold whitespace-nowrap tabular-nums">
                      S/ {formatPrice(product.unit_price)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
