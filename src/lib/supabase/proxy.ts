import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'

const PUBLIC_PATHS = ['/login']

// Renueva las cookies de sesión en cada petición y manda al acceso a quien no tiene sesión.
// La autorización (marca de administración) la comprueban el layout privado y cada Action.
export async function updateSession(request: NextRequest) {
  const env = publicEnv()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // No quitar: getClaims() renueva el token; sin ello la sesión puede cerrarse al azar.
  const { data } = await supabase.auth.getClaims()
  // Ruta exacta: /login/otra o /loginx también exigen sesión.
  const isPublic = PUBLIC_PATHS.includes(request.nextUrl.pathname)

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
