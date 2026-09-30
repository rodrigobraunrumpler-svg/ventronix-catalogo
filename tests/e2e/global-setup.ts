import { readFileSync } from 'node:fs'
import { ensureUser } from '../support/local-supabase'
import { e2eUsers } from './users'

// Las e2e arrancan su propio `pnpm dev`, que lee .env.development.local. Si ese archivo faltara o
// apuntara a otro sitio, `pnpm dev` usaría el Supabase de .env.local (el real): se detienen antes.
function assertLocalAppEnv() {
  let url: string | undefined
  try {
    url = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(
      readFileSync('.env.development.local', 'utf8'),
    )?.[1]
  } catch {
    url = undefined
  }
  const host = url ? new URL(url.trim().replace(/^["']|["']$/g, '')).hostname : null
  if (!host || !['127.0.0.1', 'localhost'].includes(host)) {
    throw new Error(
      'Las e2e necesitan .env.development.local apuntando al Supabase local (ver docs/setup.md).',
    )
  }
}

export default async function globalSetup() {
  assertLocalAppEnv()
  await ensureUser({ ...e2eUsers.owner, appMetadata: { catalog_access: 'owner' } })
  await ensureUser(e2eUsers.intruder)
}
