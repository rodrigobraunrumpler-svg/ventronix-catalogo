import 'server-only'
import { FILE_MESSAGES, IMPORT_MAX_BYTES, importOptionsSchema } from '../import/options'
import type { ImportOptions } from '../import/types'

export type ImportRequest =
  { ok: true; file: File; options: ImportOptions } | { ok: false; message: string }

// El archivo y las opciones del FormData, validados otra vez en el servidor (spec §6.5 y §9.2).
export function readImportRequest(formData: FormData): ImportRequest {
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, message: FILE_MESSAGES.notXlsx }
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, message: FILE_MESSAGES.tooBig }
  let options: unknown = null
  try {
    options = JSON.parse(String(formData.get('options') ?? ''))
  } catch {
    options = null
  }
  const parsed = importOptionsSchema.safeParse(options)
  if (!parsed.success) {
    return {
      ok: false,
      message:
        'Las opciones de la importación no son válidas. Recarga la página e inténtalo de nuevo.',
    }
  }
  return { ok: true, file, options: parsed.data }
}
