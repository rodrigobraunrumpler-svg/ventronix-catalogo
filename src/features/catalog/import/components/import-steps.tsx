'use client'

import {
  Check,
  CircleAlert,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Monitor,
  Upload,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ExportFilters } from '../../excel/export-request'
import { downloadImportTemplate, exportProducts } from '../../products/excel-actions'
import { count, fileSize, plural } from '../format'
import { checkFile, IMPORT_MAX_ROWS, templateTitles } from '../options'
import { IMPORT_COLUMNS, type ImportColumn } from '../types'
import { useDownload } from '../use-download'
import type { Intent } from './import-intro'

// Un paso numerado (spec §6.11): aquí la numeración sí es una secuencia. La línea que une los pasos
// es decorativa y va en el hueco entre tarjetas, hasta el centro del círculo (24 + 18 px).
function Step({
  number,
  title,
  className,
  children,
}: {
  number: number
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <li
      className={cn(
        'relative grid min-w-0 content-start gap-4 rounded-[16px] border bg-card p-6',
        number > 1 &&
          'before:absolute before:-top-4 before:left-[41px] before:h-4 before:w-0.5 before:bg-[#c8ec9e]',
        className,
      )}
    >
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-base font-extrabold text-primary-foreground"
        >
          {number}
        </span>
        <span>
          <span className="sr-only">Paso {number}: </span>
          {title}
        </span>
      </h2>
      {children}
    </li>
  )
}

// Los tres pasos (spec §6.2): en PC el 1 y el 3 a la izquierda, uno sobre otro, y la guía del 2, más
// alta, a la derecha. Así no queda un hueco junto a la guía y la zona de carga se ve sin bajar tanto.
// En móvil van uno debajo de otro.
export function ImportSteps({ intent, upload }: { intent: Intent; upload: ReactNode }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground md:hidden">
        <Monitor className="size-4 shrink-0" aria-hidden />
        Es más cómodo desde una PC.
      </p>
      <ol className="grid gap-4 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start">
        <Step number={1} title="Descarga el archivo">
          <DownloadStep intent={intent} />
        </Step>
        <Step
          number={2}
          title={intent === 'create' ? 'Complétalo' : 'Cambia lo que necesites'}
          className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:before:top-[41px] lg:before:-left-4 lg:before:h-0.5 lg:before:w-4"
        >
          <TemplateGuide intent={intent} />
        </Step>
        <Step number={3} title="Súbelo" className="lg:col-start-1 lg:row-start-2">
          {upload}
        </Step>
      </ol>
    </div>
  )
}

// Todo el catálogo, sin filtros y por nombre (spec §6.3): «Descargar mi catálogo» es el reporte
// completo.
const WHOLE_CATALOG: ExportFilters = {
  search: '',
  category: null,
  dateBy: 'created',
  date: null,
  from: null,
  to: null,
  sort: 'name',
}

type Download = 'template' | 'catalog'

const DOWNLOADS: Record<Download, { label: string; text: string; hint: string }> = {
  template: {
    label: 'Descargar plantilla',
    text: 'Tiene las columnas listas, tus categorías en un desplegable y una hoja con instrucciones y ejemplos.',
    hint: '¿Vas a cargar productos nuevos?',
  },
  catalog: {
    label: 'Descargar mi catálogo',
    text: 'Trae todos tus productos con su código: cambia lo que necesites y súbelo. Lo que no cambies se queda igual.',
    hint: '¿Vas a cambiar productos que ya tienes?',
  },
}

// Sin productos, la acción dice «No hay productos para descargar con estos filtros»; aquí no hay
// filtros, así que se sugiere la plantilla.
async function catalogFile() {
  const result = await exportProducts(WHOLE_CATALOG, 'report')
  if (result.ok || result.error.code !== 'VALIDATION') return result
  return {
    ...result,
    error: {
      ...result.error,
      message: 'Tu catálogo todavía no tiene productos. Empieza con la plantilla.',
    },
  }
}

