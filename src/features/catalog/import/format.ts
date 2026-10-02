import { formatPrice } from '../money'
import type {
  FieldChange,
  ImportMode,
  ImportOutcome,
  ImportPreview,
  PreviewCounts,
  PreviewRow,
  RowStatus,
} from './types'

// Pestañas de la tabla (spec §6.6). Las tarjetas de resumen también eligen una.
export const ROW_TABS = ['all', 'create', 'update', 'review', 'unchanged', 'error'] as const
export type RowTab = (typeof ROW_TABS)[number]

export const STATUS_LABELS: Record<RowStatus, string> = {
  create: 'Nuevo',
  update: 'Se actualiza',
  review: 'Para revisar',
  unchanged: 'Sin cambios',
  error: 'Con errores',
  omitted: 'Omitida',
}

// «S/ 1,250.50», como en el resto de la app.
export const money = (value: string) => `S/ ${formatPrice(value)}`

// 1234 → «1 234», como en los textos de la spec. El espacio no se parte al final de una línea.
export const count = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export const plural = (value: number, one: string, many: string) =>
  `${count(value)} ${value === 1 ? one : many}`

// «340 KB» o «1.2 MB», para el chip del archivo elegido.
export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

// «+12.5 %» o «−4.0 %»: con signo, un decimal y el mismo punto decimal que los precios, para que
// «S/ 1,350.00 (+12.5 %)» no mezcle separadores.
export const percentText = (ratio: number) =>
  `${ratio < 0 ? '−' : '+'}${Math.abs(ratio * 100).toFixed(1)} %`

export function priceRatio(before: string, after: string) {
  const base = Number(before)
  return base > 0 ? (Number(after) - base) / base : null
}

export function changeText(change: FieldChange) {
  switch (change.field) {
    case 'price': {
      if (!change.before || !change.after) return 'Precio cambia.'
      const ratio = priceRatio(change.before, change.after)
      const percent = ratio === null ? '' : ` (${percentText(ratio)})`
      return `Precio: ${money(change.before)} → ${money(change.after)}${percent}`
    }
    case 'category':
      return `Categoría: ${change.before ?? '—'} → ${change.after ?? '—'}`
    case 'name':
      return 'Nombre cambia.'
    case 'description':
      return 'Descripción cambia.'
  }
}

// La columna «Detalle» de cada fila (spec §6.6), sin los avisos, que van aparte en ámbar.
export function rowDetails(row: PreviewRow, mode: ImportMode): string[] {
  if (row.status === 'error') return row.errors
  if (row.status === 'omitted') {
    return [
      mode === 'create'
        ? 'Ya existe: el modo «Solo crear los nuevos» la deja fuera.'
        : 'No existe: el modo «Solo actualizar los existentes» la deja fuera.',
    ]
  }
  const lines: string[] = []
  if (row.action === 'create') lines.push('Producto nuevo.')
  if (row.action === 'unchanged') lines.push('Ya está igual: no se toca.')
  if (row.priceBeforeTax && row.price) {
    lines.push(`${money(row.priceBeforeTax)} + IGV → ${money(row.price)}`)
  }
  return [...lines, ...row.changes.map(changeText)]
}

// Texto y estado del botón principal (spec §6.6).
export function importButton(preview: Pick<ImportPreview, 'importable' | 'undecided' | 'counts'>) {
  const label = `Importar ${plural(preview.importable, 'producto', 'productos')}`
  if (preview.undecided > 0) {
    const reason =
      preview.undecided === 1
        ? 'Decide 1 categoría antes de importar.'
        : `Decide ${preview.undecided} categorías antes de importar.`
    return { enabled: false, label, reason }
  }
  if (preview.importable === 0) {
    const reason =
      preview.counts.unchanged > 0
        ? 'Tu catálogo ya está al día con este archivo.'
        : 'No hay filas para importar.'
    return { enabled: false, label: 'Importar', reason }
  }
  return { enabled: true, label, reason: null }
}

// «48 productos creados · 12 actualizados · 5 sin cambios · 2 categorías nuevas» (spec §6.10).
export function outcomeSummary(
  outcome: Pick<ImportOutcome, 'created' | 'updated' | 'unchanged' | 'categoriesCreated'>,
) {
  const parts: string[] = []
  if (outcome.created > 0) {
    parts.push(plural(outcome.created, 'producto creado', 'productos creados'))
  }
  if (outcome.updated > 0) parts.push(plural(outcome.updated, 'actualizado', 'actualizados'))
  if (outcome.unchanged > 0) parts.push(`${count(outcome.unchanged)} sin cambios`)
  if (outcome.categoriesCreated.length > 0) {
    parts.push(plural(outcome.categoriesCreated.length, 'categoría nueva', 'categorías nuevas'))
  }
  return parts.join(' · ')
}

// Nunca se dibujan miles de filas de golpe (spec §6.6).
export const PAGE_SIZE = 50

// La primera pestaña con contenido de este orden: Con errores, Para revisar, Se actualizan, Nuevos y
// Todas. Con el catálogo completo, «Todas» escondería los pocos cambios entre miles de filas sin
// cambios (revisión 2 del plan).
export const defaultTab = (counts: PreviewCounts): RowTab =>
  (['error', 'review', 'update', 'create'] as const).find((tab) => counts[tab] > 0) ?? 'all'

// Sin tildes ni mayúsculas: «impresion» encuentra «Impresión».
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function filterRows(rows: PreviewRow[], tab: RowTab, search: string) {
  const needle = fold(search.trim())
  return rows.filter(
    (row) =>
      (tab === 'all' || row.status === tab) &&
      (!needle || fold(row.code).includes(needle) || fold(row.name ?? '').includes(needle)),
  )
}

// «48 nuevos · 12 se actualizan · 3 para revisar»: lo que hará el botón Importar.
export function previewSummary(counts: PreviewCounts) {
  return [
    counts.create > 0 ? plural(counts.create, 'nuevo', 'nuevos') : null,
    counts.update > 0
      ? `${count(counts.update)} ${counts.update === 1 ? 'se actualiza' : 'se actualizan'}`
      : null,
    counts.review > 0 ? `${count(counts.review)} para revisar` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
