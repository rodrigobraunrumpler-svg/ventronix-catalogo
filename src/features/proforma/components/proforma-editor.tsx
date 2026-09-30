'use client'

import { FileText } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { generateBlocker, type CompanyStatus } from '../readiness'
import type { RucLookupResult } from '../ruc'
import { useProforma } from '../store'
import { ProformaClient } from './proforma-client'
import { ProformaLines } from './proforma-lines'
import { ProformaSummary } from './proforma-summary'

export type ProformaEditorProps = {
  company: CompanyStatus
  prices: Map<string, string> | undefined
  lookupRuc: (ruc: string) => Promise<RucLookupResult>
  onContinue: () => void
  onGenerate: () => void
  generating?: boolean
  error?: string | null
}

// Productos y cliente a la izquierda; el resumen con «Generar proforma» a la derecha (spec §4.3 y
// prototipo). Mientras no se pueda generar, el motivo va debajo del botón.
export function ProformaEditor({
  company,
  prices,
  lookupRuc,
  onContinue,
  onGenerate,
  generating = false,
  error = null,
}: ProformaEditorProps) {
  const { draft } = useProforma()
  const blocker = generateBlocker(draft, company)
  const defaultValidity = company.status === 'ready' ? company.profile.default_validity_days : null

  return (
    <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 pt-5 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <ProformaLines prices={prices} onContinue={onContinue} />
        <ProformaClient lookupRuc={lookupRuc} defaultValidityDays={defaultValidity} />
      </div>
      <ProformaSummary>
        <Button
          id="generate-proforma"
          className="h-11.5 w-full text-[15px] font-bold"
          disabled={blocker !== null || generating}
          aria-describedby={error || blocker ? 'generate-reason' : undefined}
          onClick={onGenerate}
        >
          <FileText className="size-4.5" aria-hidden />
          {generating ? 'Generando…' : 'Generar proforma'}
        </Button>
        {error ? (
          <p id="generate-reason" role="alert" className="text-xs leading-normal text-destructive">
            {error}
          </p>
        ) : blocker ? (
          <p id="generate-reason" className="text-xs leading-normal text-muted-foreground">
            {blocker.message}
            {blocker.companyLink ? (
              <>
                {' '}
                <Link
                  href="/company"
                  className="font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3"
                >
                  Ir a Empresa
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-xs leading-normal text-muted-foreground">
            Recibe su número correlativo al generarla.
          </p>
        )}
      </ProformaSummary>
    </div>
  )
}
