'use client'

import { ArrowRight, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { unitCount } from '../draft'
import { formatCents } from '../money'
import { useEmptyProforma, useProforma } from '../store'
import { TAX_CONFIG } from '../tax'
import { totalsFromText } from '../totals'

// Barra oscura flotante con el total y «Completar proforma» (spec §4.2 y prototipo). Aparece con al
// menos un producto; en móvil ocupa todo el ancho y los botones bajan a una segunda fila.
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
      <div aria-hidden className="h-24" />
      <div
        role="region"
        aria-label="Proforma"
        className="fixed inset-x-4 bottom-4 z-20 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[14px] bg-foreground py-3 pr-3.5 pl-5 text-white shadow-[0_18px_36px_-12px_#10180a66] sm:inset-x-6 sm:bottom-6 lg:right-10 lg:left-[calc(var(--sidebar-width)+2.5rem)]"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-9.5 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground max-sm:hidden">
            <FileText className="size-4.5" aria-hidden />
          </span>
          <p className="grid min-w-0 leading-snug">
            <span className="font-bold">Proforma</span>
            <span className="truncate text-[13px] text-[#c7cdc2]">
              {products} {products === 1 ? 'producto' : 'productos'} · {units}{' '}
              {units === 1 ? 'unidad' : 'unidades'}
            </span>
          </p>
        </div>
        <p className="grid text-right leading-tight">
          <span className="text-xs text-[#c7cdc2]">
            {TAX_CONFIG.mode === 'none' ? 'Total' : 'Total con IGV'}
          </span>
          <span className="text-xl font-extrabold tabular-nums">
            S/ {totals ? formatCents(totals.total) : '—'}
          </span>
        </p>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            variant="ghost"
            className="h-10 px-3.5 text-sm text-[#d6dbd2] hover:bg-white/12 hover:text-white"
            onClick={empty}
          >
            Vaciar
          </Button>
          <Button
            className="h-11 flex-1 px-4.5 text-[15px] font-bold sm:flex-none"
            onClick={onComplete}
          >
            Completar proforma
            <ArrowRight className="size-4.25" aria-hidden />
          </Button>
        </div>
      </div>
    </>
  )
}
