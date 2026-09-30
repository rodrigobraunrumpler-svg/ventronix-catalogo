'use client'

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

// Productos, cliente y resumen en una sola vista (spec §4.3). «Generar» explica por qué no se
// puede todavía, con el motivo debajo.
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
    <>
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-6 p-5 sm:p-6">
          <ProformaLines prices={prices} onContinue={onContinue} />
        </div>
        <div className="grid content-start gap-6 border-t p-5 sm:p-6 lg:border-t-0 lg:border-l">
          <ProformaClient lookupRuc={lookupRuc} defaultValidityDays={defaultValidity} />
          <ProformaSummary />
        </div>
      </div>
      <div className="grid gap-2 border-t bg-background/60 px-5 py-4 sm:justify-items-end sm:px-6">
        <Button
          id="generate-proforma"
          disabled={blocker !== null || generating}
          aria-describedby="generate-reason"
          onClick={onGenerate}
        >
          {generating ? 'Generando…' : 'Generar proforma'}
        </Button>
        {error ? (
          <p id="generate-reason" role="alert" className="text-sm text-destructive sm:text-right">
            {error}
          </p>
        ) : (
          <p id="generate-reason" className="text-sm text-muted-foreground sm:text-right">
            {blocker?.message}
            {blocker?.companyLink ? (
              <>
                {' '}
                <Link
                  href="/company"
                  className="font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-2"
                >
                  Ir a Empresa
                </Link>
              </>
            ) : null}
          </p>
        )}
      </div>
    </>
  )
}
