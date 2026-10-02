import Image from 'next/image'
import { cn } from '@/lib/utils'

// Plegada (menú lateral estrecho) solo se ve el logo; el nombre queda para los lectores de pantalla.
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 px-2', className)}>
      {/* Recurso estático pequeño: se sirve tal cual, sin pasar por el optimizador de imágenes. */}
      <Image
        src="/brand/ventronix-mark.png"
        alt=""
        width={38}
        height={38}
        unoptimized
        className="size-9.5 rounded-[11px]"
      />
      <span className={cn('grid leading-tight', compact && 'sr-only')}>
        <span className="text-[17px] font-extrabold tracking-[-0.02em] text-foreground">
          Ventronix
        </span>
        <span className="text-xs font-medium text-muted-foreground">Catálogo comercial</span>
      </span>
    </div>
  )
}
