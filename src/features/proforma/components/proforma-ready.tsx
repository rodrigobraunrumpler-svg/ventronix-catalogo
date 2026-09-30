'use client'

import { Check, Download, MessageCircle, Pencil, Plus } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/lib/action-result'
import { digitsOnly, isValidMobile } from '@/lib/peru'
import {
  base64ToFile,
  downloadFile,
  openFile,
  shareOnWhatsApp,
  TAB_BLOCKED,
} from '../document/files'
import { documentDates, whatsappLink, whatsappMessage } from '../document/format'
import { documentInput, type DocumentInput, type GeneratedDocument } from '../document/input'
import { formatCents, ZERO } from '../money'
import { formatProformaNumber } from '../number'
import type { CompanyStatus } from '../readiness'
import { useProforma } from '../store'
import { totalsFromText } from '../totals'

type Outcome = { kind: 'ready'; file: File } | { kind: 'error'; message: string }
const LOADING = { kind: 'loading' } as const

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3 disabled:opacity-50'

type ProformaReadyProps = {
  company: CompanyStatus
  generatePdf: (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>
  onCorrect: () => void
  onNew: () => void
}

// «Proforma N° 0001 lista» (spec del documento §6 y prototipo). El PDF se prepara al entrar: así
// descargar, ver y compartir son inmediatos y el navegador no los bloquea.
export function ProformaReady({ company, generatePdf, onCorrect, onNew }: ProformaReadyProps) {
  const { draft } = useProforma()
  const [attempt, setAttempt] = useState(0)
  // El PDF vale solo para la proforma y el intento con que se pidió: si otra pestaña cambia la
  // proforma, se prepara de nuevo y mientras tanto no se puede bajar el anterior.
  const [result, setResult] = useState<{ payload: string; attempt: number; outcome: Outcome }>()
  const payload = JSON.stringify(documentInput(draft, { draft: false }))
  const generate = useEffectEvent((input: DocumentInput) => generatePdf(input))

  useEffect(() => {
    let active = true
    void generate(JSON.parse(payload)).then((response) => {
      if (!active) return
      setResult({
        payload,
        attempt,
        outcome: response.ok
          ? { kind: 'ready', file: base64ToFile(response.data.base64, response.data.fileName) }
          : { kind: 'error', message: response.error.message },
      })
    })
    return () => {
      active = false
    }
  }, [payload, attempt])

  const status =
    result?.payload === payload && result.attempt === attempt ? result.outcome : LOADING
  const profile = company.status === 'ready' ? company.profile : null
  const totals = totalsFromText(draft)
  const total = `S/ ${formatCents(totals?.total ?? ZERO)}`
  const numberLabel = formatProformaNumber(draft.number ?? 0)
  const validityDays = Number(draft.validityDays || profile?.default_validity_days || 7)
  const validUntil = draft.issuedAt
    ? documentDates(new Date(draft.issuedAt), validityDays).validUntil
    : ''
  const phoneOk = isValidMobile(digitsOnly(draft.client.phone))
  const message = whatsappMessage({
    clientName: draft.client.name,
    numberLabel,
    total,
    validUntil,
    sender: profile?.trade_name || profile?.legal_name || 'Ventronix',
  })
  const file = status.kind === 'ready' ? status.file : null

  function retry() {
    setAttempt((current) => current + 1)
  }

  function view(pdf: File) {
    if (!openFile(pdf)) toast(TAB_BLOCKED)
  }

  async function send(pdf: File) {
    if (await shareOnWhatsApp(pdf, message, draft.client.phone)) return
    // El navegador no dejó abrir la pestaña; un enlace sí se abre al pulsarlo.
    toast('Tu navegador bloqueó la pestaña de WhatsApp.', {
      duration: 10_000,
      action: (
        <a
          href={whatsappLink(draft.client.phone, message)}
          target="_blank"
          rel="noopener noreferrer"
          className={`ml-auto shrink-0 ${inlineAction}`}
        >
          Abrir el chat
        </a>
      ),
    })
  }

  return (
    <div data-view="ready" className="grid justify-items-center gap-2 px-8 pt-9 pb-7 text-center">
      <span className="mb-1.5 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-7" strokeWidth={2.2} aria-hidden />
      </span>
      <p role="status" className="text-xl font-extrabold text-foreground">
        Proforma {numberLabel} lista
      </p>
      <p className="mb-3.5 text-muted-foreground">
        {draft.client.name} · Total {total}
      </p>
      <div className="grid w-full gap-2.5 sm:grid-cols-2">
        <Button
          className="h-11.5 text-[15px] font-bold"
          disabled={!file}
          onClick={() => file && downloadFile(file)}
        >
          <Download aria-hidden />
          Descargar PDF
        </Button>
        <Button
          variant="outline"
          className="h-11.5 text-[15px] font-bold"
          disabled={!file || !phoneOk}
          aria-describedby={phoneOk ? undefined : 'ready-phone-hint'}
          onClick={() => file && void send(file)}
        >
          <MessageCircle aria-hidden />
          Enviar por WhatsApp
        </Button>
      </div>
      {status.kind === 'loading' ? (
        <p className="text-xs text-muted-foreground">Preparando el PDF…</p>
      ) : status.kind === 'error' ? (
        <p role="alert" className="text-xs text-destructive">
          No pudimos preparar el PDF. {status.message}{' '}
          <button type="button" className={inlineAction} onClick={retry}>
            Reintentar
          </button>
        </p>
      ) : null}
      {phoneOk ? null : (
        <p id="ready-phone-hint" className="text-xs text-muted-foreground">
          Añade el celular del cliente para enviarla por WhatsApp.
        </p>
      )}
      <button
        type="button"
        className={`mt-2 text-sm ${inlineAction}`}
        disabled={!file}
        onClick={() => file && view(file)}
      >
        Ver el documento
      </button>
      <div className="mt-1.5 flex flex-wrap justify-center gap-1">
        <Button
          variant="ghost"
          className="h-10 text-sm font-semibold"
          autoFocus
          onClick={onCorrect}
        >
          <Pencil aria-hidden />
          Corregir
        </Button>
        <Button variant="ghost" className="h-10 text-sm font-semibold" onClick={onNew}>
          <Plus aria-hidden />
          Nueva proforma
        </Button>
      </div>
    </div>
  )
}
