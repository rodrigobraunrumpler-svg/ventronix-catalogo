'use client'

import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useCompanyProfile, useSaveCompanyProfile } from '../hooks'
import { CompanyForm } from './company-form'

// Campos por sección (Datos, Contacto, Condiciones y Pagos): el esqueleto tiene la forma del
// formulario, así la pantalla no salta al cargar.
const SKELETON_SECTIONS = [3, 3, 3, 2]

function CompanySkeleton() {
  return (
    <div aria-busy className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <p className="sr-only">Cargando los datos de tu empresa…</p>
      <div className="grid gap-5">
        {SKELETON_SECTIONS.map((fields, section) => (
          <div key={section} className="grid gap-4 rounded-[14px] border bg-card p-5">
            <Skeleton className="h-4 w-28" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: fields }, (_, field) => (
                <div key={field} className={cn('grid gap-2', field === 0 && 'sm:col-span-2')}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-10.5 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid overflow-hidden rounded-[14px] border bg-card">
        <div className="grid gap-2 bg-foreground px-5 py-4">
          <Skeleton className="h-4 w-40 bg-white/15" />
          <Skeleton className="h-3 w-28 bg-white/10" />
        </div>
        <div className="grid gap-3 px-5 py-4">
          {[70, 55, 85, 60, 75].map((width) => (
            <Skeleton key={width} className="h-3" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function CompanyScreen() {
  const profile = useCompanyProfile()
  const save = useSaveCompanyProfile()

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Los datos de tu empresa que salen en cada proforma.
        </p>
      </div>
      {profile.isPending ? (
        <CompanySkeleton />
      ) : profile.isError || !profile.data ? (
        <div
          role="alert"
          className="grid justify-items-start gap-3 rounded-[14px] border bg-card p-5"
        >
          <p className="text-sm">
            No pudimos cargar los datos de tu empresa. Revisa tu conexión e inténtalo de nuevo.
          </p>
          <Button variant="outline" onClick={() => profile.refetch()}>
            <RefreshCw aria-hidden />
            Reintentar
          </Button>
        </div>
      ) : (
        <CompanyForm
          profile={profile.data}
          onSubmit={save}
          onSaved={() => toast.success('Cambios guardados')}
        />
      )}
    </div>
  )
}
