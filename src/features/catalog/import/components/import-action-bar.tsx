'use client'

import { CircleAlert, Download, LoaderCircle, TriangleAlert, Upload } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { importButton, plural, previewSummary } from '../format'
import type { ImportPreview } from '../types'

export type BarDownload = 'simulation' | 'errors'

// En el teléfono los botones secundarios muestran solo su icono (el nombre sigue para los lectores
// de pantalla y como title): la barra ocupa dos filas cortas y no tapa media pantalla.
const ghost = 'h-10 px-3 text-[#d6dbd2] hover:bg-white/12 hover:text-white'

// Barra fija con «Importar N productos» (spec §6.6 y §6.9), como la de la proforma. Si se van a
// actualizar productos que ya existen, pide confirmación.
export function ImportActionBar({
  preview,
  importing,
  refreshing,
  downloading,
  onChooseAnother,
  onDownload,
  onImport,
}: {
  preview: ImportPreview
  importing: boolean
  refreshing: boolean
  downloading: BarDownload | null
  onChooseAnother: () => void
  onDownload: (kind: BarDownload) => void
  onImport: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const button = importButton(preview)
  const busy = importing || refreshing
  const products = plural(preview.importable, 'producto', 'productos')
  const status = importing
    ? 'Guardando: no cierres esta página.'
    : (button.reason ?? previewSummary(preview.counts))
  return (
    <>
      {/* Espacio para que la barra no tape la paginación. */}
      <div aria-hidden className="h-32 sm:h-24" />
      <div
        role="region"
        aria-label="Importación"
        className="fixed inset-x-4 bottom-4 z-20 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[14px] bg-foreground py-3 pr-3.5 pl-5 text-white shadow-[0_18px_36px_-12px_#10180a66] sm:inset-x-6 sm:bottom-6 lg:right-10 lg:left-[calc(var(--sidebar-width)+2.5rem)]"
      >
        <p
          id="import-bar-status"
          aria-live="polite"
          className="min-w-0 flex-1 text-sm text-[#d6dbd2]"
        >
          {status}
        </p>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            variant="ghost"
            className={ghost}
            title="Elegir otro archivo"
            disabled={busy}
            onClick={onChooseAnother}
          >
            <Upload aria-hidden />
            <span className="max-sm:sr-only">Elegir otro archivo</span>
          </Button>
          <Button
            variant="ghost"
            className={ghost}
            title="Descargar simulación"
            disabled={busy || downloading !== null}
            onClick={() => onDownload('simulation')}
          >
            {downloading === 'simulation' ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            <span className="max-sm:sr-only">
              {downloading === 'simulation' ? 'Preparando Excel…' : 'Descargar simulación'}
            </span>
          </Button>
          <Button
            className="h-11 flex-1 px-4.5 text-[15px] font-bold sm:flex-none"
            disabled={!button.enabled || busy}
            aria-describedby="import-bar-status"
            onClick={() => (preview.updates > 0 ? setConfirming(true) : onImport())}
          >
            {importing ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {importing ? `Importando ${products}…` : button.label}
          </Button>
        </div>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Actualizar {plural(preview.updates, 'producto existente', 'productos existentes')}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sus datos se reemplazarán por los del Excel. Al terminar podrás descargar un
              comprobante para revertirlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onImport}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Aviso de filas para revisar (revisión 2 del plan): se importan igual. La importación es todo o
// nada, así que una fila que no es correcta se corrige en el Excel.
export function ReviewNotice({ reviews }: { reviews: number }) {
  return (
    <p className="flex items-start gap-2 rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {plural(
          reviews,
          'fila para revisar se importará igual',
          'filas para revisar se importarán igual',
        )}
        . Si alguna no es correcta, corrígela en el Excel y vuelve a subir el archivo.
      </span>
    </p>
  )
}

// Aviso de filas con errores (spec §6.6), con su descarga aparte.
export function ErrorsNotice({
  errors,
  downloading,
  onDownload,
}: {
  errors: number
  downloading: BarDownload | null
  onDownload: (kind: BarDownload) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[12px] border border-destructive/30 bg-destructive/5 px-4 py-3">
      <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {plural(errors, 'fila con errores no se importará', 'filas con errores no se importarán')}.
        Corrígelas y vuelve a subir el archivo, o descárgalas aparte.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={downloading !== null}
        onClick={() => onDownload('errors')}
      >
        {downloading === 'errors' ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Download aria-hidden />
        )}
        {downloading === 'errors' ? 'Preparando Excel…' : 'Descargar filas con errores'}
      </Button>
    </div>
  )
}
