'use client'

import { useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Monitor, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { settle, type ActionResult } from '@/lib/action-result'
import { cn } from '@/lib/utils'
import {
  downloadImportErrors,
  downloadImportSimulation,
  importProducts,
  previewProductImport,
} from '../../products/excel-actions'
import { catalogKeys } from '../../query-keys'
import { defaultTab, plural, type RowTab } from '../format'
import { DEFAULT_IMPORT_OPTIONS } from '../options'
import type { CategoryDecision, ImportOptions, ImportOutcome, ImportPreview } from '../types'
import { useDownload } from '../use-download'
import { ErrorsNotice, ImportActionBar, ReviewNotice, type BarDownload } from './import-action-bar'
import { ImportFaq, ImportHeader } from './import-intro'
import {
  CategoryDecisions,
  ImportOptionsPanel,
  PartialNotice,
  SummaryCards,
  VisualSummary,
} from './import-preview'
import { ImportResult } from './import-result'
import { DownloadOptions, TemplateGuide, UploadStep, useIgnoreStrayDrops } from './import-steps'
import { PreviewRows } from './preview-rows'

type Stage = 'choose' | 'reading' | 'preview' | 'importing' | 'done'

// Si la app se actualizó con la pantalla abierta, las acciones viejas ya no existen: recargar lo arregla.
const READ_FAILED =
  'No pudimos revisar el archivo. Revisa tu conexión e inténtalo de nuevo; si sigue fallando, recarga la página.'
const IMPORT_FAILED =
  'No se importó nada. Revisa tu conexión e inténtalo de nuevo; tu archivo sigue seleccionado.'
// Sin respuesta no se sabe si la base alcanzó a guardar: no se puede decir «no se importó nada».
const CONNECTION_LOST =
  'Se cortó la conexión durante la importación. Revisamos tu archivo otra vez: la vista previa muestra cómo quedó tu catálogo.'

// El archivo y las opciones viajan en cada petición: el servidor vuelve a leer y validar todo
// (spec §9.2).
function requestData(file: File, options: ImportOptions) {
  const data = new FormData()
  data.set('file', file)
  data.set('options', JSON.stringify(options))
  return data
}

const smooth = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

// «Esto es lo que va a pasar» (spec §6.6): opciones, resumen, decisiones, filas y la barra fija.
function PreviewStage({
  preview,
  options,
  tab,
  refreshing,
  importing,
  downloading,
  onTab,
  onOptions,
  onChooseAnother,
  onDownload,
  onImport,
}: {
  preview: ImportPreview
  options: ImportOptions
  tab: RowTab
  refreshing: boolean
  importing: boolean
  downloading: BarDownload | null
  onTab: (tab: RowTab) => void
  onOptions: (options: ImportOptions) => void
  onChooseAnother: () => void
  onDownload: (kind: BarDownload) => void
  onImport: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  // Al llegar la vista previa, el foco va a su título (spec §6.11).
  useEffect(() => heading.current?.focus(), [])
  const busy = refreshing || importing
  const rows = plural(preview.rows.length, 'fila', 'filas')

  // Una tarjeta de resumen elige su pestaña y lleva a la tabla.
  function selectCard(next: RowTab) {
    onTab(next)
    document.getElementById('import-rows')?.scrollIntoView?.({ behavior: smooth(), block: 'start' })
  }

  function decide(key: string, decision: CategoryDecision) {
    onOptions({ ...options, categoryMap: { ...options.categoryMap, [key]: decision } })
  }

  // La barra fija va fuera de la sección animada: mientras dura la animación, un antecesor con
  // transform haría que «fixed» se midiera contra él y no contra la pantalla.
  return (
    <>
      <section
        aria-labelledby="import-preview"
        className="grid gap-6 motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in"
      >
        <div className="grid gap-1.5">
          <h2
            id="import-preview"
            ref={heading}
            tabIndex={-1}
            className="scroll-mt-24 text-2xl font-extrabold tracking-[-0.01em] outline-none"
          >
            Esto es lo que va a pasar
          </h2>
          {/* Otro archivo se elige desde la barra fija: una sola acción con un solo nombre. */}
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <FileSpreadsheet className="size-4 text-ring" aria-hidden />
            <span className="font-semibold break-all text-foreground">{preview.fileName}</span>
            <span>
              · hoja «{preview.sheetName}» · {rows}
            </span>
          </p>
          <p role="status" className="text-sm font-semibold text-ring">
            {refreshing ? `Revisando ${rows}…` : null}
          </p>
        </div>
        {preview.partialNotice ? <PartialNotice text={preview.partialNotice} /> : null}
        {preview.ignoredNotice ? <PartialNotice text={preview.ignoredNotice} /> : null}
        <ImportOptionsPanel
          options={options}
          counts={preview.counts}
          disabled={busy}
          onChange={onOptions}
        />
        <div
          className={cn(
            'grid gap-6 transition-opacity motion-reduce:transition-none',
            refreshing && 'opacity-60',
          )}
        >
          <SummaryCards counts={preview.counts} active={tab} onSelect={selectCard} />
          {preview.counts.error > 0 ? (
            <ErrorsNotice
              errors={preview.counts.error}
              downloading={downloading}
              onDownload={onDownload}
            />
          ) : null}
          {preview.counts.review > 0 ? <ReviewNotice reviews={preview.counts.review} /> : null}
          <CategoryDecisions choices={preview.choices} disabled={busy} onDecide={decide} />
          <VisualSummary prices={preview.prices} bars={preview.bars} />
          <PreviewRows
            rows={preview.rows}
            counts={preview.counts}
            mode={options.mode}
            tab={tab}
            onTab={onTab}
          />
        </div>
      </section>
      <ImportActionBar
        preview={preview}
        importing={importing}
        refreshing={refreshing}
        downloading={downloading}
        onChooseAnother={onChooseAnother}
        onDownload={onDownload}
        onImport={onImport}
      />
    </>
  )
}

// Carga masiva (spec del Excel §6): elegir el archivo, revisar qué pasará, importar y descargar el
// comprobante. El archivo se queda en el navegador y se reenvía en cada petición.
export function ImportScreen() {
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<Stage>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<RowTab>('all')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const latest = useRef(0)
  const { pending: downloading, download } = useDownload<BarDownload>()
  useIgnoreStrayDrops()

  // Salir mientras se guarda no deja nada a medias, pero se avisa (spec §6.9).
  useEffect(() => {
    if (stage !== 'importing') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [stage])

  // Pide la vista previa. Si mientras tanto llegó otra petición, esta respuesta ya no vale (null).
  async function review(chosen: File, next: ImportOptions) {
    const id = ++latest.current
    const result = await settle(previewProductImport(requestData(chosen, next)))
    return id === latest.current ? result : null
  }

  async function chooseFile(chosen: File) {
    // Cada archivo empieza con las opciones por defecto: así la hoja «Para revertir» nunca se sube
    // con «No incluyen IGV» de una carga anterior, que sumaría el 18 % a los precios de antes.
    const next = DEFAULT_IMPORT_OPTIONS
    setFile(chosen)
    setOptions(next)
    setError(null)
    setRefreshing(false)
    setStage('reading')
    const result = await review(chosen, next)
    if (!result) return
    if (!result.ok) {
      setFile(null)
      setStage('choose')
      setError(result.error.code === 'UNEXPECTED' ? READ_FAILED : result.error.message)
      return
    }
    setPreview(result.data)
    setTab(defaultTab(result.data.counts))
    setStage('preview')
  }

  async function refresh(next: ImportOptions) {
    if (!file) return
    const previous = options
    setOptions(next)
    setRefreshing(true)
    const result = await review(file, next)
    if (!result) return
    setRefreshing(false)
    if (!result.ok) {
      setOptions(previous)
      toast.error(result.error.code === 'UNEXPECTED' ? READ_FAILED : result.error.message)
      return
    }
    setPreview(result.data)
    // Si la pestaña elegida se quedó vacía, se abre la que toca.
    if (tab !== 'all' && result.data.counts[tab] === 0) setTab(defaultTab(result.data.counts))
  }

  async function importNow() {
    if (!file) return
    setStage('importing')
    let result: ActionResult<ImportOutcome>
    try {
      result = await importProducts(requestData(file, options))
    } catch {
      // Lo que ya se haya importado sale «Sin cambios» en la vista previa nueva.
      setStage('preview')
      toast.error(CONNECTION_LOST)
      void refresh(options)
      return
    }
    if (result.ok) {
      setOutcome(result.data)
      setStage('done')
      // Productos, categorías e indicadores quedan al día al volver a la lista (spec §6.10).
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all })
      return
    }
    setStage('preview')
    // La base revirtió todo: no se guardó nada.
    if (result.error.code === 'UNEXPECTED') {
      toast.error(IMPORT_FAILED)
      return
    }
    toast.error(result.error.message)
    // El catálogo cambió desde la vista previa (otra pestaña, una categoría borrada): se revisa de nuevo.
    if (result.error.code === 'CONFLICT' || result.error.code === 'VALIDATION')
      void refresh(options)
  }

  function downloadExtra(kind: BarDownload) {
    if (!file) return
    const action = kind === 'simulation' ? downloadImportSimulation : downloadImportErrors
    void download(
      kind,
      () => action(requestData(file, options)),
      () =>
        toast.success(
          kind === 'simulation' ? 'Simulación descargada' : 'Filas con errores descargadas',
        ),
    )
  }

  // Vuelve a la zona de carga con el foco en ella, lista para elegir otro archivo.
  function startOver() {
    latest.current += 1
    flushSync(() => {
      setStage('choose')
      setFile(null)
      setPreview(null)
      setOutcome(null)
      setRefreshing(false)
      setError(null)
      setOptions(DEFAULT_IMPORT_OPTIONS)
    })
    document.getElementById('import-dropzone')?.focus()
  }

  if (stage === 'done' && outcome) {
    return (
      <div className="grid gap-8">
        <ImportHeader />
        <ImportResult
          outcome={outcome}
          downloading={downloading}
          onErrors={() => downloadExtra('errors')}
          onAgain={startOver}
        />
      </div>
    )
  }

  if ((stage === 'preview' || stage === 'importing') && preview) {
    return (
      <div className="grid gap-8">
        <ImportHeader />
        <PreviewStage
          preview={preview}
          options={options}
          tab={tab}
          refreshing={refreshing}
          importing={stage === 'importing'}
          downloading={downloading}
          onTab={setTab}
          onOptions={(next) => void refresh(next)}
          onChooseAnother={startOver}
          onDownload={downloadExtra}
          onImport={() => void importNow()}
        />
      </div>
    )
  }

  // Lo principal es dónde subir el Excel; al lado, de dónde sacarlo, y debajo, la ayuda plegada.
  return (
    <div className="grid gap-6">
      <ImportHeader />
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground md:hidden">
        <Monitor className="size-4 shrink-0" aria-hidden />
        Es más cómodo desde una PC.
      </p>
      <div className="@container">
        <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <section
            aria-labelledby="import-upload"
            className="grid gap-4 rounded-[18px] border bg-card p-5 sm:p-6"
          >
            <div className="grid gap-1">
              <h2 id="import-upload" className="text-lg font-bold">
                Sube tu Excel
              </h2>
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ring" aria-hidden />
                Nada se guarda hasta que confirmes: primero verás qué pasará con cada fila.
              </p>
            </div>
            <UploadStep
              file={file}
              status={stage === 'reading' ? 'Leyendo tu Excel…' : null}
              error={error}
              disabled={stage === 'reading'}
              onFile={(chosen) => void chooseFile(chosen)}
            />
          </section>
          <DownloadOptions />
        </div>
      </div>
      <TemplateGuide />
      <ImportFaq />
    </div>
  )
}
