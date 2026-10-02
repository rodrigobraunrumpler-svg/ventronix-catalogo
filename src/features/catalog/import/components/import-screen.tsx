'use client'

import { useState } from 'react'
import { ImportFaq, ImportHeader, IntentCards, type Intent } from './import-intro'
import { ImportSteps, UploadStep, useIgnoreStrayDrops } from './import-steps'

// Carga masiva (spec del Excel §6). La vista previa y el resultado llegan en la tarea 13.
export function ImportScreen({ hasProducts }: { hasProducts: boolean }) {
  const [intent, setIntent] = useState<Intent>(hasProducts ? 'update' : 'create')
  const [file, setFile] = useState<File | null>(null)
  useIgnoreStrayDrops()
  return (
    <div className="grid max-w-[1200px] gap-8">
      <ImportHeader />
      <IntentCards value={intent} onChange={setIntent} />
      <ImportSteps
        intent={intent}
        upload={
          <UploadStep file={file} status={null} error={null} disabled={false} onFile={setFile} />
        }
      />
      <ImportFaq />
    </div>
  )
}
