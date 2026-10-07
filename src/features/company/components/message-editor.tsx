'use client'

import { useRef } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_WHATSAPP_MESSAGE,
  MESSAGE_FIELDS,
  unknownMessageFields,
  WHATSAPP_MESSAGE_LIMIT,
  whatsappMessage,
} from '@/features/proforma/document/format'

const listFormat = new Intl.ListFormat('es', { type: 'conjunction' })

// Datos de ejemplo de la vista previa (maqueta «Empresa · mensaje de WhatsApp»).
const EXAMPLE = {
  clientName: 'Inversiones Nuevo Sol S.A.C.',
  numberLabel: 'N° 0049',
  total: 'S/ 6,760.00',
  validUntil: '13/10/2026',
}

type MessageEditorProps = {
  field: UseFormRegisterReturn<'whatsapp_message'>
  value: string
  error?: string
  // Firma de {empresa}: como en el documento, el nombre comercial o la razón social.
  sender: string
  onChange: (value: string) => void
}

// Pestaña «Mensaje» (spec §4.6): el texto, los datos que se insertan, el contador y cómo lo recibe
// el cliente.
export function MessageEditor({ field, value, error, sender, onChange }: MessageEditorProps) {
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  // Lo que va entre llaves y no es un dato se enviaría tal cual (plan, decisión 19).
  const unknown = unknownMessageFields(value)

  // El dato entra donde está el cursor (o en lugar de lo seleccionado) y el cursor queda detrás.
  function insert(token: string) {
    const element = textarea.current
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    if (next.length > WHATSAPP_MESSAGE_LIMIT) return
    onChange(next)
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-3">
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold text-foreground">Mensaje al enviar por WhatsApp</h3>
          <p className="text-sm text-muted-foreground">
            Acompaña al PDF cuando lo envías y cuando lo reenvías desde el historial.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="company-message" className="text-sm font-medium text-foreground">
            Texto del mensaje
          </Label>
          <Textarea
            id="company-message"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'company-message-error' : 'company-message-help'}
            maxLength={WHATSAPP_MESSAGE_LIMIT}
            className="min-h-28 bg-card px-3 leading-normal"
            {...field}
            ref={(element) => {
              field.ref(element)
              textarea.current = element
            }}
          />
        </div>
        <div role="group" aria-label="Insertar dato" className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="text-[13px] text-muted-foreground">
            Insertar dato:
          </span>
          {MESSAGE_FIELDS.map((item) => (
            <Button
              key={item.token}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => insert(item.token)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {error ? (
          <p id="company-message-error" className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : (
          <p
            id="company-message-help"
            className="flex flex-wrap justify-between gap-2 text-[13px] text-muted-foreground"
          >
            <span>Los datos entre llaves se reemplazan solos al enviar.</span>
            <span className="tabular-nums">
              {value.length} / {WHATSAPP_MESSAGE_LIMIT}
            </span>
          </p>
        )}
        {unknown.length > 0 ? (
          <p role="status" className="text-xs font-medium text-amber-800">
            {listFormat.format(unknown)}{' '}
            {unknown.length === 1 ? 'no es un dato y se enviará' : 'no son datos y se enviarán'} tal
            cual. Usa los botones para insertar los datos.
          </p>
        ) : null}
        <button
          type="button"
          className="justify-self-start text-[13px] font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3"
          onClick={() => onChange(DEFAULT_WHATSAPP_MESSAGE)}
        >
          Volver al mensaje original
        </button>
      </div>

      <figure className="grid gap-2.5">
        <figcaption className="text-[13px] font-semibold text-muted-foreground">
          Así lo recibe el cliente
        </figcaption>
        <div className="grid justify-items-end rounded-[14px] bg-[#e9e4dc] p-4">
          <div className="grid max-w-[300px] gap-2 rounded-[10px] rounded-br-sm bg-[#d9fdd3] p-2 shadow-xs">
            <div className="flex items-center gap-2.5 rounded-lg bg-white/65 p-2.5">
              <span
                aria-hidden
                className="grid h-10 w-8.5 shrink-0 place-items-center rounded bg-[#d92d20] text-[9px] font-extrabold text-white"
              >
                PDF
              </span>
              <span className="min-w-0 truncate text-xs font-semibold">
                Proforma-0049-Inversiones-Nuevo-Sol-SAC.pdf
              </span>
            </div>
            <p className="mx-1 text-[13.5px] leading-normal whitespace-pre-line [overflow-wrap:anywhere]">
              {whatsappMessage(value, { ...EXAMPLE, sender })}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Vista previa con datos de ejemplo.</p>
      </figure>
    </div>
  )
}
