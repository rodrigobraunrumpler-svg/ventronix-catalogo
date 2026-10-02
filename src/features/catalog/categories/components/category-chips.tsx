'use client'

import { cn } from '@/lib/utils'
import type { CategoryListItem } from '../../types'

type CategoryChipsProps = {
  categories: CategoryListItem[]
  selected: string | null
  onSelect: (category: string | null) => void
}

// En el celular, las categorías como fichas deslizables encima de la lista: se filtra sin bajar
// hasta la tarjeta Categorías (en PC está siempre a la izquierda).
export function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  const total = categories.reduce((sum, category) => sum + category.product_count, 0)
  const chips: { id: string | null; name: string; count: number }[] = [
    { id: null, name: 'Todos', count: total },
    ...categories.map(({ id, name, product_count }) => ({ id, name, count: product_count })),
  ]
  return (
    <nav aria-label="Filtro rápido por categoría" className="flex gap-2 overflow-x-auto pb-1">
      {chips.map((chip) => (
        <button
          key={chip.id ?? 'todos'}
          type="button"
          aria-pressed={selected === chip.id}
          onClick={() => onSelect(chip.id)}
          className={cn(
            'inline-flex h-8.5 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
            selected === chip.id
              ? 'border-foreground bg-foreground text-background'
              : 'bg-card text-foreground hover:bg-accent',
          )}
        >
          {chip.name} <span className="font-mono text-xs font-medium opacity-70">{chip.count}</span>
        </button>
      ))}
    </nav>
  )
}
