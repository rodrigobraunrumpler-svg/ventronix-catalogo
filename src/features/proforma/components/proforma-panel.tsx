'use client'

import { useEffect, useRef, useState } from 'react'
import type { ActionResult } from '@/lib/action-result'
import { EMPTY_DRAFT, isEmptyDraft, setNumber, type ProformaDraft } from '../draft'
import { useProforma } from '../store'
import { ProformaEditor, type ProformaEditorProps } from './proforma-editor'
import { ProformaReady, type ProformaReadyProps } from './proforma-ready'

export type ProformaPanelProps = Omit<
  ProformaEditorProps,
  'onGenerate' | 'generating' | 'error'
> & {
  reserveNumber: () => Promise<ActionResult<number>>
  onFinish: () => void
  // La proforma guardada que muestra «lista», o null: al cerrar la ventana se ofrece corregirla.
  onSavedChange?: (saved: ProformaDraft | null) => void
  sendByWhatsApp?: ProformaReadyProps['sendByWhatsApp']
  historyLink?: ProformaReadyProps['historyLink']
}

// El número se pide una sola vez: «Corregir» lo conserva y «Nueva proforma» lo libera (spec §4.4).
// Guardada en el historial, la proforma se vacía para la siguiente; «lista» sigue con su copia.
export function ProformaPanel({
  reserveNumber,
  onFinish,
  onSavedChange,
  sendByWhatsApp,
  historyLink,
  ...editor
}: ProformaPanelProps) {
  const { draft, update } = useProforma()
  // Lo que se generó, tal cual: si el borrador cambia o se vacía, no se guarda otra cosa.
  const [generated, setGenerated] = useState<{
    proforma: ProformaDraft
    corrected: boolean
  } | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Si la ventana se cerró mientras se guardaba, ya no hay «lista» que avisar.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function generate() {
    setError(null)
    // Con número es una corrección: se guarda con el mismo.
    const corrected = draft.number !== null
    let proforma = draft
    if (draft.number === null) {
      setGenerating(true)
      const result = await reserveNumber()
      setGenerating(false)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      proforma = update((current) => setNumber(current, result.data, new Date().toISOString()))
    } else if (draft.issuedAt === null) {
      // Proformas numeradas antes de guardar la fecha: se fija ahora.
      const number = draft.number
      proforma = update((current) => setNumber(current, number, new Date().toISOString()))
    }
    setGenerated({ proforma, corrected })
  }

  // Ya está en el historial: la siguiente empieza de cero, salvo que la proforma haya cambiado
  // mientras se guardaba (otra pestaña, o se siguió editando tras cerrar).
  function saved(proforma: ProformaDraft) {
    const copy = JSON.stringify(proforma)
    update((current) => (JSON.stringify(current) === copy ? EMPTY_DRAFT : current))
    if (mounted.current) onSavedChange?.(proforma)
  }

  // Si ya se vació al guardarse, vuelve la guardada con su número.
  function correct(proforma: ProformaDraft) {
    update((current) => (isEmptyDraft(current) ? proforma : current))
    setGenerated(null)
    onSavedChange?.(null)
  }

  function startNew() {
    update(() => EMPTY_DRAFT)
    onSavedChange?.(null)
    onFinish()
  }

  if (generated) {
    return (
      <ProformaReady
        proforma={generated.proforma}
        corrected={generated.corrected}
        company={editor.company}
        generatePdf={editor.generatePdf}
        sendByWhatsApp={sendByWhatsApp}
        historyLink={historyLink}
        onSaved={() => saved(generated.proforma)}
        onCorrect={() => correct(generated.proforma)}
        onNew={startNew}
      />
    )
  }

  return <ProformaEditor {...editor} onGenerate={generate} generating={generating} error={error} />
}
