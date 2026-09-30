import 'server-only'
import { failure, unexpected } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import { requireOwner, UnauthorizedError, type AuthorizedContext } from './require-owner'

// Cada Action comprueba la identidad por su cuenta; no confía en la navegación protegida.
export async function withOwner<T>(
  run: (context: AuthorizedContext) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  let context: AuthorizedContext
  try {
    context = await requireOwner()
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return failure('UNAUTHORIZED', 'Tu sesión terminó. Vuelve a iniciar sesión.')
    }
    throw error
  }
  try {
    return await run(context)
  } catch (error) {
    console.error('[catálogo] acción fallida:', error)
    return unexpected()
  }
}
