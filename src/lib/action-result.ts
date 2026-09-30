export type ActionErrorCode =
  'VALIDATION' | 'UNAUTHORIZED' | 'CONFLICT' | 'CATEGORY_IN_USE' | 'NOT_FOUND' | 'UNEXPECTED'

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        code: ActionErrorCode
        message: string
        fieldErrors?: Record<string, string[]>
      }
    }

// Una Server Action rechaza si se corta la red o falla el servidor; así el error siempre se muestra.
export async function settle<T>(action: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await action
  } catch {
    return {
      ok: false,
      error: {
        code: 'UNEXPECTED',
        message: 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.',
      },
    }
  }
}
