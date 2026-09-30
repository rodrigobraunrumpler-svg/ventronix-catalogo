'use client'

import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCompanyProfile, useSaveCompanyProfile } from '../hooks'
import { CompanyForm } from './company-form'

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
        <p className="text-sm text-muted-foreground">Cargando…</p>
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
