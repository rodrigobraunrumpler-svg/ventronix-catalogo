'use client'

import { useState } from 'react'
import type { ActionResult } from '@/lib/action-result'
import { EMPTY_DRAFT, setNumber } from '../draft'
import { useProforma } from '../store'
import { ProformaEditor, type ProformaEditorProps } from './proforma-editor'
import { ProformaReady, type ProformaReadyProps } from './proforma-ready'

export type ProformaPanelProps = Omit<
  ProformaEditorProps,
  'onGenerate' | 'generating' | 'error'
> & {
  reserveNumber: () => Promise<ActionResult<number>>
  onFinish: () => void
  sendByWhatsApp?: ProformaReadyProps['sendByWhatsApp']
}

// El número se pide una sola vez: «Corregir» lo conserva y «Nueva proforma» lo libera (spec §4.4).
export function ProformaPanel({
  reserveNumber,
  onFinish,
  sendByWhatsApp,
  ...editor
}: ProformaPanelProps) {
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
    return (
      <ProformaReady
        company={editor.company}
        generatePdf={editor.generatePdf}
        sendByWhatsApp={sendByWhatsApp}
        onCorrect={() => setView('edit')}
        onNew={startNew}
      />
    )
  }

  return <ProformaEditor {...editor} onGenerate={generate} generating={generating} error={error} />
}
