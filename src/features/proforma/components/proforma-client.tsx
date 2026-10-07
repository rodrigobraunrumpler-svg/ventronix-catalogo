'use client'

import { addDays, format } from 'date-fns'
import { Check, ChevronRight, History, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { lima } from '@/lib/dates'
import { digitsOnly, documentKind, isValidRuc } from '@/lib/peru'
import { cn } from '@/lib/utils'
import { patchClient, patchConditions, type ProformaClient as Client } from '../draft'
import type { ClientMatch } from '../history/queries'
import { clientErrors, validityError } from '../readiness'
import { isActiveTaxpayer, type RucLookupResult } from '../ruc'
import { useProforma } from '../store'

// Lo que se sabe del documento escrito: su historial y, si es un RUC, lo que dice SUNAT.
// Ocho dígitos también son el comienzo de un RUC: el DNI se busca cuando se deja de escribir.
const DNI_PAUSE_MS = 400

type Lookup = {
  document: string
  history: ClientMatch | null | 'loading'
  // Si el historial completó algún campo: el aviso no dice «datos completados» si no lo hizo.
  filled: boolean
  sunat: RucLookupResult | 'loading' | null // null: un DNI, que no se consulta en SUNAT
} | null

// Del historial solo se completa lo vacío; el tiempo de entrega no se copia (spec §4.3).
const fillEmpty = (client: Client, match: ClientMatch): Partial<Client> =>
  Object.fromEntries(
    (['name', 'phone', 'address'] as const)
      .filter((key) => !client[key].trim() && match[key])
      .map((key) => [key, match[key]]),
  )

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3'

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

// Pista bajo el campo: el error si lo hay; si no, una ayuda (spec §4.3 y prototipo).
function Hint({
  id,
  error,
  children,
}: {
  id: string
  error?: string | null
  children?: ReactNode
}) {
  if (error) {
    return (
      <p id={id} className="text-xs font-medium text-destructive">
        {error}
      </p>
    )
  }
  return children ? (
    <p id={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {children}
    </p>
  ) : null
}

export function ProformaClient({
  lookupRuc,
  findClient,
  defaultValidityDays,
}: {
  lookupRuc: (ruc: string) => Promise<RucLookupResult>
  findClient: (document: string) => Promise<ClientMatch | null>
  defaultValidityDays: number | null
}) {
  const { draft, update } = useProforma()
  const client = draft.client
  const [touched, setTouched] = useState<Partial<Record<keyof Client, boolean>>>({})
  const [lookup, setLookup] = useState<Lookup>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [today] = useState(() => new Date())
  const errors = clientErrors(client)
  const validity = validityError(draft.validityDays)
  const showMore = moreOpen || validity !== null
  const [edited, setEdited] = useState<Partial<Record<keyof Client, boolean>>>({})
  // Un campo se marca al salir de él solo si se escribió en él: pasar de largo (por ejemplo, al ir
  // al buscador de productos) no lo pone en rojo. «Generar» ya dice qué falta.
  const touch = (field: keyof Client) => {
    if (edited[field]) setTouched((current) => ({ ...current, [field]: true }))
  }
  const edit = (patch: Partial<Client>) => {
    setEdited((current) => ({
      ...current,
      ...Object.fromEntries(Object.keys(patch).map((key) => [key, true])),
    }))
    update((current) => patchClient(current, patch))
  }

  // Al completar un RUC o DNI válido, no en cada tecla (spec §7): el historial primero, que es
  // inmediato, y SUNAT en paralelo para un RUC. Si el documento cambió mientras tanto, las
  // respuestas no pisan nada.
  async function runLookup(document: string) {
    const isRuc = documentKind(document) === 'ruc'
    setLookup({ document, history: 'loading', filled: false, sunat: isRuc ? 'loading' : null })
    const sunatRequest = isRuc ? lookupRuc(document) : null
    const history = await findClient(document)
    let filled = false
    if (history) {
      update((current) => {
        if (current.client.document !== document) return current
        const patch = fillEmpty(current.client, history)
        filled = Object.keys(patch).length > 0
        return patchClient(current, patch)
      })
    }
    setLookup((current) =>
      current?.document === document ? { ...current, history, filled } : current,
    )
    if (!sunatRequest) return
    const result = await sunatRequest
    setLookup((current) =>
      current?.document === document ? { ...current, sunat: result } : current,
    )
    // Los datos de SUNAT solo se usan sin historial; su aviso de baja o no habido, siempre.
    if (history || result.kind !== 'found') return
    update((current) =>
      current.client.document === document
        ? patchClient(current, {
            name: result.company.legalName,
            address: result.company.address ?? current.client.address,
          })
        : current,
    )
  }

  const dniTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(dniTimer.current), [])

  function changeDocument(value: string) {
    const digits = digitsOnly(value).slice(0, 11)
    edit({ document: digits })
    clearTimeout(dniTimer.current)
    if (digits === client.document) return
    if (isValidRuc(digits)) void runLookup(digits)
    else if (documentKind(digits) === 'dni') {
      dniTimer.current = setTimeout(() => void runLookup(digits), DNI_PAUSE_MS)
    }
  }

  const nameError = touched.name ? errors.name : null
  const documentError = touched.document || client.document.length === 11 ? errors.document : null
  const kind = errors.document ? null : documentKind(client.document)
  const phoneError = touched.phone ? errors.phone : null
  const days = Number(draft.validityDays || defaultValidityDays || 0)
  const delivery = client.deliveryTime.trim()
  const summary = `${days ? `Validez ${days} días` : 'Validez de la empresa'}${
    delivery ? ` · Entrega: ${delivery}` : ''
  }`

  return (
    <section aria-labelledby="proforma-client-title">
      <h3 id="proforma-client-title" className="mb-2.5 text-sm font-bold text-foreground">
        Cliente
      </h3>
      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
        <Field id="client-name" label="Razón social o nombre" className="sm:col-span-2">
          <Input
            id="client-name"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'client-name-hint' : undefined}
            value={client.name}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => edit({ name: event.target.value })}
            onBlur={() => touch('name')}
          />
          <Hint id="client-name-hint" error={nameError} />
        </Field>
        <Field id="client-document" label="RUC o DNI">
          <Input
            id="client-document"
            aria-invalid={documentError ? true : undefined}
            aria-describedby={documentError || kind ? 'client-document-hint' : undefined}
            value={client.document}
            inputMode="numeric"
            autoComplete="off"
            className="tabular-nums"
            onChange={(event) => changeDocument(event.target.value)}
            onBlur={() => touch('document')}
          />
          <Hint id="client-document-hint" error={documentError}>
            {kind ? (
              <span className="flex items-center gap-1.5 text-ring">
                <Check className="size-3.5" aria-hidden />
                Es un {kind === 'ruc' ? 'RUC' : 'DNI'}
              </span>
            ) : null}
          </Hint>
        </Field>
        <Field id="client-phone" label="Celular">
          <Input
            id="client-phone"
            aria-invalid={phoneError ? true : undefined}
            aria-describedby="client-phone-hint"
            value={client.phone}
            type="tel"
            inputMode="tel"
            maxLength={11}
            autoComplete="off"
            className="tabular-nums"
            onChange={(event) => edit({ phone: event.target.value })}
            onBlur={() => touch('phone')}
          />
          <Hint id="client-phone-hint" error={phoneError}>
            Para enviársela por WhatsApp.
          </Hint>
        </Field>
      </div>

      <LookupStatus
        lookup={lookup?.document === client.document ? lookup : null}
        onRetry={() => void runLookup(client.document)}
      />

      <button
        type="button"
        aria-expanded={showMore}
        aria-controls="client-more"
        onClick={() => setMoreOpen(!showMore)}
        className="mt-3.5 flex w-full items-center gap-2 rounded-[10px] border bg-[#fafbf8] px-3 py-2.5 text-left text-sm font-semibold text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRight
          className={cn('size-4 shrink-0 transition-transform', showMore && 'rotate-90')}
          aria-hidden
        />
        <span className="flex-1">Más datos</span>
        <span className="min-w-0 truncate text-[13px] font-medium text-muted-foreground">
          {summary}
        </span>
      </button>
      {showMore ? (
        <div id="client-more" className="mt-3.5 grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
          <Field id="client-address" label="Dirección" className="sm:col-span-2">
            <Input
              id="client-address"
              value={client.address}
              maxLength={300}
              autoComplete="off"
              onChange={(event) => edit({ address: event.target.value })}
            />
          </Field>
          <Field id="client-delivery" label="Tiempo de entrega">
            <Input
              id="client-delivery"
              value={client.deliveryTime}
              maxLength={120}
              placeholder="Por ejemplo, 3 días hábiles"
              onChange={(event) => edit({ deliveryTime: event.target.value })}
            />
          </Field>
          <Field id="client-validity" label="Validez de la oferta">
            <div className="flex items-center gap-2.5">
              <Input
                id="client-validity"
                aria-invalid={validity ? true : undefined}
                aria-describedby="client-validity-hint"
                value={draft.validityDays}
                inputMode="numeric"
                maxLength={3}
                placeholder={defaultValidityDays ? String(defaultValidityDays) : undefined}
                className="w-20 text-center tabular-nums"
                onChange={(event) =>
                  update((current) =>
                    patchConditions(current, {
                      validityDays: event.target.value.replace(/\D/g, ''),
                    }),
                  )
                }
              />
              <span className="text-sm">
                días
                {!validity && days
                  ? ` · vence el ${format(addDays(today, days, { in: lima }), 'dd/MM', { in: lima })}`
                  : ''}
              </span>
            </div>
            <Hint id="client-validity-hint" error={validity} />
          </Field>
        </div>
      ) : null}
    </section>
  )
}

