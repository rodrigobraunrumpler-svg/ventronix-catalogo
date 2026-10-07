'use client'

import { Loader2, MessageCircle } from 'lucide-react'
import { useId, useState, type SubmitEvent } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMobile } from '@/features/company/format'
import type { ActionResult } from '@/lib/action-result'
import { formatDate } from '@/lib/dates'
import { digitsOnly, isValidMobile } from '@/lib/peru'
import { pairingCode } from '../format'
import type { WhatsAppStatus } from '../schemas'

export type WhatsAppCardProps = {
  // undefined mientras se consulta.
  status: WhatsAppStatus | undefined
  error?: boolean
  onLink: (input: { phone: string; code: string }) => Promise<ActionResult<WhatsAppStatus>>
  onUnlink: () => Promise<ActionResult<WhatsAppStatus>>
}

// WhatsApp de la empresa en «Empresa» (spec de WhatsApp §4): vinculado, las proformas se envían
// desde él; si no, abriendo el chat.
export function WhatsAppCard({ status, error = false, onLink, onUnlink }: WhatsAppCardProps) {
  const [linking, setLinking] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  const summary = error
    ? 'No pudimos consultar WhatsApp.'
    : !status
      ? 'Consultando…'
      : !status.configured
        ? 'Para enviar las proformas automáticamente falta configurar WHATSAPP_SESSION_KEY en el servidor.'
        : status.phone
          ? `Las proformas se envían desde el ${formatMobile(status.phone)}.`
          : 'Sin vincular: las proformas se envían abriendo el chat.'

  return (
    <section
      aria-labelledby="whatsapp-title"
      className="grid gap-3 rounded-[14px] border bg-card px-4.5 py-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-foreground">
          <MessageCircle className="size-4.5" aria-hidden />
        </span>
        <div className="grid gap-0.5">
          <h2 id="whatsapp-title" className="text-sm font-bold">
            WhatsApp
          </h2>
          <p className="text-xs leading-normal text-muted-foreground">{summary}</p>
          {status?.phone && status.linkedAt ? (
            <p className="text-xs text-muted-foreground">
              Vinculado el {formatDate(status.linkedAt)}.
            </p>
          ) : null}
        </div>
      </div>
      {status?.configured ? (
        status.phone ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setUnlinking(true)}
          >
            Desvincular
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            className="justify-self-start"
            onClick={() => setLinking(true)}
          >
            Vincular WhatsApp
          </Button>
        )
      ) : null}
      {linking ? <LinkDialog onLink={onLink} onClose={() => setLinking(false)} /> : null}
      <UnlinkDialog open={unlinking} onUnlink={onUnlink} onClose={() => setUnlinking(false)} />
    </section>
  )
}

// El código se genera aquí para mostrarlo al instante; el servidor se lo pide a WhatsApp y espera a
// que se escriba en el teléfono (hasta 2 minutos).
function LinkDialog({
  onLink,
  onClose,
}: {
  onLink: WhatsAppCardProps['onLink']
  onClose: () => void
}) {
  const id = useId()
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const waiting = code !== null && error === null

  async function start(event?: SubmitEvent<HTMLFormElement>) {
    event?.preventDefault()
    const digits = digitsOnly(phone)
    if (!isValidMobile(digits)) {
      setPhoneError('Escribe un celular de 9 dígitos que empiece con 9.')
      return
    }
    const next = pairingCode()
    setPhoneError(null)
    setError(null)
    setCode(next)
    const result = await onLink({ phone: digits, code: next })
    if (result.ok) {
      toast.success('WhatsApp vinculado.')
      onClose()
    } else {
      setError(result.error.message)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Vincular WhatsApp</DialogTitle>
          <DialogDescription>
            Las proformas se enviarán desde este número, como un dispositivo vinculado (igual que
            WhatsApp Web).
          </DialogDescription>
        </DialogHeader>
        {code === null ? (
          <form id={`${id}-form`} onSubmit={start} noValidate className="grid gap-2">
            <Label htmlFor={`${id}-phone`}>Celular de WhatsApp de la empresa</Label>
            <Input
              id={`${id}-phone`}
              value={phone}
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="987 654 321"
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={phoneError ? `${id}-phone-error` : undefined}
              onChange={(event) => setPhone(event.target.value)}
            />
            {phoneError ? (
              <p id={`${id}-phone-error`} className="text-xs text-destructive">
                {phoneError}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="grid gap-3">
            <p className="text-center font-mono text-3xl font-bold tracking-[0.12em]">
              {`${code.slice(0, 4)}-${code.slice(4)}`}
            </p>
            <ol className="grid list-decimal gap-1 pl-5 text-sm">
              <li>En el teléfono de ese número, abre WhatsApp → Dispositivos vinculados.</li>
              <li>Toca «Vincular un dispositivo» y luego «Vincular con el número de teléfono».</li>
              <li>Escribe este código (WhatsApp también puede avisarte con una notificación).</li>
            </ol>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Esperando a que escribas el código… Tienes 2 minutos.
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {waiting ? 'Cerrar' : 'Cancelar'}
          </Button>
          {code === null ? (
            <Button type="submit" form={`${id}-form`}>
              Generar código
            </Button>
          ) : error ? (
            <Button type="button" onClick={() => void start()}>
              Generar otro código
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UnlinkDialog({
  open,
  onUnlink,
  onClose,
}: {
  open: boolean
  onUnlink: WhatsAppCardProps['onUnlink']
  onClose: () => void
}) {
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    const result = await onUnlink()
    setPending(false)
    if (result.ok) {
      toast.success('WhatsApp desvinculado.')
      onClose()
    } else {
      toast.error(result.error.message)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desvincular WhatsApp</AlertDialogTitle>
          <AlertDialogDescription>
            Las proformas se volverán a enviar abriendo el chat, y el dispositivo vinculado
            desaparecerá del teléfono.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            Desvincular
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
