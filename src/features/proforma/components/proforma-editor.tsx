'use client'

import { FileText } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/lib/action-result'
import { base64ToFile, newTab, openFile, TAB_BLOCKED } from '../document/files'
import { documentInput, type DocumentInput, type GeneratedDocument } from '../document/input'
import { formatProformaNumber } from '../number'
import { generateBlocker, validityError, type CompanyStatus } from '../readiness'
import type { RucLookupResult } from '../ruc'
import { useProforma } from '../store'
import { totalsFromText } from '../totals'
import type { ClientMatch } from '../history/queries'
import { ProformaClient } from './proforma-client'
import { ProformaLines } from './proforma-lines'
import type { SearchProducts } from './proforma-product-search'
import { PhotosSwitch, ProformaSummary } from './proforma-summary'

export type ProformaEditorProps = {
  company: CompanyStatus
  prices: Map<string, string> | undefined
  lookupRuc: (ruc: string) => Promise<RucLookupResult>
  // El cliente según su proforma más reciente (spec de productos libres §4.3).
  findClient: (document: string) => Promise<ClientMatch | null>
  // Solo desde Productos: en Proformas no hay lista a la que volver (plan, decisión 5).
  onContinue?: () => void
  onGenerate: () => void
  generatePdf: (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>
  // Buscar en el catálogo para añadir sin salir de la proforma.
  searchProducts: SearchProducts
  // Sube la foto de un producto libre y devuelve su ruta (spec de productos libres §4.3).
  uploadPhoto: (file: File) => Promise<string>
  generating?: boolean
  error?: string | null
}

// Productos y cliente a la izquierda; el resumen con «Generar proforma» a la derecha (spec §4.3 y
// prototipo). Mientras no se pueda generar, el motivo va debajo del botón.
export function ProformaEditor({
  company,
  prices,
  lookupRuc,
  findClient,
  onContinue,
  onGenerate,
  generatePdf,
  searchProducts,
  uploadPhoto,
  generating = false,
  error = null,
}: ProformaEditorProps) {
  const { draft } = useProforma()
  const blocker = generateBlocker(draft, company)
  const defaultValidity = company.status === 'ready' ? company.profile.default_validity_days : null
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const canPreview =
    draft.lines.length > 0 &&
    totalsFromText(draft) !== null &&
    validityError(draft.validityDays) === null

  // La pestaña se abre al pulsar, antes de esperar al servidor, para que el navegador no la bloquee.
  async function preview() {
    setPreviewError(null)
    const tab = newTab()
    setPreviewing(true)
    const result = await generatePdf(documentInput(draft, { draft: true }))
    setPreviewing(false)
    if (!result.ok) {
      tab?.close()
      setPreviewError(result.error.message)
      return
    }
    if (!openFile(base64ToFile(result.data.base64, result.data.fileName), tab)) toast(TAB_BLOCKED)
  }

  return (
    <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 pt-5 pb-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <ProformaLines
          prices={prices}
          onContinue={onContinue}
          searchProducts={searchProducts}
          uploadPhoto={uploadPhoto}
        />
        <ProformaClient
          lookupRuc={lookupRuc}
          findClient={findClient}
          defaultValidityDays={defaultValidity}
        />
      </div>
      <ProformaSummary>
        <PhotosSwitch />
        <Button
          id="generate-proforma"
          className="h-11.5 w-full text-[15px] font-bold"
          disabled={blocker !== null || generating}
          aria-describedby={error || blocker ? 'generate-reason' : undefined}
          onClick={onGenerate}
        >
          <FileText className="size-4.5" aria-hidden />
          {generating
            ? 'Generando…'
            : draft.number === null
              ? 'Generar proforma'
              : // Una corrección: se guarda con su número, sobre la que está en el historial.
                `Guardar cambios de la ${formatProformaNumber(draft.number)}`}
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
            Recibe su número correlativo y queda guardada en el historial de Proformas.
          </p>
        )}
        <button
          type="button"
          disabled={!canPreview || previewing}
          onClick={() => void preview()}
          className="justify-self-start text-xs font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3 disabled:opacity-50"
        >
          {previewing ? 'Preparando la vista previa…' : 'Vista previa'}
        </button>
        {previewError ? (
          <p role="alert" className="text-xs text-destructive">
            {previewError}
          </p>
        ) : null}
      </ProformaSummary>
    </div>
  )
}
