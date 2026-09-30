'use client'

import { ChevronDown, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { digitsOnly, isValidRuc } from '@/lib/peru'
import { cn } from '@/lib/utils'
import { patchClient, patchConditions, type ProformaClient as Client } from '../draft'
import { clientErrors, validityError } from '../readiness'
import { isActiveTaxpayer, type RucLookupResult } from '../ruc'
import { useProforma } from '../store'

type Lookup = { ruc: string; result: RucLookupResult | 'loading' } | null

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional ? (
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">Opcional</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const fieldProps = (id: string, error?: string | null) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
})

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
  const phoneError = touched.phone ? errors.phone : null
  const days = draft.validityDays || (defaultValidityDays ? String(defaultValidityDays) : '')
  const summary = `${days ? `Validez ${days} días` : 'Validez de la empresa'} · Entrega: ${
    client.deliveryTime.trim() || 'sin indicar'
  }`

  return (
    <section aria-labelledby="proforma-client-title" className="grid gap-4">
      <h3 id="proforma-client-title" className="text-sm font-bold">
        Cliente
      </h3>
      <Field id="client-name" label="Razón social o nombre" error={nameError}>
        <Input
          {...fieldProps('client-name', nameError)}
          value={client.name}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => edit({ name: event.target.value })}
          onBlur={() => touch('name')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="client-document" label="RUC o DNI" optional error={documentError}>
          <Input
            {...fieldProps('client-document', documentError)}
            value={client.document}
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            onChange={(event) => changeDocument(event.target.value)}
            onBlur={() => touch('document')}
          />
        </Field>
        <Field id="client-phone" label="Celular" optional error={phoneError}>
          <Input
            {...fieldProps('client-phone', phoneError)}
            value={client.phone}
            type="tel"
            inputMode="tel"
            maxLength={11}
            autoComplete="off"
            placeholder="987 654 321"
            onChange={(event) => edit({ phone: event.target.value })}
            onBlur={() => touch('phone')}
          />
        </Field>
      </div>
      <RucStatus
        lookup={lookup?.ruc === client.document ? lookup : null}
        onRetry={() => void runLookup(client.document)}
      />
      <div className="rounded-lg border">
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="client-more"
          onClick={() => setMoreOpen(!showMore)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="font-semibold">Más datos</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
          <ChevronDown
            className={cn('size-4 shrink-0 transition-transform', showMore && 'rotate-180')}
            aria-hidden
          />
        </button>
        {showMore ? (
          <div id="client-more" className="grid gap-4 border-t p-3">
            <Field id="client-address" label="Dirección" optional>
              <Input
                id="client-address"
                value={client.address}
                maxLength={300}
                autoComplete="off"
                onChange={(event) => edit({ address: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="client-delivery" label="Tiempo de entrega" optional>
                <Input
                  id="client-delivery"
                  value={client.deliveryTime}
                  maxLength={120}
                  placeholder="Por ejemplo, 3 días hábiles"
                  onChange={(event) => edit({ deliveryTime: event.target.value })}
                />
              </Field>
              <Field id="client-validity" label="Validez de la oferta (días)" error={validity}>
                <Input
                  {...fieldProps('client-validity', validity)}
                  value={draft.validityDays}
                  inputMode="numeric"
                  maxLength={3}
                  placeholder={defaultValidityDays ? String(defaultValidityDays) : undefined}
                  onChange={(event) =>
                    update((current) =>
                      patchConditions(current, {
                        validityDays: event.target.value.replace(/\D/g, ''),
                      }),
                    )
                  }
                />
              </Field>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

// Estados de la consulta (spec §4.5): cargando, encontrado, no encontrado, sin servicio y aviso.
function RucStatus({ lookup, onRetry }: { lookup: Lookup; onRetry: () => void }) {
  if (!lookup) return null
  const { result } = lookup
  if (result === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Buscando el RUC en SUNAT…
      </p>
    )
  }
  if (result.kind === 'not-found') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No encontramos este RUC en SUNAT. Escribe los datos a mano.
      </p>
    )
  }
  if (result.kind === 'unavailable') {
    return (
      <p
        role="status"
        className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground"
      >
        No pudimos consultar SUNAT. Escribe los datos a mano o
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
          vuelve a intentarlo
        </Button>
      </p>
    )
  }
  if (isActiveTaxpayer(result.company)) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Datos de SUNAT. Puedes editarlos.
      </p>
    )
  }
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      SUNAT lo registra como {result.company.status} · {result.company.condition}. Puedes generar la
      proforma igual.
    </p>
  )
}
