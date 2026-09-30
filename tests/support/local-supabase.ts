import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

type LocalSupabase = { url: string; publishableKey: string; secretKey: string }

let cached: LocalSupabase | undefined

// Claves del Supabase local leídas de `supabase status`: no se versionan y nunca apuntan a otro entorno.
export function localSupabase(): LocalSupabase {
  if (cached) return cached
  const status = JSON.parse(
    execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  )
  if (!['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname)) {
    throw new Error('Las pruebas solo se ejecutan contra el Supabase local.')
  }
  cached = {
    url: status.API_URL,
    publishableKey: status.PUBLISHABLE_KEY,
    secretKey: status.SECRET_KEY,
  }
  return cached
}

const noPersistence = { auth: { persistSession: false, autoRefreshToken: false } }

export function adminClient() {
  const { url, secretKey } = localSupabase()
  return createClient(url, secretKey, noPersistence)
}

export function publicClient() {
  const { url, publishableKey } = localSupabase()
  return createClient(url, publishableKey, noPersistence)
}

type TestUser = {
  email: string
  password: string
  appMetadata?: Record<string, string>
  userMetadata?: Record<string, string>
}

// Crea (o recrea) un usuario de prueba con la marca indicada.
export async function ensureUser({ email, password, appMetadata, userMetadata }: TestUser) {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  const existing = data.users.find((user) => user.email === email)
  if (existing) await admin.auth.admin.deleteUser(existing.id)
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  })
  if (created.error) throw created.error
  return created.data.user
}

export async function signedInClient(email: string, password: string) {
  const client = publicClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}
