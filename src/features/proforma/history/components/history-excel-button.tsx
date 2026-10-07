'use client'

import { FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { settle } from '@/lib/action-result'
import { base64ToFile, downloadFile, XLSX_MIME } from '@/lib/files'
import { cn } from '@/lib/utils'
import { exportProformas } from '../actions'
import type { HistoryExportFilters } from '../export-request'

// «Descargar Excel» (spec de productos libres §4.2 y §6): lo filtrado, como en Productos. Sin nada
// que descargar se ve desactivado, pero no con `disabled`: un botón desactivado no recibe el mouse
// ni el foco, y el motivo no se vería. Así lo explica al pasar el mouse, al pulsarlo y a los
// lectores de pantalla.
export function HistoryExcelButton({
  filters,
  unavailable,
}: {
  filters: HistoryExportFilters
  // Por qué no hay nada que descargar; null si se puede.
  unavailable: string | null
}) {
  const [pending, setPending] = useState(false)

  async function download() {
    setPending(true)
    const result = await settle(exportProformas(filters))
    setPending(false)
    if (!result.ok) {
      toast.error(
        result.error.code === 'UNEXPECTED'
          ? 'No se pudo preparar el Excel. Revisa tu conexión e inténtalo de nuevo.'
          : result.error.message,
      )
      return
    }
    const { base64, fileName, count, truncated } = result.data
    downloadFile(base64ToFile(base64, fileName, XLSX_MIME))
    if (truncated) {
      toast.warning(
        'Se descargaron las primeras 10 000 proformas. Usa los filtros para descargar el resto.',
      )
    } else {
      toast.success(`Excel descargado · ${count} ${count === 1 ? 'proforma' : 'proformas'}`)
    }
  }

  return (
    <Button
      variant="outline"
      disabled={pending}
      aria-disabled={unavailable ? true : undefined}
      title={unavailable ?? undefined}
      className={cn(unavailable && 'cursor-not-allowed opacity-50')}
      onClick={() => (unavailable ? toast(unavailable) : void download())}
    >
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : (
        <FileSpreadsheet aria-hidden />
      )}
      {pending ? 'Preparando Excel…' : 'Descargar Excel'}
    </Button>
  )
}
