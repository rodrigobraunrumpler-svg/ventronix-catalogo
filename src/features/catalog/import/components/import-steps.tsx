'use client'

import {
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Upload,
  type LucideIcon,
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

type Download = 'template' | 'catalog'

const DOWNLOADS: {
  kind: Download
  icon: LucideIcon
  title: string
  text: string
  label: string
}[] = [
  {
    kind: 'template',
    icon: Sparkles,
    title: 'Para cargar productos nuevos',
    text: 'La plantilla trae las columnas listas, tus categorías en un desplegable y una hoja con instrucciones.',
    label: 'Descargar plantilla',
  },
  {
    kind: 'catalog',
    icon: RefreshCw,
    title: 'Para cambiar precios o datos',
    text: 'Tu catálogo completo, con el código de cada producto. Lo que no cambies se queda igual.',
    label: 'Descargar mi catálogo',
  },
]

// «¿Aún no tienes el archivo?» (spec §6.3): la plantilla o tu catálogo, junto a la zona de carga.
export function DownloadOptions() {
  const { pending, download } = useDownload<Download>()

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

  return (
    <aside
      aria-labelledby="import-files"
      className="grid content-start gap-4 rounded-[18px] border bg-card p-5 sm:p-6"
    >
      <div className="grid gap-1">
        <h2 id="import-files" className="text-lg font-bold">
          ¿Aún no tienes el archivo?
        </h2>
        <p className="text-sm text-muted-foreground">
          Descarga uno, complétalo en Excel y súbelo aquí.
        </p>
      </div>
      {DOWNLOADS.map(({ kind, icon: Icon, title, text, label }) => (
        <div key={kind} className="grid gap-3 rounded-[14px] border bg-background/60 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-secondary-foreground">
              <Icon className="size-4.5" aria-hidden />
            </span>
            <div className="grid gap-0.5">
              <p className="font-semibold">{title}</p>
              <p className="text-[13px] text-muted-foreground">{text}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="justify-self-start"
            disabled={pending !== null}
            onClick={() => void run(kind)}
          >
            {pending === kind ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            {pending === kind ? 'Preparando Excel…' : label}
          </Button>
        </div>
      ))}
    </aside>
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

// Ninguna ficha queda sola en su fila: en dos columnas la última ocupa las dos; en seis, tres fichas
// arriba y dos abajo; en cinco, todas en una fila, como la tabla.
const RULE_SPANS = [
  '@5xl:col-span-2 @7xl:col-span-1',
  '@5xl:col-span-2 @7xl:col-span-1',
  '@5xl:col-span-2 @7xl:col-span-1',
  '@5xl:col-span-3 @7xl:col-span-1',
  '@2xl:col-span-2 @5xl:col-span-3 @7xl:col-span-1',
]

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

// «¿Cómo completo el archivo?» (spec §6.4): plegada, para que mande la zona de carga. Dentro, los
// consejos y una maqueta de la hoja con aspecto de Excel: cada título es un botón que resalta su
// columna y su regla al pasar el cursor, enfocarlo o tocarlo; las reglas también están siempre a la
// vista debajo, como texto, para el teclado y los lectores de pantalla.
export function TemplateGuide() {
  const titles = templateTitles()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<ImportColumn | null>(null)
  const id = useId()
  const ruleId = (column: ImportColumn) => `${id}-${column}`
  const highlight = (column: ImportColumn) => ({
    onMouseEnter: () => setActive(column),
    onMouseLeave: () => setActive(null),
  })
  return (
    <details
      id="import-guide"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-[18px] border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[18px] p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-6 [&::-webkit-details-marker]:hidden">
        <span className="grid gap-0.5">
          <span className="text-lg font-bold">¿Cómo completo el archivo?</span>
          <span className="text-sm text-muted-foreground">
            Columnas, reglas y ejemplos de la plantilla.
          </span>
        </span>
        <ChevronDown
          className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden
        />
      </summary>
      {/* Solo se dibuja abierta: cerrada no ocupa nada. */}
      {open ? (
        <div className="@container grid min-w-0 gap-4 border-t p-5 sm:p-6">
          <ul className="grid gap-x-6 gap-y-1.5 text-sm text-muted-foreground @2xl:grid-cols-2">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-ring" aria-hidden />
                {tip}
              </li>
            ))}
          </ul>
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
                        className="w-full cursor-help px-2.5 py-2 text-left font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-primary focus-visible:ring-inset"
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
                          'border-t border-r px-2.5 py-1.5 last:border-r-0',
                          // Los textos se parten para que la tabla quepa; un código o un precio, nunca.
                          column === 'code' && 'whitespace-nowrap',
                          column === 'price' && 'text-right whitespace-nowrap tabular-nums',
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
          {/* Una ficha por columna: en una pantalla ancha, las cinco en una fila, como la tabla. */}
          <ul className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-6 @7xl:grid-cols-5">
            {IMPORT_COLUMNS.map((column, index) => (
              <li
                key={column}
                id={ruleId(column)}
                {...highlight(column)}
                data-active={active === column || undefined}
                className={cn(
                  'grid content-start gap-1 rounded-[12px] border bg-background/60 px-4 py-3 text-sm transition-colors data-active:border-ring data-active:bg-[#f6fbef] motion-reduce:transition-none',
                  RULE_SPANS[index],
                )}
              >
                <span className="font-semibold">
                  {titles[column]}
                  <span className="sr-only">: </span>
                </span>
                <span className="text-muted-foreground">{RULES[column]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
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

// Hoja de cálculo con los colores de la marca y una flecha de subida: el elemento memorable de la
// pantalla, en el centro de la zona de carga (spec §6.11).
function SheetIllustration({ className }: { className?: string }) {
  const rows = [0, 1, 2, 3]
  return (
    <svg viewBox="0 0 260 180" aria-hidden className={className}>
      <rect x="18" y="14" width="214" height="146" rx="14" fill="#ffffff" stroke="#e3e7de" />
      <path d="M18 28a14 14 0 0 1 14-14h186a14 14 0 0 1 14 14v18H18z" fill="#121511" />
      {[30, 86, 142, 190].map((x, index) => (
        <rect
          key={x}
          x={x}
          y="26"
          width={index === 3 ? 30 : 40}
          height="8"
          rx="4"
          fill={index === 3 ? '#72ce0b' : '#5d6559'}
        />
      ))}
      {rows.map((row) => (
        <g key={row}>
          <line x1="18" x2="232" y1={70 + row * 24} y2={70 + row * 24} stroke="#e3e7de" />
          <rect x="30" y={53 + row * 24} width="44" height="8" rx="4" fill="#d7dccf" />
          <rect
            x="86"
            y={53 + row * 24}
            width={row % 2 ? 36 : 48}
            height="8"
            rx="4"
            fill="#e3e7de"
          />
          <rect
            x="142"
            y={53 + row * 24}
            width="38"
            height="8"
            rx="4"
            fill={row === 1 ? '#c8ec9e' : '#e3e7de'}
          />
          <rect x="190" y={53 + row * 24} width="30" height="8" rx="4" fill="#e3e7de" />
        </g>
      ))}
      <circle cx="222" cy="150" r="22" fill="#72ce0b" />
      <path
        d="M222 161v-21m-9 9l9-9 9 9"
        fill="none"
        stroke="#0c0f0a"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// La zona de carga (spec §6.5), lo principal de la pantalla: un button real, grande, con un input
// oculto. El tamaño y la extensión se comprueban aquí antes de enviar, y otra vez en el servidor.
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
        <div className="flex flex-wrap items-center gap-3 rounded-[14px] border bg-background/60 px-5 py-4">
          <FileSpreadsheet className="size-6 shrink-0 text-ring" aria-hidden />
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
            if (!disabled) setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDragging(false)
          }}
          onDrop={drop}
          className="group grid min-h-[240px] cursor-pointer sm:min-h-[300px] content-center justify-items-center gap-3 rounded-[16px] border-2 border-dashed border-[#cfd6c6] bg-[#f8fbf4] px-6 py-10 text-center transition-colors outline-none hover:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70 data-dragging:border-ring data-dragging:bg-[#eef7e2] motion-reduce:transition-none"
        >
          <SheetIllustration className="mb-1 w-40 sm:w-44" />
          <span className="text-xl font-extrabold tracking-[-0.01em]">Arrastra tu Excel aquí</span>
          {/* Parece un botón para que se vea qué pulsar; el botón es toda la zona. */}
          <span className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
            <Upload className="size-4" aria-hidden />
            Elegir archivo
          </span>
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
