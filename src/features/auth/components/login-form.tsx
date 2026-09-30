'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { settle, type ActionResult } from '@/lib/action-result'
import { signInSchema } from '../schemas'

type LoginFormProps = { action: (input: unknown) => Promise<ActionResult<null>> }

const fieldIcon =
  'pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground'

export function LoginForm({ action }: LoginFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await settle(action(values))
    if (!result.ok) {
      setServerError(result.error.message)
      return
    }
    setRedirecting(true)
    router.replace('/products')
    router.refresh()
  })

  const busy = isSubmitting || redirecting

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      {serverError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="email">Correo</Label>
        <div className="relative">
          <Mail className={fieldIcon} aria-hidden />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="nombre@empresa.com"
            className="h-11 pl-10"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'email-error' : undefined}
            {...register('email')}
          />
        </div>
        {errors.email ? (
          <p id="email-error" className="text-xs font-medium text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <LockKeyhole className={fieldIcon} aria-hidden />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="h-11 pr-12 pl-10"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'password-error' : undefined}
            {...register('password')}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword((shown) => !shown)}
          >
            {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
        </div>
        {errors.password ? (
          <p id="password-error" className="text-xs font-medium text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={busy} className="mt-1 w-full">
        {busy ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </Button>
    </form>
  )
}
