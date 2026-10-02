'use client'

import {
  CircleAlert,
  CircleMinus,
  CirclePlus,
  Info,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { TAX_CONFIG } from '@/features/proforma/tax'
import { cn } from '@/lib/utils'
import { count, percentText, plural, type RowTab } from '../format'
import { MODE_LABELS } from '../options'
import {
  IMPORT_MODES,
  type CategoryBar,
  type CategoryChoice,
  type CategoryDecision,
  type ImportOptions,
  type PreviewCounts,
  type PriceTrend,
  type RowStatus,
} from '../types'

// Cada estado con su icono y su color; el color nunca va solo, siempre con texto (spec §6.6).
export const STATUS_STYLES: Record<RowStatus, { icon: LucideIcon; tone: string }> = {
  create: { icon: CirclePlus, tone: 'bg-[#eef7e2] text-[#3f7d0a]' },
  update: { icon: RefreshCw, tone: 'bg-sky-50 text-sky-700' },
  review: { icon: TriangleAlert, tone: 'bg-amber-50 text-amber-800' },
  unchanged: { icon: CircleMinus, tone: 'bg-muted text-muted-foreground' },
  error: { icon: CircleAlert, tone: 'bg-destructive/10 text-destructive' },
  omitted: { icon: CircleMinus, tone: 'bg-muted text-muted-foreground' },
}

// «Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios…» (spec §6.6).
export function PartialNotice({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-3 rounded-[12px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text}
    </p>
  )
}

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-checked:border-ring has-checked:bg-[#f6fbef] has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-wait has-disabled:opacity-70">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-ring"
      />
      {children}
    </label>
  )
}

// Opciones de importación, siempre visibles; al cambiarlas se recalcula la vista previa (spec §6.6).
export function ImportOptionsPanel({
  options,
  counts,
  disabled,
  onChange,
}: {
  options: ImportOptions
  counts: PreviewCounts
  disabled: boolean
  onChange: (options: ImportOptions) => void
}) {
  return (
    <section
      aria-labelledby="import-options"
      className="grid gap-4 rounded-[14px] border bg-card p-5"
    >
      <h3 id="import-options" className="font-bold">
        Opciones de importación
      </h3>
      <div className="grid gap-5 md:grid-cols-2">
        <fieldset disabled={disabled} className="grid content-start gap-2">
          <legend className="mb-2 text-sm font-semibold">Los precios de este archivo</legend>
          <Choice
            name="import-tax"
            checked={options.pricesIncludeTax}
            onChange={() => onChange({ ...options, pricesIncludeTax: true })}
          >
            Incluyen IGV
          </Choice>
          <Choice
            name="import-tax"
            checked={!options.pricesIncludeTax}
            onChange={() => onChange({ ...options, pricesIncludeTax: false })}
          >
            No incluyen IGV: sumar {TAX_CONFIG.ratePercent} %
          </Choice>
        </fieldset>
        <fieldset disabled={disabled} className="grid content-start gap-2">
          <legend className="mb-2 text-sm font-semibold">Qué hacer</legend>
          {IMPORT_MODES.map((mode) => (
            <Choice
              key={mode}
              name="import-mode"
              checked={options.mode === mode}
              onChange={() => onChange({ ...options, mode })}
            >
              {MODE_LABELS[mode]}
            </Choice>
          ))}
        </fieldset>
      </div>
      {counts.omitted > 0 ? (
        <p className="text-sm text-muted-foreground">
          {plural(counts.omitted, 'fila omitida', 'filas omitidas')} por el modo «
          {MODE_LABELS[options.mode]}».
        </p>
      ) : null}
    </section>
  )
}

const CARDS: { status: Exclude<RowTab, 'all'>; title: string; text: string }[] = [
  { status: 'create', title: 'Nuevos', text: 'Se crearán.' },
  { status: 'update', title: 'Se actualizan', text: 'El código ya existe y algo cambia.' },
  { status: 'review', title: 'Para revisar', text: 'Se importan, pero conviene mirarlos.' },
  { status: 'unchanged', title: 'Sin cambios', text: 'Ya están iguales: no se tocan.' },
  { status: 'error', title: 'Con errores', text: 'No se importan.' },
]

// Tarjetas de resumen (spec §6.6): cada fila cuenta en una sola. Al pulsar una, la tabla muestra
// esas filas.
export function SummaryCards({
  counts,
  active,
  onSelect,
}: {
  counts: PreviewCounts
  active: RowTab
  onSelect: (tab: RowTab) => void
}) {
  return (
    <div
      role="group"
      aria-label="Resumen de la vista previa"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {CARDS.map((card) => {
        const { icon: Icon, tone } = STATUS_STYLES[card.status]
        return (
          <button
            key={card.status}
            type="button"
            aria-pressed={active === card.status}
            onClick={() => onSelect(card.status)}
            className="grid cursor-pointer content-start gap-1.5 rounded-[14px] border bg-card p-4 text-left transition-colors outline-none hover:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-ring aria-pressed:ring-1 aria-pressed:ring-ring"
          >
            <span className={cn('mb-1 grid size-9 place-items-center rounded-lg', tone)}>
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="text-[28px] leading-none font-extrabold tabular-nums">
              {count(counts[card.status])}
            </span>
            <span className="font-semibold">{card.title}</span>
            <span className="text-[13px] text-muted-foreground">{card.text}</span>
          </button>
        )
      })}
    </div>
  )
}