// Paso 1 (spec §6.3): el archivo de la intención elegida como botón principal; el otro, como enlace.
export function DownloadStep({ intent }: { intent: Intent }) {
  const { pending, download } = useDownload<Download>()
  const primary: Download = intent === 'create' ? 'template' : 'catalog'
  const secondary: Download = primary === 'template' ? 'catalog' : 'template'

  function run(kind: Download) {
    if (kind === 'template') {
      return download('template', downloadImportTemplate, () =>
        toast.success('Plantilla descargada'),
      )
    }
    return download('catalog', catalogFile, (file) => {
      // El reporte puede traer hasta 10 000 productos; la carga masiva acepta 5 000 por archivo.
      if (file.count > IMPORT_MAX_ROWS) {
        toast.warning(
          `Tu catálogo tiene ${count(file.count)} productos y cada carga acepta hasta ${count(IMPORT_MAX_ROWS)}: divide el archivo antes de subirlo.`,
        )
      } else {
        toast.success(`Catálogo descargado · ${plural(file.count, 'producto', 'productos')}`)
      }
    })
  }

  const label = (kind: Download) => (pending === kind ? 'Preparando Excel…' : DOWNLOADS[kind].label)
  return (
    <div className="grid content-start gap-4">
      <p className="text-sm text-muted-foreground">{DOWNLOADS[primary].text}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button onClick={() => void run(primary)} disabled={pending !== null}>
          {pending === primary ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          {label(primary)}
        </Button>
        <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          {DOWNLOADS[secondary].hint}
          <Button
            variant="link"
            className="h-auto px-0 py-0 text-sm"
            onClick={() => void run(secondary)}
            disabled={pending !== null}
          >
            {label(secondary)}
          </Button>
        </span>
      </div>
    </div>
  )
}

// Reglas de cada columna (spec §6.4).
const RULES: Record<ImportColumn, ReactNode> = {
  code: (
    <>
      <strong>Siempre obligatorio</strong> y único, hasta 64 caracteres. Se guarda en mayúsculas.{' '}
      <strong>Si ya existe, se actualiza ese producto.</strong>
    </>
  ),
  name: 'Hasta 120 caracteres. Obligatorio para productos nuevos.',
  description: 'Opcional, hasta 2 000 caracteres. Puede tener varias líneas.',
  category: (
    <>
      Obligatoria para productos nuevos. Elígela del desplegable o escribe una nueva:{' '}
      <strong>se creará</strong>. No distingue mayúsculas.
    </>
  ),
  price: (
    <>
      Mayor que 0, con hasta 2 decimales, en soles y <strong>con IGV incluido</strong>. Obligatorio
      para productos nuevos. Vale <code>1250.50</code>, <code>1250,50</code>, <code>1,250.50</code>{' '}
      o <code>S/ 1250.50</code>.
    </>
  ),
}

// Dos filas como las de la hoja «Productos», con el formato de precio de la plantilla.
const EXAMPLE_ROWS: Record<ImportColumn, string>[] = [
  {
    code: 'LAP-001',
    name: 'Laptop 14" Core i5',
    description: 'Core i5 · 16 GB · SSD 512 GB',
    category: 'Laptops',
    price: 'S/ 2,590.00',
  },
  {
    code: 'IMP-014',
    name: 'Impresora láser HP M404dn',
    description: 'Monocromática, dúplex',
    category: 'Impresoras',
    price: 'S/ 1,180.00',
  },
]

const TIPS = [
  'No cambies los títulos de la primera fila.',
  'Una fila por producto.',
  'Para actualizar solo precios, deja las columnas Código y Precio con IGV y borra las demás.',
  'Puedes dejar filas vacías: se ignoran.',
]

// Paso 2 (spec §6.4): maqueta de la plantilla con aspecto de Excel. Cada título es un botón que
// resalta su columna y su regla al pasar el cursor, enfocarlo o tocarlo; las reglas también están
// siempre visibles debajo, como texto, para el teclado y los lectores de pantalla.
export function TemplateGuide({ intent }: { intent: Intent }) {
  const titles = templateTitles()
  const [active, setActive] = useState<ImportColumn | null>(null)
  const id = useId()
  const ruleId = (column: ImportColumn) => `${id}-${column}`
  const highlight = (column: ImportColumn) => ({
    onMouseEnter: () => setActive(column),
    onMouseLeave: () => setActive(null),
  })
  return (
    <div className="grid min-w-0 content-start gap-4">
      {intent === 'update' ? (
        <p className="text-sm text-muted-foreground">
          Tu catálogo trae las mismas columnas que la plantilla, con algunas más que se ignoran al
          subirlo.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Ejemplo de la hoja Productos de la plantilla</caption>
          <thead>
            <tr aria-hidden className="bg-muted text-center text-[11px] text-muted-foreground">
              <td className="w-8 border-r" />
              {IMPORT_COLUMNS.map((column, index) => (
                <td
                  key={column}
                  className={cn(
                    'border-r px-2 py-0.5 last:border-r-0',
                    active === column && 'bg-[#e4f4cf] font-bold text-foreground',
                  )}
                >
                  {String.fromCharCode(65 + index)}
                </td>
              ))}
            </tr>
            <tr>
              <td
                aria-hidden
                className="border-t border-r bg-muted text-center text-[11px] text-muted-foreground"
              >
                1
              </td>
              {IMPORT_COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'border-t border-r p-0 last:border-r-0',
                    active === column ? 'bg-[#3f7d0a]' : 'bg-[#121511]',
                  )}
                >
                  <button
                    type="button"
                    aria-describedby={ruleId(column)}
                    {...highlight(column)}
                    onFocus={() => setActive(column)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive(column)}
                    className="w-full cursor-help px-2.5 py-2 text-left font-bold whitespace-nowrap text-white outline-none focus-visible:ring-3 focus-visible:ring-primary focus-visible:ring-inset"
                  >
                    {titles[column]}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXAMPLE_ROWS.map((row, index) => (
              <tr key={row.code}>
                <td
                  aria-hidden
                  className="border-t border-r bg-muted text-center text-[11px] text-muted-foreground"
                >
                  {index + 2}
                </td>
                {IMPORT_COLUMNS.map((column) => (
                  <td
                    key={column}
                    className={cn(
                      'border-t border-r px-2.5 py-1.5 whitespace-nowrap last:border-r-0',
                      column === 'price' && 'text-right tabular-nums',
                      active === column && 'bg-[#f6fbef]',
                    )}
                  >
                    {row[column]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-1.5">
        {IMPORT_COLUMNS.map((column) => (
          <li
            key={column}
            id={ruleId(column)}
            {...highlight(column)}
            data-active={active === column || undefined}
            className="rounded-lg border border-transparent px-3 py-2 text-sm transition-colors data-active:border-ring/40 data-active:bg-[#f6fbef] motion-reduce:transition-none"
          >
            <span className="font-semibold">{titles[column]}:</span> {RULES[column]}
          </li>
        ))}
      </ul>
      <ul className="grid gap-1.5 text-sm text-muted-foreground">
        {TIPS.map((tip) => (
          <li key={tip} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-ring" aria-hidden />
            {tip}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Soltar un archivo fuera de la zona de carga no lo abre en el navegador, en ninguna etapa de la
// pantalla (la vista previa no tiene zona de carga).
export function useIgnoreStrayDrops() {
  useEffect(() => {
    const ignore = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', ignore)
    window.addEventListener('drop', ignore)
    return () => {
      window.removeEventListener('dragover', ignore)
      window.removeEventListener('drop', ignore)
    }
  }, [])
}

// Paso 3 (spec §6.5): un button real con un input oculto. El tamaño y la extensión se comprueban
// aquí antes de enviar, y otra vez en el servidor.
export function UploadStep({
  file,
  status,
  error,
  disabled,
  onFile,
}: {
  file: File | null
  status: string | null
  error: string | null
  disabled: boolean
  onFile: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  function choose(chosen: File | undefined) {
    if (!chosen) return
    const message = checkFile(chosen)
    setProblem(message)
    if (!message) onFile(chosen)
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!disabled) choose(event.dataTransfer.files[0])
  }

  const message = problem ?? error
  const browse = () => input.current?.click()
  return (
    <div className="grid gap-3">
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(event) => {
          choose(event.target.files?.[0])
          // Así, elegir otra vez el mismo archivo (ya corregido) vuelve a enviarlo.
          event.target.value = ''
        }}
      />
      {file && !message ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] border bg-background/60 px-4 py-3">
          <FileSpreadsheet className="size-5 shrink-0 text-ring" aria-hidden />
          <span className="grid min-w-0 flex-1">
            <span className="truncate font-semibold">{file.name}</span>
            <span className="text-[13px] text-muted-foreground">{fileSize(file.size)}</span>
          </span>
          <Button variant="outline" size="sm" onClick={browse} disabled={disabled}>
            Cambiar archivo
          </Button>
        </div>
      ) : (
        <button
          id="import-dropzone"
          type="button"
          onClick={browse}
          disabled={disabled}
          data-dragging={dragging || undefined}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDragging(false)
          }}
          onDrop={drop}
          className="grid cursor-pointer justify-items-center gap-2 rounded-[16px] border-2 border-dashed border-[#cfd6c6] bg-background/60 px-6 py-10 text-center transition-colors outline-none hover:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70 data-dragging:border-ring data-dragging:bg-[#eef7e2] motion-reduce:transition-none"
        >
          <span className="grid size-12 place-items-center rounded-full bg-[#eef7e2] text-ring">
            <Upload className="size-5" aria-hidden />
          </span>
          <span className="font-semibold">Arrastra tu Excel aquí o elige un archivo</span>
          <span className="text-[13px] text-muted-foreground">
            Solo .xlsx · hasta 4 MB · hasta {count(IMPORT_MAX_ROWS)} productos
          </span>
        </button>
      )}
      <div role="status">
        {status ? (
          <div className="grid gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <LoaderCircle
                className="size-4 animate-spin text-ring motion-reduce:animate-none"
                aria-hidden
              />
              {status}
            </p>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full animate-pulse rounded-full bg-primary/70 motion-reduce:animate-none" />
            </div>
          </div>
        ) : null}
      </div>
      {message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[12px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
      ) : null}
    </div>
  )
}
