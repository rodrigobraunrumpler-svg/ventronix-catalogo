'use client'

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Intent = 'create' | 'update'

// Hoja de cálculo con los colores de la marca: el elemento memorable de la pantalla (spec §6.11).
function SheetIllustration({ className }: { className?: string }) {
  const rows = [0, 1, 2, 3]
  return (
    <svg viewBox="0 0 260 180" aria-hidden className={cn('w-full', className)}>
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
        d="M211 150l8 8 14-15"
        fill="none"
        stroke="#0c0f0a"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Cabecera con migas, título y la ilustración (spec §6.1 y §6.2).
export function ImportHeader() {
  return (
    <header className="grid gap-4">
      <nav
        aria-label="Migas de pan"
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
      >
        <Link
          href="/products"
          prefetch
          className="font-semibold hover:text-foreground hover:underline"
        >
          Productos
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page" className="text-foreground">
          Carga masiva
        </span>
      </nav>
      <div className="grid items-center gap-6 overflow-hidden rounded-[18px] border bg-[linear-gradient(115deg,#eef7e2_0%,#f8fcf3_45%,#ffffff_100%)] p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="grid justify-items-start gap-3">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
            Carga masiva de productos
          </h1>
          <p className="max-w-[60ch] text-[15px] text-muted-foreground">
            Crea y actualiza muchos productos a la vez con un Excel. Antes de guardar te mostramos
            qué va a pasar con cada fila.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/products" prefetch>
              <ArrowLeft aria-hidden />
              Volver a Productos
            </Link>
          </Button>
        </div>
        <SheetIllustration className="max-lg:hidden" />
      </div>
    </header>
  )
}

const INTENTS = [
  {
    value: 'create',
    title: 'Cargar productos nuevos',
    text: 'Empieza con la plantilla: trae tus categorías y te guía columna por columna.',
    icon: Sparkles,
  },
  {
    value: 'update',
    title: 'Actualizar precios o datos',
    text: 'Descarga tu catálogo, cambia lo que necesites (puede ser solo el precio) y súbelo.',
    icon: RefreshCw,
  },
] as const

// «¿Qué quieres hacer?» (spec §6.2): radios nativos con aspecto de tarjeta, accesibles con flechas.
export function IntentCards({
  value,
  onChange,
}: {
  value: Intent
  onChange: (intent: Intent) => void
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 text-lg font-bold">¿Qué quieres hacer?</legend>
      <div className="grid gap-3 md:grid-cols-2">
        {INTENTS.map((intent) => {
          const Icon = intent.icon
          const selected = value === intent.value
          return (
            <label
              key={intent.value}
              className={cn(
                'relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-4 rounded-[14px] border-2 bg-card p-5 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                selected ? 'border-ring' : 'border-border hover:border-ring/50',
              )}
            >
              <input
                type="radio"
                name="import-intent"
                value={intent.value}
                checked={selected}
                onChange={() => onChange(intent.value)}
                className="sr-only"
              />
              <span
                className={cn(
                  'grid size-11 place-items-center rounded-xl',
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-secondary-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="grid gap-1 pr-7">
                <span className="font-bold">{intent.title}</span>
                <span className="text-sm text-muted-foreground">{intent.text}</span>
              </span>
              {selected ? (
                <CircleCheck className="absolute top-4 right-4 size-5 text-ring" aria-hidden />
              ) : null}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

const FAQ = [
  [
    '¿Qué pasa si el código ya existe?',
    'Se actualiza ese producto con los datos del archivo. Antes de guardar verás qué cambia en cada uno.',
  ],
  [
    '¿Puedo actualizar solo los precios?',
    'Sí. Deja en el archivo las columnas Código y Precio con IGV y borra las demás: el resto de los datos se mantiene.',
  ],
  [
    '¿Se borran los productos que no estén en el archivo?',
    'No. La carga masiva nunca borra productos: solo los crea y los actualiza.',
  ],
  [
    '¿Qué formatos de precio acepta?',
    'En soles y con IGV incluido: 1250.50, 1250,50, 1,250.50 o S/ 1250.50. Si tus precios no incluyen IGV, al revisar el archivo puedes pedir que se sume el 18 %.',
  ],
  [
    '¿Cuántos productos puedo subir a la vez?',
    'Hasta 5 000 por archivo, de hasta 4 MB. Si tienes más, divídelos en varios archivos.',
  ],
  [
    '¿Puedo deshacer una importación?',
    'Sí: el comprobante trae la hoja «Para revertir» con los valores anteriores de los productos actualizados. Súbela aquí para dejarlos como estaban. Los productos creados no se borran solos.',
  ],
] as const

// Preguntas frecuentes plegables (spec §6.2), con <details>: accesibles sin JavaScript.
export function ImportFaq() {
  return (
    <section aria-labelledby="import-faq" className="grid gap-3">
      <h2 id="import-faq" className="text-lg font-bold">
        Preguntas frecuentes
      </h2>
      <div className="divide-y rounded-[14px] border bg-card">
        {FAQ.map(([question, answer]) => (
          <details key={question} role="group" className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-semibold [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>
            <p className="pb-4 text-sm text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
