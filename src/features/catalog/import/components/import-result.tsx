'use client'

import { Check, Download, ListChecks, LoaderCircle, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { base64ToFile, downloadFile, XLSX_MIME } from '@/lib/files'
import { outcomeSummary, plural } from '../format'
import type { ImportOutcome } from '../types'
import type { BarDownload } from './import-action-bar'

// Lo creado y lo actualizado hoy, lo último primero (spec §6.10).
export const RESULT_LINK = '/products?dateBy=updated&date=today&sort=updated'

// Resultado (spec §6.10): el comprobante ya viene en la respuesta, sin otra petición.
export function ImportResult({
  outcome,
  downloading,
  onErrors,
  onAgain,
}: {
  outcome: ImportOutcome
  downloading: BarDownload | null
  onErrors: () => void
  onAgain: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  // Al terminar, el foco va al título del resultado (spec §6.11).
  useEffect(() => heading.current?.focus(), [])
  const { receipt } = outcome
  return (
    <section
      aria-labelledby="import-result"
      className="grid justify-items-center gap-6 rounded-[18px] border bg-card px-6 py-12 text-center"
    >
      <span
        aria-hidden
        className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground motion-safe:animate-in motion-safe:duration-500 motion-safe:zoom-in-50"
      >
        <Check className="size-8" strokeWidth={3} />
      </span>
      <div className="grid gap-2">
        <h2
          id="import-result"
          ref={heading}
          tabIndex={-1}
          className="scroll-mt-24 text-2xl font-extrabold tracking-[-0.01em] outline-none"
        >
          ¡Listo! Tu catálogo está actualizado
        </h2>
        <p className="text-[15px] text-muted-foreground">
          {outcomeSummary(outcome) || 'No hubo cambios: tu catálogo ya estaba al día.'}
        </p>
        {outcome.categoriesCreated.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Categorías nuevas: {outcome.categoriesCreated.join(', ')}
          </p>
        ) : null}
      </div>
      {outcome.errors > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-[12px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{plural(outcome.errors, 'fila no se importó', 'filas no se importaron')}.</span>
          <Button variant="outline" size="sm" disabled={downloading !== null} onClick={onErrors}>
            {downloading === 'errors' ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            {downloading === 'errors' ? 'Preparando Excel…' : 'Descargar filas con errores'}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          onClick={() => downloadFile(base64ToFile(receipt.base64, receipt.fileName, XLSX_MIME))}
        >
          <Download aria-hidden />
          Descargar comprobante
        </Button>
        <Button asChild variant="outline">
          <Link href={RESULT_LINK} prefetch>
            <ListChecks aria-hidden />
            Ver productos
          </Link>
        </Button>
        <Button variant="ghost" onClick={onAgain}>
          <RotateCcw aria-hidden />
          Hacer otra carga
        </Button>
      </div>
      {outcome.updated > 0 ? (
        <p className="max-w-[56ch] text-[13px] text-muted-foreground">
          Guarda el comprobante: su hoja «Para revertir» trae los valores anteriores de los
          productos actualizados.
        </p>
      ) : null}
    </section>
  )
}
