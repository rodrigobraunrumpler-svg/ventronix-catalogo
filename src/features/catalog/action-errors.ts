import { z } from 'zod'
import type { ActionErrorCode } from '@/lib/action-result'

export type ActionFailure = {
  ok: false
  error: { code: ActionErrorCode; message: string; fieldErrors?: Record<string, string[]> }
}

export function failure(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionFailure {
  return { ok: false, error: fieldErrors ? { code, message, fieldErrors } : { code, message } }
}

export function unexpected(): ActionFailure {
  return failure('UNEXPECTED', 'No se pudo completar la operación. Inténtalo de nuevo.')
}

export function invalid(error: z.ZodError): ActionFailure {
  return failure(
    'VALIDATION',
    'Revisa los datos del formulario.',
    z.flattenError(error).fieldErrors as Record<string, string[]>,
  )
}
