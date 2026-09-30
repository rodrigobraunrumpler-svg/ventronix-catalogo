'use server'

import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { isOwner } from '@/lib/auth/require-owner'
import { createClient } from '@/lib/supabase/server'
import { signInSchema } from './schemas'

// Mismo mensaje para contraseña incorrecta y cuenta sin autorización: no revela cuál falló.
const accessDenied = 'No se pudo iniciar sesión. Revisa tu correo y contraseña.'

export async function signIn(input: unknown): Promise<ActionResult<null>> {
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Revisa los datos del formulario.',
        fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
      },
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error || !isOwner(data.user)) {
    if (!error) await supabase.auth.signOut({ scope: 'local' })
    return { ok: false, error: { code: 'UNAUTHORIZED', message: accessDenied } }
  }
  return { ok: true, data: null }
}

// Cierra solo esta sesión: los demás dispositivos de la cuenta siguen abiertos.
export async function signOut(): Promise<ActionResult<null>> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  return { ok: true, data: null }
}
