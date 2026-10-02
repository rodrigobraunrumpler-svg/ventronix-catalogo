'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { CatalogStats, ProductFilters } from '../../types'
import { useCatalogFilters, useCatalogStats } from '../hooks'

export type StatsShortcut = 'all' | 'created-this-month' | 'updated-7-days'

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

// Cifras clave junto al título (spec del Excel §4.1). Cada una aplica su filtro con un clic. Van en
// la misma fila que «Productos»: no quitan altura a la lista.
export function CatalogStatsChips({
  stats,
  active,
  onSelect,
}: {
  stats: CatalogStats
  active: StatsShortcut | null
  onSelect: (shortcut: StatsShortcut) => void
}) {
  const items: { key: StatsShortcut; count: number; text: string; title: string }[] = [
    {
      key: 'all',
      count: stats.products,
      text: plural(stats.products, 'producto', 'productos'),
      title: 'Todo el catálogo, sin filtros',
    },
    {
      key: 'created-this-month',
      count: stats.createdThisMonth,
      text: `${plural(stats.createdThisMonth, 'nuevo', 'nuevos')} este mes`,
      title: 'Productos registrados desde el día 1 de este mes',
    },
    {
      key: 'updated-7-days',
      count: stats.updatedLast7Days,
      text: `${plural(stats.updatedLast7Days, 'modificado', 'modificados')} en 7 días`,
      title: 'Productos creados o modificados en los últimos 7 días',
    },
  ]
  return (
    <div
      role="group"
      aria-label="Resumen del catálogo"
      className="flex flex-wrap items-center gap-2"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={active === item.key}
          disabled={item.count === 0}
          title={item.title}
          onClick={() => onSelect(item.key)}
          className="inline-flex h-7 cursor-pointer items-center rounded-full border bg-card px-3 text-[13px] text-secondary-foreground transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-55 aria-pressed:border-ring aria-pressed:bg-accent aria-pressed:text-foreground"
        >
          <span className="font-bold text-foreground tabular-nums">{item.count}</span> {item.text}
        </button>
      ))}
    </div>
  )
}

// Las cifras cuentan todo el catálogo: con búsqueda o categoría ninguna coincide con la lista.
export function activeShortcut(
  filters: Pick<ProductFilters, 'search' | 'category' | 'dateBy' | 'date'>,
): StatsShortcut | null {
  if (filters.search !== '' || filters.category !== null) return null
  if (filters.date === null) return 'all'
  if (filters.dateBy === 'created' && filters.date === 'month') return 'created-this-month'
  if (filters.dateBy === 'updated' && filters.date === '7d') return 'updated-7-days'
  return null
}

// Al pulsar una cifra se quitan la búsqueda y la categoría: la lista muestra justo lo que cuenta.
export function CatalogSummary() {
  const stats = useCatalogStats()
  const [filters, setFilters] = useCatalogFilters()

  function select(shortcut: StatsShortcut) {
    const clean = { search: null, category: null, page: null, from: null, to: null }
    if (shortcut === 'all') void setFilters({ ...clean, dateBy: null, date: null, sort: null })
    else if (shortcut === 'created-this-month') {
      void setFilters({ ...clean, dateBy: null, date: 'month', sort: 'newest' })
    } else void setFilters({ ...clean, dateBy: 'updated', date: '7d', sort: 'updated' })
  }

  if (stats.isPending) {
    return (
      <div className="flex gap-2" aria-hidden>
        {[104, 136, 168].map((width) => (
          <Skeleton key={width} className="h-7 rounded-full" style={{ width }} />
        ))}
      </div>
    )
  }
  // ponytail: si fallan, no se muestran; la lista sigue funcionando y tiene su propio error.
  if (!stats.data) return null
  return <CatalogStatsChips stats={stats.data} active={activeShortcut(filters)} onSelect={select} />
}
