'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCatalogFilters } from '../hooks'

// La categoría se elige en la tarjeta Categorías; aquí solo la búsqueda y «Limpiar filtros».
export function ProductFilters() {
  const [filters, setFilters] = useCatalogFilters()
  const hasFilters = filters.search !== '' || filters.category !== null

  return (
    <div className="flex h-17 items-center gap-3 border-b px-4 sm:px-5">
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
          maxLength={120}
          autoComplete="off"
          placeholder="Buscar por nombre o código…"
          className="bg-background/60 pl-10"
        />
      </div>
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilters({ search: null, category: null, page: null })}
        >
          <X aria-hidden />
          Limpiar filtros
        </Button>
      ) : null}
    </div>
  )
}
