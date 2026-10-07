'use client'

import { CircleAlert, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { limaDay } from '@/features/catalog/list-options'
import { ProformaBar } from '../../components/proforma-bar'
import { ProformaDialog } from '../../components/proforma-dialog'
import { EMPTY_DRAFT } from '../../draft'
import { formatCents } from '../../money'
import { ProformaProvider, useProforma } from '../../store'
import { totalsFromText } from '../../totals'
import { useHistoryFilters, useProformaHistory, useStoredDocument } from '../hooks'
import { HISTORY_PAGE_SIZE } from '../queries'
import { HistoryFilters } from './history-filters'
import { HistoryLoading, HistoryResults } from './history-results'
import { NewProformaPrompt } from './new-proforma-prompt'

// Proformas (spec de productos libres §4.2): el historial para buscar, descargar y reenviar, y
// «Nueva proforma» sin pasar por el catálogo.
export function ProformasScreen() {
  return (
    <ProformaProvider>
      <ProformasContent />
    </ProformaProvider>
  )
}

function ProformasContent() {
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  // Lo elegido en la pregunta se hace cuando ya se cerró.
  const afterPrompt = useRef<(() => void) | null>(null)
  const { draft, update } = useProforma()
  const { filters, query } = useProformaHistory()
  const [, setFilters] = useHistoryFilters()
  const documents = useStoredDocument()
  // Como «hoy» en la proforma: se fija al montar. Marca las vencidas.
  const [today] = useState(() => limaDay(new Date()))
  const listRef = useRef<HTMLElement>(null)
  const data = query.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / HISTORY_PAGE_SIZE)) : 1
  const products = draft.lines.length
  const totals = totalsFromText(draft)

  // Si la página pedida ya no existe (por ejemplo, la URL de un enlace viejo), se muestra la última.
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && filters.page > totalPages) {
      void setFilters({ page: totalPages === 1 ? null : totalPages })
    }
  }, [data, filters.page, totalPages, setFilters])

  function openEmpty() {
    update(() => EMPTY_DRAFT)
    setOpen(true)
  }

  // «Nueva proforma» empieza una vacía. Una ya generada está guardada y se reemplaza; una sin
  // generar no se borra sin preguntar (plan, decisión 4).
  function startNew() {
    if (draft.number === null && products > 0) setAsking(true)
    else openEmpty()
  }

  // Con los botones de abajo, la página nueva se lee desde el principio, como en Productos.
  function goToPage(page: number) {
    void setFilters({ page: page === 1 ? null : page })
    const list = listRef.current
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
              Proformas
            </h1>
            {data ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{data.all}</span>{' '}
                {data.all === 1 ? 'proforma' : 'proformas'} ·{' '}
                <span className="font-semibold text-foreground">{data.thisMonth}</span> este mes
              </p>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Todas las proformas generadas. Búscalas por cliente o fecha y reenvíalas cuando el
            cliente las pierda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={startNew}>
            <Plus aria-hidden />
            Nueva proforma
          </Button>
        </div>
      </div>

      <section
        ref={listRef}
        aria-label="Historial de proformas"
        aria-busy={query.isPending}
        className="min-w-0 scroll-mt-16 overflow-clip rounded-[14px] border bg-card shadow-xs lg:scroll-mt-0"
      >
        <HistoryFilters />
        {query.isPending ? (
          <HistoryLoading />
        ) : query.isError || !data ? (
          <EmptyState
            tone="error"
            icon={<CircleAlert className="size-6" aria-hidden />}
            title="No pudimos cargar las proformas"
            text="Revisa tu conexión a internet e inténtalo de nuevo. Tus proformas no se han perdido."
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                <RefreshCw aria-hidden />
                Reintentar
              </Button>
            }
          />
        ) : (
          <HistoryResults
            page={Math.min(filters.page, totalPages)}
            data={data}
            today={today}
            updating={query.isPlaceholderData}
            onPage={goToPage}
            onClear={() =>
              void setFilters({ search: null, date: null, from: null, to: null, page: null })
            }
            onNew={startNew}
            onClient={(row) =>
              void setFilters({
                search: row.client_document || row.client_name,
                date: null,
                from: null,
                to: null,
                page: null,
              })
            }
            onView={(row) => void documents.view(row)}
            onDownload={(row) => void documents.download(row)}
            pendingId={documents.pending}
          />
        )}
      </section>

      <ProformaBar onComplete={() => setOpen(true)} />
      <ProformaDialog open={open} onClose={() => setOpen(false)} />
      <NewProformaPrompt
        open={asking}
        summary={`${products} ${products === 1 ? 'producto' : 'productos'} · S/ ${totals ? formatCents(totals.total) : '—'}`}
        onKeep={() => {
          afterPrompt.current = () => setOpen(true)
        }}
        onStartNew={() => {
          afterPrompt.current = openEmpty
          setAsking(false)
        }}
        onClose={() => setAsking(false)}
        onClosed={() => {
          afterPrompt.current?.()
          afterPrompt.current = null
        }}
      />
    </div>
  )
}
