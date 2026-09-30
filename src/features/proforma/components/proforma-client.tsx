'use client'

import { addDays, format } from 'date-fns'
import { Check, ChevronRight, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { digitsOnly, documentKind, isValidRuc } from '@/lib/peru'
import { cn } from '@/lib/utils'
import { patchClient, patchConditions, type ProformaClient as Client } from '../draft'
import { clientErrors, validityError } from '../readiness'
import { isActiveTaxpayer, type RucLookupResult } from '../ruc'
import { useProforma } from '../store'

type Lookup = { ruc: string; result: RucLookupResult | 'loading' } | null

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
  defaultValidityDays,
}: {
  lookupRuc: (ruc: string) => Promise<RucLookupResult>
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
  const touch = (field: keyof Client) => setTouched((current) => ({ ...current, [field]: true }))
  const edit = (patch: Partial<Client>) => update((current) => patchClient(current, patch))

  // Se consulta al completar un RUC válido, no en cada tecla (spec §7). Si el documento cambió
  // mientras tanto, la respuesta no pisa nada.
  async function runLookup(ruc: string) {
    setLookup({ ruc, result: 'loading' })
    const result = await lookupRuc(ruc)
    setLookup((current) => (current?.ruc === ruc ? { ruc, result } : current))
    if (result.kind !== 'found') return
    update((current) =>
      current.client.document === ruc
        ? patchClient(current, {
            name: result.company.legalName,
            address: result.company.address ?? current.client.address,
          })
        : current,
    )
  }

  function changeDocument(value: string) {
    const digits = digitsOnly(value).slice(0, 11)
    edit({ document: digits })
    if (digits !== client.document && isValidRuc(digits)) void runLookup(digits)
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

      <RucStatus
        lookup={lookup?.ruc === client.document ? lookup : null}
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
                {!validity && days ? ` · vence el ${format(addDays(today, days), 'dd/MM')}` : ''}
              </span>
            </div>
            <Hint id="client-validity-hint" error={validity} />
          </Field>
        </div>
      ) : null}
    </section>
  )
}

// Estados de la consulta (spec §4.5): cargando, encontrado, no encontrado, sin servicio y aviso.
function RucStatus({ lookup, onRetry }: { lookup: Lookup; onRetry: () => void }) {
  if (!lookup) return null
  const { result } = lookup
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
