import { ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Brand } from '@/components/brand'
import { signIn } from '@/features/auth/actions'
import { LoginForm } from '@/features/auth/components/login-form'
import { requireOwner, UnauthorizedError } from '@/lib/auth/require-owner'
import { LoginShowcase } from './showcase'

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
    <main className="grid min-h-dvh bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <LoginShowcase />
      <section className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <div className="-ml-2 lg:hidden">
          <Brand />
        </div>
        <div className="m-auto grid w-full max-w-[380px] gap-8 py-10">
          <div className="grid gap-2">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
              Inicia sesión
            </h1>
            <p className="text-[15px] text-muted-foreground">
              Entra con el correo y la contraseña de tu cuenta.
            </p>
          </div>
          <LoginForm action={signIn} />
          <p className="flex items-start gap-2.5 border-t pt-5 text-[13px] text-muted-foreground">
            <ShieldCheck className="mt-px size-4 shrink-0 text-secondary-foreground" aria-hidden />
            Acceso privado: solo la cuenta autorizada puede ver y cambiar el catálogo.
          </p>
        </div>
      </section>
    </main>
  )
}
