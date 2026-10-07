'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCheck, Download, Info, MessageCircle, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDay } from '@/features/catalog/list-options'
import { formatPrice } from '@/features/catalog/money'
import { formatMobile } from '@/features/company/format'
import type { ActionResult } from '@/lib/action-result'
import { formatDate } from '@/lib/dates'
import { digitsOnly, isValidMobile } from '@/lib/peru'
import { cn } from '@/lib/utils'
import { useReturnFocus } from '@/lib/use-return-focus'
import { toastChatBlocked } from '../../components/chat-blocked'
import { base64ToFile, downloadFile, shareOnWhatsApp } from '../../document/files'
import { formatProformaNumber } from '../../number'
import { DOCUMENT_STALE_MS, historyKeys } from '../hooks'
import type { ProformaRow } from '../queries'
import type { StoredDocument } from '../snapshot'

type Delivery =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; phone: string }
  | { kind: 'failed'; message: string; fallback: boolean }

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3'

export type ResendDialogProps = {
  row: ProformaRow | null
  // Hoy en Lima (AAAA-MM-DD), para advertir si ya venció.
  today: string
  onClose: () => void
  // El PDF y el mensaje de la copia; lanza el error del servidor (fetchStoredDocument).
  loadDocument: (id: string) => Promise<StoredDocument>
  // Con el WhatsApp de la empresa vinculado se envía solo; si no, se abre el chat (spec §4.4).
  resend?: (input: { id: string; phone: string }) => Promise<ActionResult<{ phone: string }>>
}

// «Reenviar proforma N° 0042» (spec de productos libres §4.4).
export function ResendDialog({ row, onClose, ...props }: ResendDialogProps) {
  // La última proforma se conserva para que la ventana no se vacíe mientras se cierra.
  const [shown, setShown] = useState(row)
  if (row !== null && row !== shown) setShown(row)
  const data = row ?? shown
  const returnFocus = useReturnFocus(row !== null)

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        {...returnFocus}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        {data ? <ResendContent key={data.id} row={data} onClose={onClose} {...props} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ResendContent({
  row,
  today,
  onClose,
  loadDocument,
  resend,
}: Omit<ResendDialogProps, 'row'> & { row: ProformaRow }) {
  // El celular de la proforma, editable solo para este envío.
  const [phone, setPhone] = useState(() => {
    const digits = digitsOnly(row.client_phone)
    return digits.length === 9 ? formatMobile(digits) : row.client_phone
  })
  const [delivery, setDelivery] = useState<Delivery>({ kind: 'idle' })
  // El PDF y el mensaje se preparan al abrir: descargar y abrir el chat son inmediatos y el
  // navegador no bloquea la pestaña. Es la misma consulta de «Ver PDF» (plan, decisión 22).
  const pdf = useQuery({
    queryKey: historyKeys.document(row.id),
    queryFn: () => loadDocument(row.id),
    staleTime: DOCUMENT_STALE_MS,
    retry: false,
  })
  const ready = useMemo(
    () =>
      pdf.data && {
        message: pdf.data.message,
        file: base64ToFile(pdf.data.base64, pdf.data.fileName),
      },
    [pdf.data],
  )
  const phoneOk = isValidMobile(digitsOnly(phone))

  async function openChat() {
    if (!ready) return
    if (!(await shareOnWhatsApp(ready.file, ready.message, phone))) {
      toastChatBlocked(phone, ready.message)
    }
  }

  async function send() {
    if (!resend) return openChat()
    setDelivery({ kind: 'sending' })
    const result = await resend({ id: row.id, phone })
    setDelivery(
      result.ok
        ? { kind: 'sent', phone: result.data.phone }
        : {
            kind: 'failed',
            message: result.error.message,
            // Si el cliente no tiene WhatsApp, abrir el chat tampoco sirve.
            fallback: result.error.code !== 'VALIDATION',
          },
    )
  }

  return (
    <>
      <DialogHeader className="gap-1 border-b px-6 pt-5 pr-14 pb-4">
        <DialogTitle className="text-lg font-bold">
          Reenviar proforma <span className="font-mono">{formatProformaNumber(row.number)}</span>
        </DialogTitle>
        <DialogDescription>
          {row.client_name} · S/ {formatPrice(row.total)} · generada el {formatDate(row.issued_at)}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 overflow-y-auto px-6 py-5">
        <div className="grid max-w-[260px] gap-1.5">
          <Label htmlFor="resend-phone" className="text-sm font-medium text-foreground">
            Celular del cliente
          </Label>
          <Input
            id="resend-phone"
            type="tel"
            inputMode="tel"
            maxLength={11}
            autoComplete="off"
            className="tabular-nums"
            value={phone}
            aria-invalid={phoneOk ? undefined : true}
            aria-describedby="resend-phone-hint"
            onChange={(event) => setPhone(event.target.value)}
          />
          <p
            id="resend-phone-hint"
            className={cn(
              'text-xs',
              phoneOk ? 'text-muted-foreground' : 'font-medium text-destructive',
            )}
          >
            {phoneOk
              ? 'Solo para este envío: la proforma no cambia.'
              : 'Escribe un celular de 9 dígitos que empiece por 9.'}
          </p>
        </div>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-foreground">Mensaje</span>
          {pdf.isError ? (
            <p role="alert" className="text-xs text-destructive">
              No pudimos preparar el PDF. {pdf.error.message}{' '}
              <button type="button" className={inlineAction} onClick={() => void pdf.refetch()}>
                Reintentar
              </button>
            </p>
          ) : (
            <p className="rounded-[10px] bg-muted px-3 py-3 text-sm leading-normal whitespace-pre-line [overflow-wrap:anywhere]">
              {ready ? ready.message : 'Preparando el PDF…'}
            </p>
          )}
        </div>

        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-ring" aria-hidden />
          Se envía el mismo documento que se generó: mismos productos, precios, fotos y datos de la
          empresa de ese día.
        </p>

        {row.valid_until < today ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Venció el {formatDay(row.valid_until)}. Si los precios cambiaron, genera una proforma
            nueva antes de enviarla.
          </p>
        ) : null}

        {delivery.kind === 'sending' ? (
          <p role="status" className="text-xs text-muted-foreground">
            Enviando por WhatsApp…
          </p>
        ) : delivery.kind === 'sent' ? (
          <p role="status" className="inline-flex items-center gap-1.5 text-xs text-ring">
            <CheckCheck className="size-4" aria-hidden />
            Enviada por WhatsApp al {delivery.phone}.
          </p>
        ) : delivery.kind === 'failed' ? (
          <p role="alert" className="text-xs text-destructive">
            {delivery.message}{' '}
            {delivery.fallback && ready ? (
              <button type="button" className={inlineAction} onClick={() => void openChat()}>
                Abrir el chat
              </button>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t bg-background/60 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="outline"
          disabled={!ready}
          onClick={() => ready && downloadFile(ready.file)}
        >
          <Download aria-hidden />
          Descargar PDF
        </Button>
        <Button
          disabled={!ready || !phoneOk || delivery.kind === 'sending'}
          onClick={() => void send()}
        >
          <MessageCircle aria-hidden />
          {delivery.kind === 'sending' ? 'Enviando…' : 'Enviar por WhatsApp'}
        </Button>
      </div>
    </>
  )
}
