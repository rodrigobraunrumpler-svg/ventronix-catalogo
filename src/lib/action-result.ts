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
