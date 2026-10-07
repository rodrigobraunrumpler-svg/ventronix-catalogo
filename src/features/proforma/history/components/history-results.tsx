'use client'

import { Download, Eye, FileText, Search, Send } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Pagination } from '@/components/pagination'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDay } from '@/features/catalog/list-options'
import { formatPrice } from '@/features/catalog/money'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { formatProformaNumber } from '../../number'
import { HISTORY_PAGE_SIZE, type HistoryPage, type ProformaRow } from '../queries'

export type RowActions = {
  onView: (row: ProformaRow) => void
  onDownload: (row: ProformaRow) => void
  // Todas las proformas de ese cliente (plan, decisión 23).
  onClient: (row: ProformaRow) => void
  onResend: (row: ProformaRow) => void
  // La fila cuyo PDF se está preparando.
  pendingId: string | null
}

type HistoryResultsProps = RowActions & {
  page: number
  data: HistoryPage
  // Hoy en Lima (AAAA-MM-DD), para marcar las vencidas.
  today: string
  // Llega otra página o búsqueda: la actual se atenúa sin vaciarse.
  updating?: boolean
  onPage: (page: number) => void
  onClear: () => void
  onNew: () => void
}

const shortNumber = (number: number) => String(number).padStart(4, '0')

// Resumen del periodo, tabla (PC), tarjetas (móvil) y páginas (spec de productos libres §4.2).
export function HistoryResults({
  page,
  data,
  today,
  updating = false,
  onPage,
  onClear,
  onNew,
  ...actions
}: HistoryResultsProps) {
  if (data.all === 0) {
    return (
      <EmptyState
        icon={<FileText className="size-6" aria-hidden />}
        title="Todavía no hay proformas guardadas"
        text="Las proformas que generes quedan aquí para volver a enviarlas."
        action={<Button onClick={onNew}>Nueva proforma</Button>}
      />
    )
  }
  if (data.total === 0) {
    return (
      <EmptyState
        icon={<Search className="size-6" aria-hidden />}
        title="Ninguna proforma coincide con la búsqueda"
        text="Prueba con otro cliente, documento, número o rango de fechas."
        action={
          <Button variant="outline" onClick={onClear}>
            Limpiar filtros
          </Button>
        }
      />
    )
  }
  const totalPages = Math.max(1, Math.ceil(data.total / HISTORY_PAGE_SIZE))
  const from = (page - 1) * HISTORY_PAGE_SIZE + 1
  return (
    <>
      <p className="border-b px-4 py-2.5 text-[13px] text-muted-foreground sm:px-5">
        <span className="font-semibold text-foreground">
          {data.total} {data.total === 1 ? 'proforma' : 'proformas'}
        </span>{' '}
        · suman{' '}
        <span className="font-semibold text-foreground tabular-nums">
          S/ {formatPrice(data.sum)}
        </span>
      </p>
      <div
        aria-busy={updating}
        className={cn('transition-opacity motion-reduce:transition-none', updating && 'opacity-60')}
      >
        <HistoryTable items={data.items} today={today} {...actions} />
        <HistoryCards items={data.items} today={today} {...actions} />
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        label="Páginas de proformas"
        summary={`Proformas ${from}–${from + data.items.length - 1} de ${data.total}`}
        onPage={onPage}
      />
    </>
  )
}

export function HistoryLoading() {
  return (
    <div>
      <span className="sr-only">Cargando proformas…</span>
      {[46, 38, 52, 34, 44].map((width) => (
        <div key={width} className="flex h-14 items-center gap-4 border-b px-5 last:border-b-0">
          <Skeleton className="h-3 w-12 rounded-md" />
          <Skeleton className="h-3 rounded-md" style={{ width: `${width}%` }} />
          <Skeleton className="ml-auto h-3.5 w-20 rounded-md" />
        </div>
      ))}
    </div>
  )
}

// «Vencida» cuando la validez ya pasó; el último día todavía vale (plan, decisión 21).
function ValidUntil({ row, today }: { row: ProformaRow; today: string }) {
  const expired = row.valid_until < today
  return (
    <span className={cn('tabular-nums', expired && 'text-amber-800')}>
      {formatDay(row.valid_until)}
      {expired ? <span className="block text-[11px] font-semibold">Vencida</span> : null}
    </span>
  )
}

function ClientButton({
  row,
  onClient,
  className,
}: {
  row: ProformaRow
  onClient: RowActions['onClient']
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={`Ver las proformas de ${row.client_name}`}
      title="Ver todas sus proformas"
      className={cn(
        'max-w-full cursor-pointer truncate text-left font-semibold decoration-primary decoration-2 underline-offset-3 hover:underline',
        className,
      )}
      onClick={() => onClient(row)}
    >
      {row.client_name}
    </button>
  )
}

