'use client'

import { ChevronLeft, ChevronRight, Search, TriangleAlert } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { useDeferredValue, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  count,
  filterRows,
  money,
  PAGE_SIZE,
  ROW_TABS,
  rowDetails,
  STATUS_LABELS,
  type RowTab,
} from '../format'
import type { ImportMode, PreviewCounts, PreviewRow, RowStatus } from '../types'
import { STATUS_STYLES } from './import-preview'

const TAB_LABELS: Record<RowTab, string> = {
  all: 'Todas',
  create: 'Nuevos',
  update: 'Se actualizan',
  review: 'Para revisar',
  unchanged: 'Sin cambios',
  error: 'Con errores',
}

function StatusBadge({ status }: { status: RowStatus }) {
  const { icon: Icon, tone } = STATUS_STYLES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap',
        tone,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  )
}

// Detalle de una fila (spec §6.6): qué cambia, los errores en rojo y los avisos en ámbar.
function RowDetail({ row, mode }: { row: PreviewRow; mode: ImportMode }) {
  return (
    <ul className="grid gap-1 text-[13px]">
      {rowDetails(row, mode).map((line, index) => (
        <li
          key={`${index}-${line}`}
          className={row.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}
        >
          {line}
        </li>
      ))}
      {row.warnings.map((warning) => (
        <li key={warning} className="flex items-start gap-1.5 font-semibold text-amber-800">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {warning}
        </li>
      ))}
    </ul>
  )
}

const shownPrice = (row: PreviewRow) => (row.price ? money(row.price) : '—')

// Una página de filas: tabla en PC y tarjetas en móvil (spec §6.6). La página vuelve a la primera
// al cambiar la búsqueda; al cambiar de pestaña, este componente se monta de nuevo.
function RowsPage({
  rows,
  tab,
  search,
  mode,
}: {
  rows: PreviewRow[]
  tab: RowTab
  search: string
  mode: ImportMode
}) {
  const [paging, setPaging] = useState({ search, page: 0 })
  const filtered = filterRows(rows, tab, search)
  if (filtered.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground">
        {search.trim()
          ? `Ninguna fila coincide con «${search.trim()}».`
          : 'No hay filas en esta pestaña.'}
      </p>
    )
  }
  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const page = Math.min(paging.search === search ? paging.page : 0, pages - 1)
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const range = `Filas ${count(page * PAGE_SIZE + 1)}–${count(page * PAGE_SIZE + shown.length)} de ${count(filtered.length)}`
  const go = (next: number) => setPaging({ search, page: next })
  return (
    <div className="grid">
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">
            {TAB_LABELS[tab]}: {range}
          </caption>
          <thead className="border-b bg-muted/50 text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="w-16 px-4 py-2.5 font-semibold">
                Fila
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Estado
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Código
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Nombre
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Categoría
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                Precio
              </th>
              <th scope="col" className="w-[32%] px-4 py-2.5 font-semibold">
                Detalle
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((row) => (
              <tr key={row.line} className="align-top">
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{row.line}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 font-semibold break-all">{row.code || '—'}</td>
                <td className="px-4 py-3">{row.name ?? '—'}</td>
                <td className="px-4 py-3">{row.category ?? '—'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {shownPrice(row)}
                </td>
                <td className="px-4 py-3">
                  <RowDetail row={row} mode={mode} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={`${TAB_LABELS[tab]}: ${range}`} className="grid gap-3 p-4 md:hidden">
        {shown.map((row) => (
          <li key={row.line} className="grid gap-2 rounded-[12px] border bg-background/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={row.status} />
              <span className="text-[13px] text-muted-foreground">Fila {row.line}</span>
            </div>
            <p className="grid">
              <span className="font-semibold break-all">{row.code || '—'}</span>
              <span>{row.name ?? '—'}</span>
            </p>
            <p className="text-[13px] text-muted-foreground">
              {row.category ?? '—'} · {shownPrice(row)}
            </p>
            <RowDetail row={row} mode={mode} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-[13px] text-muted-foreground">
        <span>{range}</span>
        {pages > 1 ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Página anterior"
              disabled={page === 0}
              onClick={() => go(page - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Página siguiente"
              disabled={page === pages - 1}
              onClick={() => go(page + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Filas de la vista previa (spec §6.6): pestañas con su cifra, búsqueda en el navegador y páginas
// de 50. La pestaña la controla la pantalla, porque las tarjetas de resumen también la cambian.
export function PreviewRows({
  rows,
  counts,
  mode,
  tab,
  onTab,
}: {
  rows: PreviewRow[]
  counts: PreviewCounts
  mode: ImportMode
  tab: RowTab
  onTab: (tab: RowTab) => void
}) {
  const [search, setSearch] = useState('')
  // Escribir nunca se traba, aunque haya 5 000 filas que filtrar: la tabla se pone al día después.
  const deferredSearch = useDeferredValue(search)
  const tabCount = (value: RowTab) => (value === 'all' ? rows.length : counts[value])
  return (
    <section aria-labelledby="import-rows" className="grid min-w-0 rounded-[14px] border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h3 id="import-rows" className="font-bold">
          Filas del archivo
        </h3>
        <div className="relative w-full sm:max-w-[320px]">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor="import-search" className="sr-only">
            Buscar por código o nombre
          </label>
          <Input
            id="import-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={120}
            autoComplete="off"
            placeholder="Buscar por código o nombre…"
            className="bg-background/60 pl-9"
          />
        </div>
      </div>
      <Tabs.Root
        value={tab}
        onValueChange={(value) => onTab(value as RowTab)}
        className="grid min-w-0"
      >
        <Tabs.List aria-label="Filas por estado" className="flex overflow-x-auto border-b px-2">
          {ROW_TABS.map((value) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset data-[state=active]:text-foreground data-[state=active]:after:bg-primary"
            >
              {TAB_LABELS[value]}
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums">
                {count(tabCount(value))}
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {ROW_TABS.map((value) => (
          <Tabs.Content key={value} value={value} className="outline-none">
            <RowsPage rows={rows} tab={value} search={deferredSearch} mode={mode} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </section>
  )
}
