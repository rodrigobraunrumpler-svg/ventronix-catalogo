import { LogIn, Package, SearchX } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { hasOwnerSession } from '@/lib/auth/require-owner'

export const metadata: Metadata = { title: 'Página no encontrada' }

// 404 de toda la app. Sin sesión, el proxy ya lleva al acceso; aquí se llega sobre todo con sesión,
// y el botón manda a donde cada visitante puede continuar.
export default async function NotFound() {
  const owner = await hasOwnerSession()

  return (
    <main className="flex min-h-dvh flex-col bg-background px-5 py-8 sm:px-10">
      <div className="-ml-2">
        <Brand />
      </div>
      <div className="m-auto grid max-w-[440px] justify-items-center gap-3 py-12 text-center">
        <span className="mb-3 grid size-16 place-items-center rounded-2xl border bg-card text-secondary-foreground shadow-xs">
          <SearchX className="size-7" aria-hidden />
        </span>
        <span className="rounded-md border bg-card px-2 py-0.5 font-mono text-xs font-medium text-secondary-foreground">
          Error 404
        </span>
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-balance">
          No encontramos esta página
        </h1>
        <p className="max-w-[380px] text-[15px] text-muted-foreground">
          {owner
            ? 'La dirección no existe o ya no está disponible. Revisa el enlace o vuelve a tus productos.'
            : 'La dirección no existe o ya no está disponible. Inicia sesión para volver a tu catálogo.'}
        </p>
        <Button asChild size="lg" className="mt-4">
          {owner ? (
            <Link href="/products">
              <Package aria-hidden />
              Ir a Productos
            </Link>
          ) : (
            <Link href="/login">
              <LogIn aria-hidden />
              Ir al inicio de sesión
            </Link>
          )}
        </Button>
      </div>
    </main>
  )
}
