'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { pageList } from '@/features/catalog/search-params'
import { cn } from '@/lib/utils'

// Pie de una lista con páginas: qué filas se ven y Anterior, los números de página y Siguiente.
export function Pagination({
  page,
  totalPages,
  label,
  summary,
  onPage,
}: {
  page: number
  totalPages: number
  // Nombre de la navegación, por ejemplo «Páginas de productos».
  label: string
  summary: ReactNode
  onPage: (page: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <p className="text-[13px] text-muted-foreground">{summary}</p>
      <nav aria-label={label} className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        {pageList(page, totalPages).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={`Página ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={cn(item === page && 'border border-input font-bold')}
              onClick={() => onPage(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página siguiente"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </nav>
    </div>
  )
}