function RowButtons({
  row,
  onView,
  onDownload,
  onResend,
  pendingId,
}: RowActions & { row: ProformaRow }) {
  const label = formatProformaNumber(row.number)
  const busy = pendingId === row.id
  return (
    <div className="inline-flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Ver PDF de la proforma ${label}`}
        title="Ver PDF"
        disabled={busy}
        onClick={() => onView(row)}
      >
        <Eye aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Descargar PDF de la proforma ${label}`}
        title="Descargar PDF"
        disabled={busy}
        onClick={() => onDownload(row)}
      >
        <Download aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="ml-1"
        aria-label={`Reenviar la proforma ${label}`}
        onClick={() => onResend(row)}
      >
        <Send aria-hidden />
        Reenviar
      </Button>
    </div>
  )
}

// PC: ordenada por número, de la más reciente a la más antigua (spec §4.2). Ocho columnas no caben
// en menos de 1280 px: debajo van las tarjetas, y «Productos» aparece desde 1400 px.
function HistoryTable({
  items,
  today,
  ...actions
}: RowActions & { items: ProformaRow[]; today: string }) {
  const th =
    'h-11 border-b bg-background/60 px-3 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase'
  return (
    <table className="hidden w-full table-fixed border-collapse text-left text-sm xl:table">
      <caption className="sr-only">Proformas guardadas</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(th, 'w-20 pl-5')}>
            N°
          </th>
          <th scope="col" className={cn(th, 'w-26')}>
            Fecha
          </th>
          <th scope="col" className={th}>
            Cliente
          </th>
          <th scope="col" className={cn(th, 'w-32')}>
            RUC/DNI
          </th>
          <th scope="col" className={cn(th, 'hidden w-24 text-right min-[1400px]:table-cell')}>
            Productos
          </th>
          <th scope="col" className={cn(th, 'w-34 text-right')}>
            Total
          </th>
          <th scope="col" className={cn(th, 'w-26')}>
            Vence
          </th>
          <th scope="col" className={cn(th, 'w-56 pr-5 text-right')}>
            Acciones
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr key={row.id} className="border-b last:border-b-0 hover:bg-background/40">
            <td className="py-3 pl-5 font-mono text-[13px] font-bold">{shortNumber(row.number)}</td>
            <td className="px-3 py-3 tabular-nums">{formatDate(row.issued_at)}</td>
            <td className="px-3 py-3">
              <ClientButton row={row} onClient={actions.onClient} className="block" />
            </td>
            <td className="px-3 py-3 tabular-nums">{row.client_document || '—'}</td>
            <td className="hidden px-3 py-3 text-right tabular-nums min-[1400px]:table-cell">
              {row.item_count}
            </td>
            <td className="px-3 py-3 text-right font-bold whitespace-nowrap tabular-nums">
              S/ {formatPrice(row.total)}
            </td>
            <td className="px-3 py-3">
              <ValidUntil row={row} today={today} />
            </td>
            <td className="py-3 pr-5 pl-2 text-right">
              <RowButtons row={row} {...actions} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Móvil: tarjetas con número, fecha, cliente, documento y total (spec §4.2).
function HistoryCards({
  items,
  today,
  onDownload,
  onClient,
  onResend,
  pendingId,
}: RowActions & { items: ProformaRow[]; today: string }) {
  return (
    <ul className="xl:hidden">
      {items.map((row) => (
        <li key={row.id} className="grid gap-2.5 border-t px-4 py-3.5 first:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div className="grid min-w-0">
              <span className="font-mono text-xs font-bold text-muted-foreground">
                {formatProformaNumber(row.number)} · {formatDate(row.issued_at)}
                {row.valid_until < today ? (
                  <span className="ml-1.5 font-sans text-amber-800">· Vencida</span>
                ) : null}
              </span>
              <ClientButton row={row} onClient={onClient} />
              {row.client_document ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {row.client_document}
                </span>
              ) : null}
            </div>
            <span className="font-bold whitespace-nowrap tabular-nums">
              S/ {formatPrice(row.total)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={`Descargar PDF de la proforma ${formatProformaNumber(row.number)}`}
              disabled={pendingId === row.id}
              onClick={() => onDownload(row)}
            >
              <Download aria-hidden />
              Descargar
            </Button>
            <Button
              size="sm"
              aria-label={`Reenviar la proforma ${formatProformaNumber(row.number)}`}
              onClick={() => onResend(row)}
            >
              <Send aria-hidden />
              Reenviar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
