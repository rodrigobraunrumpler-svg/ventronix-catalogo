import { execFileSync } from 'node:child_process'
import { beforeEach, expect, it } from 'vitest'
import { adminClient, localSupabase, signedInClient } from '../support/local-supabase'

const email = 'script-owner@catalogo.test'

async function findUser() {
  const { data, error } = await adminClient().auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((user) => user.email === email)
}

function runScript(password = 'script-owner-clave-123') {
  const { url, secretKey } = localSupabase()
  execFileSync('node', ['scripts/create-owner.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_URL: url,
      SUPABASE_SECRET_KEY: secretKey,
      OWNER_EMAIL: email,
      OWNER_PASSWORD: password,
    },
  })
}

beforeEach(async () => {
  const existing = await findUser()
  if (existing) await adminClient().auth.admin.deleteUser(existing.id)
})

it('crea la cuenta con la marca de acceso', async () => {
  runScript()
  expect((await findUser())?.app_metadata.catalog_access).toBe('owner')
})

it('vuelve a asignar la marca a una cuenta existente', async () => {
  runScript()
  const user = await findUser()
  await adminClient().auth.admin.updateUserById(user!.id, {
    app_metadata: { catalog_access: 'ninguno' },
  })
  runScript()
  expect((await findUser())?.app_metadata.catalog_access).toBe('owner')
})

it('con OWNER_PASSWORD fija una contraseña nueva a una cuenta existente', async () => {
  runScript()
  runScript('script-owner-nueva-456')
  await expect(signedInClient(email, 'script-owner-nueva-456')).resolves.toBeDefined()
})
