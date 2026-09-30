import { Skeleton } from '@/components/ui/skeleton'

// Carga de navegación del área privada.
export default function Loading() {
  return (
    <div className="grid gap-6" aria-busy="true">
      <span className="sr-only">Cargando…</span>
      <div className="grid gap-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-md" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-[14px]" />
        <Skeleton className="h-[480px] rounded-[14px]" />
      </div>
    </div>
  )
}
