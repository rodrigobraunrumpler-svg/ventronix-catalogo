'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRucLookup } from '@/features/proforma/hooks'
import { cn } from '@/lib/utils'
import { useCompanyProfile, useSaveCompanyProfile } from '../hooks'
import { CompanyForm, CompanyHeader } from './company-form'

// Campos del esqueleto: la forma de la pestaña Datos y de la vista previa, así la pantalla no
// salta al cargar.
const SKELETON_FIELDS = [true, false, false]

function CompanySkeleton() {
  return (
    <div aria-busy className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <p className="sr-only">Cargando los datos de tu empresa…</p>
      <div className="overflow-hidden rounded-[14px] border bg-card">
        <div className="flex gap-6 border-b px-5 py-4">
          {[64, 80, 96, 60].map((width) => (
            <Skeleton key={width} className="h-4" style={{ width }} />
          ))}
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {SKELETON_FIELDS.map((wide, field) => (
            <div key={field} className={cn('grid gap-2', wide && 'sm:col-span-2')}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10.5 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid overflow-hidden rounded-[14px] border bg-card">
        <div className="border-b px-4.5 py-3.5">
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex items-center justify-between bg-black px-4.5 py-3.5">
          <Skeleton className="h-8 w-33 bg-white/15" />
          <Skeleton className="h-3 w-18 bg-white/15" />
        </div>
        <div className="grid gap-2.5 px-4.5 py-3.5">
          {[70, 45, 85, 60, 75].map((width) => (
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
  const lookupRuc = useRucLookup()

  if (profile.isSuccess && profile.data) {
    return <CompanyForm profile={profile.data} onSubmit={save} lookupRuc={lookupRuc} />
  }

  return (
    <div className="grid gap-6">
      <CompanyHeader />
      {profile.isPending ? (
        <CompanySkeleton />
      ) : (
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
      )}
    </div>
  )
}
