import Image from 'next/image'

export function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      {/* Recurso estático pequeño: se sirve tal cual, sin pasar por el optimizador de imágenes. */}
      <Image
        src="/brand/ventronix-mark.png"
        alt=""
        width={38}
        height={38}
        unoptimized
        className="size-9.5 rounded-[11px]"
      />
      <span className="grid leading-tight">
        <span className="text-[17px] font-extrabold tracking-[-0.02em] text-foreground">
          Ventronix
        </span>
        <span className="text-xs font-medium text-muted-foreground">Catálogo comercial</span>
      </span>
    </div>
  )
}