// Resumen visual (spec §6.6): precios que suben y bajan, y productos por categoría. Las barras
// llevan su cifra en texto.
export function VisualSummary({ prices, bars }: { prices: PriceTrend; bars: CategoryBar[] }) {
  const moved = prices.up + prices.down
  const most = Math.max(1, ...bars.map((bar) => bar.products))
  const shown = bars.slice(0, 8)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section
        aria-labelledby="import-prices"
        className="grid content-start gap-3 rounded-[14px] border bg-card p-5"
      >
        <h3 id="import-prices" className="font-bold">
          Precios
        </h3>
        {moved === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún precio cambia con este archivo.</p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold text-[#3f7d0a]">Suben {count(prices.up)}</span>
              {prices.upAverage === null ? '' : ` (promedio ${percentText(prices.upAverage)})`}
              {' · '}
              <span className="font-semibold text-amber-800">Bajan {count(prices.down)}</span>
              {prices.downAverage === null ? '' : ` (promedio ${percentText(prices.downAverage)})`}
            </p>
            <div aria-hidden className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="bg-[#72ce0b]" style={{ width: `${(prices.up / moved) * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${(prices.down / moved) * 100}%` }} />
            </div>
          </>
        )}
      </section>
      <section
        aria-labelledby="import-by-category"
        className="grid content-start gap-3 rounded-[14px] border bg-card p-5"
      >
        <h3 id="import-by-category" className="font-bold">
          Por categoría
        </h3>
        <ul className="grid gap-2.5">
          {shown.map((bar) => (
            <li key={bar.name} className="grid gap-1">
              <span className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{bar.name}</span>
                  {bar.tag ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 text-[11px] font-bold',
                        bar.tag === 'new'
                          ? 'bg-[#eef7e2] text-[#3f7d0a]'
                          : 'bg-amber-50 text-amber-800',
                      )}
                    >
                      {bar.tag === 'new' ? 'nueva' : '¿parecida?'}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {plural(bar.products, 'producto', 'productos')}
                </span>
              </span>
              <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-[#72ce0b]"
                  style={{ width: `${(bar.products / most) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        {bars.length > shown.length ? (
          <p className="text-[13px] text-muted-foreground">
            y {plural(bars.length - shown.length, 'categoría más', 'categorías más')}.
          </p>
        ) : null}
      </section>
    </div>
  )
}

// Categorías nuevas y parecidas (spec §6.8): decisiones que hay que tomar antes de importar, para
// que nunca aparezca un duplicado por descuido. La casi igual ya viene decidida, pero se puede cambiar.
export function CategoryDecisions({
  choices,
  disabled,
  onDecide,
}: {
  choices: CategoryChoice[]
  disabled: boolean
  onDecide: (key: string, decision: CategoryDecision) => void
}) {
  if (choices.length === 0) return null
  const doubtful = choices.filter((choice) => choice.kind !== 'new')
  const created = choices.filter((choice) => choice.kind === 'new')
  const pending = doubtful.filter((choice) => choice.decision === null).length
  return (
    <section
      aria-labelledby="import-category-choices"
      className="grid gap-4 rounded-[14px] border bg-card p-5"
    >
      <div className="grid gap-1">
        <h3 id="import-category-choices" className="font-bold">
          Categorías nuevas y parecidas
        </h3>
        <p className="text-sm text-muted-foreground">
          {pending > 0
            ? `Decide ${plural(pending, 'categoría', 'categorías')} antes de importar: así no se crean duplicadas.`
            : 'Así quedarán las categorías del archivo.'}
        </p>
      </div>
      {doubtful.length > 0 ? (
        <ul className="grid gap-3">
          {doubtful.map((choice) => {
            const undecided = choice.decision === null
            const using = choice.decision?.action === 'use'
            const creating = choice.decision?.action === 'create'
            return (
              <li
                key={choice.key}
                className={cn(
                  'grid gap-3 rounded-[12px] border p-4',
                  undecided ? 'border-amber-400 bg-amber-50/60' : 'bg-background/60',
                )}
              >
                <p className="text-sm">
                  {choice.kind === 'near' ? (
                    <>
                      «<strong>{choice.name}</strong>» es casi igual a «
                      <strong>{choice.suggestion}</strong>».
                    </>
                  ) : (
                    <>
                      «<strong>{choice.name}</strong>» se parece a «
                      <strong>{choice.suggestion}</strong>». ¿Usar esa?
                    </>
                  )}{' '}
                  <span className="text-muted-foreground">
                    {plural(choice.products, 'producto', 'productos')}.
                  </span>
                </p>
                {undecided ? (
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800">
                    <TriangleAlert className="size-4" aria-hidden />
                    Elige una opción para poder importar.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={using ? 'default' : 'outline'}
                    aria-pressed={using}
                    disabled={disabled}
                    onClick={() =>
                      onDecide(choice.key, {
                        action: 'use',
                        target: choice.suggestion ?? choice.name,
                      })
                    }
                  >
                    Usar &quot;{choice.suggestion}&quot;
                  </Button>
                  <Button
                    size="sm"
                    variant={creating ? 'default' : 'outline'}
                    aria-pressed={creating}
                    disabled={disabled}
                    onClick={() => onDecide(choice.key, { action: 'create' })}
                  >
                    Crear &quot;{choice.name}&quot;
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      {created.length > 0 ? (
        <p className="text-sm">
          <span className="font-semibold">Se crearán:</span>{' '}
          {created.map((choice) => `${choice.name} (${count(choice.products)})`).join(' · ')}
        </p>
      ) : null}
    </section>
  )
}
