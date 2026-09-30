import { ensureUser } from '../support/local-supabase'
import { e2eUsers } from './users'

export default async function globalSetup() {
  await ensureUser({ ...e2eUsers.owner, appMetadata: { catalog_access: 'owner' } })
  await ensureUser(e2eUsers.intruder)
}
