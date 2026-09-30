'use client'

import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { unitCount } from '../draft'
import { formatCents } from '../money'
import { useEmptyProforma, useProforma } from '../store'
import { TAX_CONFIG } from '../tax'
import { totalsFromText } from '../totals'

// Aparece con al menos un producto, fija abajo (a todo el ancho en móvil) (spec §4.2).
export function ProformaBar({ onComplete }: { onComplete: () => void }) {
  const { draft } = useProforma()
  const empty = useEmptyProforma()
  if (draft.lines.length === 0) return null

  const totals = totalsFromText(draft)
  const products = draft.lines.length
  const units = unitCount(draft)

  return (
    <>
      {/* Espacio para que la barra no tape la paginación. */}
      <div aria-hidden className="h-16" />
      <div
        role="region"
        aria-label="Proforma"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:left-58 lg:px-10"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-sm">
            <span className="font-bold">
              {products} {products === 1 ? 'producto' : 'productos'}
            </span>
            <span className="text-muted-foreground">
              {' '}
              · {units} {units === 1 ? 'unidad' : 'unidades'}
            </span>
          </p>
          <p className="text-sm tabular-nums">
            <span className="text-muted-foreground">
              {TAX_CONFIG.mode === 'none' ? 'Total' : 'Total con IGV'}{' '}
            </span>
            <span className="text-base font-extrabold">
              S/ {totals ? formatCents(totals.total) : '—'}
            </span>
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={empty}>
              Vaciar
            </Button>
            <Button onClick={onComplete}>
              <ClipboardList aria-hidden />
              Completar proforma
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
