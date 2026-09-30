import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'

// `inverted`: versión para fondos oscuros (panel de marca del acceso).
export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-2">
      <span
        className={cn(
          'grid size-9.5 place-items-center rounded-[11px]',
          inverted
            ? 'bg-white text-sidebar-primary'
            : 'bg-sidebar-primary text-sidebar-primary-foreground',
        )}
      >
        <Package className="size-5" aria-hidden />
      </span>
      <span className="grid leading-tight">
        <span
          className={cn(
            'text-[17px] font-extrabold tracking-[-0.02em]',
            inverted ? 'text-white' : 'text-foreground',
          )}
        >
          Catálogo
        </span>
        <span
          className={cn(
            'text-xs font-medium',
            inverted ? 'text-white/65' : 'text-muted-foreground',
          )}
        >
          Gestión comercial
        </span>
      </span>
    </div>
  )
}
