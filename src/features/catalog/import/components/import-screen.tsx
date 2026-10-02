'use client'

import { useState } from 'react'
import { ImportFaq, ImportHeader, IntentCards, type Intent } from './import-intro'

// Carga masiva (spec del Excel §6). Esta versión trae la cabecera, la intención y las preguntas; los
// pasos, la vista previa y el resultado llegan en las tareas siguientes.
export function ImportScreen({ hasProducts }: { hasProducts: boolean }) {
  const [intent, setIntent] = useState<Intent>(hasProducts ? 'update' : 'create')
  return (
    <div className="grid max-w-[1200px] gap-8">
      <ImportHeader />
      <IntentCards value={intent} onChange={setIntent} />
      <ImportFaq />
    </div>
  )
}
