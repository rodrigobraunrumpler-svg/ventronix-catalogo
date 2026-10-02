import { useState } from 'react'
import { toast } from 'sonner'
import { settle, type ActionResult } from '@/lib/action-result'
import { base64ToFile, downloadFile, XLSX_MIME } from '@/lib/files'
import type { DownloadedFile } from './types'

export const DOWNLOAD_FAILED =
  'No se pudo preparar el Excel. Revisa tu conexión e inténtalo de nuevo.'

// Descarga un Excel que prepara una Server Action. Recuerda cuál se está preparando (para su botón)
// y avisa si falla; `done` recibe el archivo para el aviso de éxito.
export function useDownload<Key extends string>() {
  const [pending, setPending] = useState<Key | null>(null)

  async function download<T extends DownloadedFile>(
    key: Key,
    action: () => Promise<ActionResult<T>>,
    done: (file: T) => void,
  ) {
    setPending(key)
    const result = await settle(action())
    setPending(null)
    if (!result.ok) {
      toast.error(result.error.code === 'UNEXPECTED' ? DOWNLOAD_FAILED : result.error.message)
      return false
    }
    downloadFile(base64ToFile(result.data.base64, result.data.fileName, XLSX_MIME))
    done(result.data)
    return true
  }

  return { pending, download }
}
