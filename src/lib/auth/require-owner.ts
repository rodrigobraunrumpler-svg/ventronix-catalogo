import 'server-only'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

export type AuthorizedContext = {
  user: User
  supabase: SupabaseClient<Database>
}

export class UnauthorizedError extends Error {
  constructor() {
    super('No autorizado')
    this.name = 'UnauthorizedError'
  }
}

// Solo la cuenta marcada por administración (app_metadata, no user_metadata).
export function isOwner(user: User | null | undefined): user is User {
  return user?.app_metadata?.catalog_access === 'owner'
}

// getUser() confirma la sesión con el servidor de Auth; getSession() no basta para autorizar.
export async function requireOwner(): Promise<AuthorizedContext> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !isOwner(data.user)) throw new UnauthorizedError()
  return { user: data.user, supabase }
}
