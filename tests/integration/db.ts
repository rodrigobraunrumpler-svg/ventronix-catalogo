import { Client } from 'pg'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

// Estas pruebas borran datos: solo se permiten contra el Supabase local (spec §9).
export function testDatabaseUrl() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error('Las pruebas de integración solo se ejecutan contra el Supabase local.')
  }
  return url
}

export async function connect() {
  const client = new Client({ connectionString: testDatabaseUrl() })
  await client.connect()
  return client
}

export async function resetCatalog(client: Client) {
  await client.query('truncate public.products, public.categories')
}

// Devuelve el SQLSTATE con el que falla la consulta, o 'ok' si no falla.
export async function sqlState(query: Promise<unknown>) {
  try {
    await query
    return 'ok'
  } catch (error) {
    return (error as { code?: string }).code
  }
}
