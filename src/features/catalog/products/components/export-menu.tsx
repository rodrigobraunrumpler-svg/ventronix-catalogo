'use client'

import { ChevronDown, FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { settle } from '@/lib/action-result'
import { base64ToFile, downloadFile, XLSX_MIME } from '@/lib/files'
import type { ExportFilters, ExportFormat } from '../../excel/export-request'
import { exportProducts } from '../excel-actions'

const OPTIONS: { format: ExportFormat; title: string; help: string }[] = [
  {
    format: 'report',
    title: 'Reporte completo',
    help: 'Todos los datos, para ti. Se puede volver a subir en Carga masiva.',
  },
  {
    format: 'price-list',
    title: 'Lista de precios',
    help: 'Para enviar a tus clientes: con tus datos de contacto y agrupada por categoría.',
  },
]

// «Descargar Excel» (spec del Excel §5.1): lo filtrado y en el orden de la lista. Muestra «Excel»
// para que la cabecera quepa en una línea en un laptop; el nombre completo va en aria-label y title.
export function ExportMenu({ filters, disabled }: { filters: ExportFilters; disabled: boolean }) {
  const [pending, setPending] = useState(false)
  const name = pending ? 'Preparando Excel…' : 'Descargar Excel'

  async function download(format: ExportFormat) {
    setPending(true)
    const result = await settle(exportProducts(filters, format))
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
        'Se descargaron los primeros 10 000 productos. Usa los filtros para descargar el resto.',
      )
    } else {
      toast.success(`Excel descargado · ${count} ${count === 1 ? 'producto' : 'productos'}`)
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled || pending}>
        <Button
          variant="outline"
          size="sm"
          aria-label={name}
          title={disabled ? 'No hay productos para descargar con estos filtros.' : name}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet aria-hidden />
          )}
          <span className="max-sm:hidden">{pending ? 'Preparando…' : 'Excel'}</span>
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 grid w-72 gap-1 rounded-xl border bg-popover p-1.5 shadow-lg"
        >
          {OPTIONS.map((option) => (
            <DropdownMenu.Item
              key={option.format}
              onSelect={() => void download(option.format)}
              className="grid cursor-pointer gap-0.5 rounded-lg px-3 py-2.5 outline-none data-highlighted:bg-accent"
            >
              <span className="text-sm font-semibold">{option.title}</span>
              <span className="text-xs text-muted-foreground">{option.help}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
