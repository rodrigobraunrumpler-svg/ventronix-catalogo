'use client'

import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ProformaBar } from '../../components/proforma-bar'
import { ProformaDialog } from '../../components/proforma-dialog'
import { EMPTY_DRAFT } from '../../draft'
import { formatCents } from '../../money'
import { ProformaProvider, useProforma } from '../../store'
import { totalsFromText } from '../../totals'
import { NewProformaPrompt } from './new-proforma-prompt'

// Pantalla Proformas (spec de productos libres §4.2 y §4.3): armar una proforma sin pasar por el
// catálogo. El historial llega en la tarea 10.
export function ProformasScreen() {
  return (
    <ProformaProvider>
      <ProformasContent />
    </ProformaProvider>
  )
}

function ProformasContent() {
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  // Lo elegido en la pregunta se hace cuando ya se cerró.
  const afterPrompt = useRef<(() => void) | null>(null)
  const { draft, update } = useProforma()
  const products = draft.lines.length
  const totals = totalsFromText(draft)

  function openEmpty() {
    update(() => EMPTY_DRAFT)
    setOpen(true)
  }

  // «Nueva proforma» empieza una vacía. Una ya generada está guardada y se reemplaza; una sin
  // generar no se borra sin preguntar (plan, decisión 4).
  function startNew() {
    if (draft.number === null && products > 0) setAsking(true)
    else openEmpty()
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Proformas</h1>
          <p className="text-sm text-muted-foreground">
            Arma una proforma con productos del catálogo o escritos a mano.
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus aria-hidden />
          Nueva proforma
        </Button>
      </div>
      <ProformaBar onComplete={() => setOpen(true)} />
      <ProformaDialog open={open} onClose={() => setOpen(false)} />
      <NewProformaPrompt
        open={asking}
        summary={`${products} ${products === 1 ? 'producto' : 'productos'} · S/ ${totals ? formatCents(totals.total) : '—'}`}
        onKeep={() => {
          afterPrompt.current = () => setOpen(true)
        }}
        onStartNew={() => {
          afterPrompt.current = openEmpty
          setAsking(false)
        }}
        onClose={() => setAsking(false)}
        onClosed={() => {
          afterPrompt.current?.()
          afterPrompt.current = null
        }}
      />
    </div>
  )
}
