'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CategoryChips } from '../../categories/components/category-chips'
import { useCategories } from '../../categories/hooks'
import { useCatalogFilters } from '../hooks'
import { ProductDateFilter } from './date-filter'

// Búsqueda y «Limpiar filtros»; en el celular, también las categorías como fichas (en PC se eligen
// en su tarjeta). Siempre a la vista: al bajar por la lista se quedan arriba, debajo de la cabecera
// fija del celular. Enter avisa a quien la usa (la proforma añade el único resultado).
export function ProductFilters({ onSearchEnter }: { onSearchEnter?: () => void }) {
  const [filters, setFilters] = useCatalogFilters()
  const categories = useCategories()
  const hasFilters = filters.search !== '' || filters.category !== null || filters.date !== null

  return (
    <div className="sticky top-16 z-10 grid min-h-17 grid-cols-1 content-center gap-3 border-b bg-card px-4 py-3 sm:px-5 lg:top-0 lg:short:min-h-15 lg:short:py-2">
      <div className="flex items-center gap-3">
        <div className="relative max-w-[440px] flex-1">
          <Search
            className="pointer-events-none absolute top-3 left-3 size-4.5 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor="product-search" className="sr-only">
            Buscar por nombre o código
          </label>
          <Input
            id="product-search"
            type="search"
            value={filters.search}
            onChange={(event) =>
              setFilters({ search: event.target.value || null, page: null }, { history: 'replace' })
            }
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !onSearchEnter) return
              event.preventDefault()
              onSearchEnter()
            }}
            maxLength={120}
            autoComplete="off"
            placeholder="Buscar por nombre o código…"
            className="bg-background/60 pl-10"
          />
        </div>
        <ProductDateFilter />
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setFilters({
                search: null,
                category: null,
                date: null,
                from: null,
                to: null,
                page: null,
              })
            }
          >
            <X aria-hidden />
            {/* En el celular, «Limpiar»: así el buscador conserva un ancho útil. */}
            Limpiar<span className="max-sm:sr-only"> filtros</span>
          </Button>
        ) : null}
      </div>
      {categories.data && categories.data.length > 0 ? (
        <div className="lg:hidden">
          <CategoryChips
            categories={categories.data}
            selected={filters.category}
            onSelect={(category) => setFilters({ category, page: null })}
          />
        </div>
      ) : null}
    </div>
  )
}
