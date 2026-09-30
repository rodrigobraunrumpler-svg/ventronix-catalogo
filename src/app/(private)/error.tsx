'use client'

import { CircleAlert, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Recuperación de errores del área privada: el usuario puede reintentar sin recargar.
export default function PrivateError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-[14px] border bg-card px-6 py-16 text-center shadow-xs">
      <span className="mb-2 grid size-13 place-items-center rounded-[14px] bg-destructive/10 text-destructive">
        <CircleAlert className="size-6" aria-hidden />
      </span>
      <h1 role="alert" className="text-[17px] font-bold">
        Algo salió mal
      </h1>
      <p className="mb-3 max-w-[360px] text-sm text-muted-foreground">
        No pudimos mostrar esta pantalla. Inténtalo de nuevo; tus datos no se han perdido.
      </p>
      <Button variant="outline" onClick={reset}>
        <RefreshCw aria-hidden />
        Reintentar
      </Button>
    </div>
  )
}
