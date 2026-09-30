import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Brand } from '@/components/brand'
import { signIn } from '@/features/auth/actions'
import { LoginForm } from '@/features/auth/components/login-form'
import { requireOwner, UnauthorizedError } from '@/lib/auth/require-owner'

export const metadata: Metadata = { title: 'Iniciar sesión' }

async function hasOwnerSession() {
  try {
    await requireOwner()
    return true
  } catch (error) {
    if (error instanceof UnauthorizedError) return false
    throw error
  }
}

export default async function LoginPage() {
  if (await hasOwnerSession()) redirect('/products')

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="grid w-full max-w-[400px] gap-6">
        <Brand />
        <section className="grid gap-6 rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
          <div className="grid gap-1.5">
            <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Inicia sesión</h1>
            <p className="text-sm text-muted-foreground">Accede a tu catálogo privado.</p>
          </div>
          <LoginForm action={signIn} />
        </section>
      </div>
    </main>
  )
}
