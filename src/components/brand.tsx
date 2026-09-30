import { Package } from 'lucide-react'

export function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="grid size-[38px] place-items-center rounded-[11px] bg-sidebar-primary text-sidebar-primary-foreground">
        <Package className="size-5" aria-hidden />
      </span>
      <span className="grid leading-tight">
        <span className="text-[17px] font-extrabold tracking-[-0.02em] text-foreground">
          Catálogo
        </span>
        <span className="text-xs font-medium text-muted-foreground">Gestión comercial</span>
      </span>
    </div>
  )
}
