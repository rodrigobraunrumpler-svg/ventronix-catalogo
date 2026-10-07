import 'server-only'
import { headers } from 'next/headers'

// Dirección de la app para «Abrir esta vista en la app», tomada de la petición (spec del Excel §5.2).
export async function appUrl(pathAndQuery: string) {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host')
  if (!host) return null
  const protocol =
    list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}${pathAndQuery}`
}
