'use client'

import { CalendarDays, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DATE_PRESET_LABELS,
  describeDateFilter,
  limaDay,
  type DateField,
  type DateFilter,
  type DatePreset,
} from '../../list-options'
import { useCatalogFilters } from '../hooks'

export type DateFilterChange = Pick<DateFilter, 'date' | 'from' | 'to'> & { dateBy?: DateField }

const FIELDS: { key: DateField; text: string; help: string }[] = [
  { key: 'created', text: 'Fecha de registro', help: 'Cuándo se creó el producto' },
  {
    key: 'updated',
    text: 'Última modificación',
    help: 'Cuándo cambió por última vez: precio, nombre, categoría…',
  },
]

const QUICK = ['today', '7d', '30d', 'month', 'last-month'] as const
const RANGES: { key: 'any' | DatePreset; text: string }[] = [
  { key: 'any', text: 'Cualquier fecha' },
  ...QUICK.map((key) => ({ key, text: DATE_PRESET_LABELS[key] })),
  { key: 'custom', text: 'Personalizado' },
]

const dateInput = 'h-9 rounded-md border border-input bg-card px-2 text-sm'

// Filtro de fecha de la lista (spec del Excel §4.2): qué fecha y qué rango. Los rangos rápidos se
// aplican al pulsarlos; el personalizado, con «Aplicar».
export function DateFilterControl({
  value,
  today,
  onChange,
}: {
  value: DateFilter
  today: string
  onChange: (change: DateFilterChange) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(value.date === 'custom')
  const [from, setFrom] = useState(value.from ?? '')
  const [to, setTo] = useState(value.to ?? '')
  const [error, setError] = useState<string | null>(null)
  const label = describeDateFilter(value)
  const selected = custom ? 'custom' : (value.date ?? 'any')
  const help = FIELDS.find((field) => field.key === value.dateBy)?.help

  function choose(change: DateFilterChange) {
    onChange(change)
    setOpen(false)
  }

  function applyCustom() {
    if (!from && !to) return setError('Elige al menos una fecha.')
    if (from && to && from > to)
      return setError('La fecha "Desde" no puede ser posterior a "Hasta".')
    setError(null)
    choose({ date: 'custom', from: from || null, to: to || null })
  }

  // Al abrir, el panel parte de lo que hay en la URL.
  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    setCustom(value.date === 'custom')
    setFrom(value.from ?? '')
    setTo(value.to ?? '')
    setError(null)
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          aria-label={label ? `Fecha: ${label}` : 'Filtrar por fecha'}
          className={cn('h-11 shrink-0 gap-2 px-3.5', label && 'border-ring bg-accent')}
        >
          <CalendarDays aria-hidden />
          {/* En el celular solo el icono, con un punto verde si hay filtro (spec §4.3). */}
          <span className="max-sm:hidden">{label ?? 'Fecha'}</span>
          {label ? <span className="size-2 rounded-full bg-primary sm:hidden" aria-hidden /> : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 grid w-[min(22rem,calc(100vw-2rem))] gap-4 rounded-xl border bg-popover p-4 text-sm shadow-lg"
        >
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-semibold">¿Qué fecha?</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {FIELDS.map((field) => (
                <label
                  key={field.key}
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-1.5 text-center text-[13px] font-medium has-focus-visible:ring-2 has-focus-visible:ring-ring',
                    value.dateBy === field.key
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-field`}
                    checked={value.dateBy === field.key}
                    onChange={() =>
                      onChange({
                        dateBy: field.key,
                        date: value.date,
                        from: value.from,
                        to: value.to,
                      })
                    }
                    className="sr-only"
                  />
                  {field.text}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{help}</p>
          </fieldset>

          <fieldset className="grid gap-0.5">
            <legend className="mb-1 font-semibold">Rango</legend>
            {RANGES.map((range) => (
              <label
                key={range.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <input
                  type="radio"
                  name={`${id}-range`}
                  checked={selected === range.key}
                  onChange={() => {
                    if (range.key === 'custom') return setCustom(true)
                    setCustom(false)
                    choose({ date: range.key === 'any' ? null : range.key, from: null, to: null })
                  }}
                  className="size-4 accent-ring"
                />
                {range.text}
              </label>
            ))}
          </fieldset>

          {custom ? (
            <div className="grid gap-3 rounded-lg border bg-background/60 p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-medium">
                  Desde
                  <input
                    type="date"
                    max={today}
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    className={dateInput}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Hasta
                  <input
                    type="date"
                    max={today}
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    className={dateInput}
                  />
                </label>
              </div>
              {error ? (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {error}
                </p>
              ) : null}
              <Button size="sm" onClick={applyCustom}>
                Aplicar
              </Button>
            </div>
          ) : null}

          {value.date ? (
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => choose({ date: null, from: null, to: null })}
            >
              <X aria-hidden />
              Quitar filtro
            </Button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function ProductDateFilter() {
  const [filters, setFilters] = useCatalogFilters()
  // Como «hoy» en la proforma: se fija al montar (solo limita los calendarios).
  const [today] = useState(() => limaDay(new Date()))
  return (
    <DateFilterControl
      value={filters}
      today={today}
      onChange={(change) => void setFilters({ ...change, page: null })}
    />
  )
}
