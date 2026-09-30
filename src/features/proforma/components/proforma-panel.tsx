'use client'

import { CircleCheck } from 'lucide-react'
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
      update((current) => setNumber(current, result.data))
    }
    setView('ready')
  }

  function startNew() {
    update(() => EMPTY_DRAFT)
    onFinish()
  }

  if (view === 'ready' && draft.number !== null) {
    const totals = totalsFromText(draft)
    return (
      <div className="grid justify-items-center gap-3 px-6 py-12 text-center">
        <span className="grid size-13 place-items-center rounded-full bg-primary/15 text-ring">
          <CircleCheck className="size-6" aria-hidden />
        </span>
        <p role="status" className="text-xl font-extrabold">
          Proforma {formatProformaNumber(draft.number)} lista
        </p>
        <p className="text-sm text-muted-foreground">
          {draft.client.name} · Total S/ {totals ? formatCents(totals.total) : '—'}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="outline" autoFocus onClick={() => setView('edit')}>
            Corregir
          </Button>
          <Button onClick={startNew}>Nueva proforma</Button>
        </div>
      </div>
    )
  }

  return <ProformaEditor {...editor} onGenerate={generate} generating={generating} error={error} />
}