// Qué se completó y qué dice SUNAT (spec §4.3 y §4.5).
function LookupStatus({ lookup, onRetry }: { lookup: Lookup; onRetry: () => void }) {
  if (!lookup) return null
  const known = lookup.history === 'loading' ? null : lookup.history
  return (
    <>
      {known ? (
        <p role="status" className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-ring">
          <History className="size-3.5" aria-hidden />
          Cliente con {known.count} {known.count === 1 ? 'proforma' : 'proformas'}
          {lookup.filled ? ': datos completados' : '.'}
        </p>
      ) : null}
      {lookup.sunat ? (
        <RucStatus result={lookup.sunat} onlyWarning={known !== null} onRetry={onRetry} />
      ) : null}
    </>
  )
}

// Estados de la consulta (spec §4.5): cargando, encontrado, no encontrado, sin servicio y aviso.
// Con datos del historial, de SUNAT solo importa el aviso de baja o no habido.
function RucStatus({
  result,
  onlyWarning,
  onRetry,
}: {
  result: RucLookupResult | 'loading'
  onlyWarning: boolean
  onRetry: () => void
}) {
  if (
    onlyWarning &&
    (result === 'loading' || result.kind !== 'found' || isActiveTaxpayer(result.company))
  ) {
    return null
  }
  const base = 'mt-2.5 text-xs text-muted-foreground'
  if (result === 'loading') {
    return (
      <p role="status" className={cn(base, 'flex items-center gap-1.5')}>
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Buscando el RUC en SUNAT…
      </p>
    )
  }
  if (result.kind === 'not-found') {
    return (
      <p role="status" className={base}>
        No encontramos este RUC en SUNAT. Escribe los datos a mano.
      </p>
    )
  }
  if (result.kind === 'unavailable') {
    return (
      <p role="status" className={base}>
        No pudimos consultar SUNAT. Escribe los datos a mano o{' '}
        <button type="button" className={cn(inlineAction, 'text-xs')} onClick={onRetry}>
          vuelve a intentarlo
        </button>
        .
      </p>
    )
  }
  if (isActiveTaxpayer(result.company)) {
    return (
      <p role="status" className={base}>
        Datos de SUNAT. Puedes editarlos.
      </p>
    )
  }
  return (
    <p
      role="status"
      className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      SUNAT lo registra como {result.company.status} · {result.company.condition}. Puedes generar la
      proforma igual.
    </p>
  )
}
