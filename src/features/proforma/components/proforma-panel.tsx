'use client'

import { Check, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/lib/action-result'
import { EMPTY_DRAFT, setNumber } from '../draft'
import { formatCents } from '../money'
import { formatProformaNumber } from '../number'
import { useProforma } from '../store'
import { totalsFromText } from '../totals'
import { ProformaEditor, type ProformaEditorProps } from './proforma-editor'

export type ProformaPanelProps = Omit<
  ProformaEditorProps,
  'onGenerate' | 'generating' | 'error'
> & {
  reserveNumber: () => Promise<ActionResult<number>>
  onFinish: () => void
}

// El número se pide una sola vez: «Corregir» lo conserva y «Nueva proforma» lo libera (spec §4.4).
// Descargar el PDF y enviarlo por WhatsApp llegan con las tareas 10 y 11 del plan del catálogo.
export function ProformaPanel({ reserveNumber, onFinish, ...editor }: ProformaPanelProps) {
  const { draft, update } = useProforma()
  const [view, setView] = useState<'edit' | 'ready'>('edit')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setError(null)
    if (draft.number === null) {
      setGenerating(true)
      const result = await reserveNumber()
      setGenerating(false)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      update((current) => setNumber(current, result.data, new Date().toISOString()))
    } else if (draft.issuedAt === null) {
      // Proformas numeradas antes de guardar la fecha: se fija ahora.
      const number = draft.number
      update((current) => setNumber(current, number, new Date().toISOString()))
    }
    setView('ready')
  }

  function startNew() {
    update(() => EMPTY_DRAFT)
    onFinish()
  }

  if (view === 'ready' && draft.number !== null) {
    const totals = totalsFromText(draft)
    // data-view: la ventana se estrecha y oculta su cabecera mientras se muestra esta vista.
    return (
      <div data-view="ready" className="grid justify-items-center gap-2 px-8 pt-9 pb-7 text-center">
        <span className="mb-1.5 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-7" strokeWidth={2.2} aria-hidden />
        </span>
        <p role="status" className="text-xl font-extrabold text-foreground">
          Proforma {formatProformaNumber(draft.number)} lista
        </p>
        <p className="mb-3.5 text-muted-foreground">
          {draft.client.name} · Total S/ {totals ? formatCents(totals.total) : '—'}
        </p>
        <div className="grid w-full gap-2.5 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-11.5 text-[15px] font-bold"
            autoFocus
            onClick={() => setView('edit')}
          >
            <Pencil aria-hidden />
            Corregir
          </Button>
          <Button variant="ghost" className="h-11.5 text-sm font-semibold" onClick={startNew}>
            <Plus aria-hidden />
            Nueva proforma
          </Button>
        </div>
      </div>
    )
  }

  return <ProformaEditor {...editor} onGenerate={generate} generating={generating} error={error} />
}
