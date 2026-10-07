'use client'

import { Search, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateFilterControl } from '@/features/catalog/products/components/date-filter'
import { limaDay } from '@/features/catalog/list-options'
import { useHistoryFilters } from '../hooks'

// Búsqueda por cliente, RUC, DNI, celular o N° y filtro de fecha (spec de productos libres §4.2).
// Cambiar un filtro vuelve a la página 1.
export function HistoryFilters() {
  const [filters, setFilters] = useHistoryFilters()
  // Como en Productos: «hoy» se fija al montar (solo limita los calendarios).
  const [today] = useState(() => limaDay(new Date()))
  const hasFilters = filters.search !== '' || filters.date !== null

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
      <div className="relative min-w-0 flex-1 basis-60 sm:max-w-[440px]">
        <Search
          className="pointer-events-none absolute top-3 left-3 size-4.5 text-muted-foreground"
          aria-hidden
        />
        <label htmlFor="proforma-search" className="sr-only">
          Buscar por cliente, RUC, DNI, celular o N° de proforma
        </label>
        <Input
          id="proforma-search"
          type="search"
          value={filters.search}
          onChange={(event) =>
            setFilters({ search: event.target.value || null, page: null }, { history: 'replace' })
          }
          maxLength={120}
          autoComplete="off"
          placeholder="Cliente, RUC, DNI, celular o N°…"
          className="bg-background/60 pl-10"
        />
      </div>
      <DateFilterControl
        value={filters}
        today={today}
        onChange={({ date, from, to }) => void setFilters({ date, from, to, page: null })}
      />
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilters({ search: null, date: null, from: null, to: null, page: null })}
        >
          <X aria-hidden />
          Limpiar<span className="max-sm:sr-only"> filtros</span>
        </Button>
      ) : null}
    </div>
  )
}
