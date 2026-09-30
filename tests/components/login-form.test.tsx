import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from '@/features/auth/components/login-form'
import type { ActionResult } from '@/lib/action-result'

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const genericError = 'No se pudo iniciar sesión. Revisa tu correo y contraseña.'

beforeEach(() => {
  router.replace.mockReset()
  router.refresh.mockReset()
})

async function fill(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Correo'), email)
  await user.type(screen.getByLabelText('Contraseña'), password)
  return user
}

describe('LoginForm', () => {
  it('marca los campos vacíos y no envía', async () => {
    const action = vi.fn()
    render(<LoginForm action={action} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(await screen.findByText('Escribe un correo válido.')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo')).toHaveAttribute('aria-invalid', 'true')
    expect(action).not.toHaveBeenCalled()
  })

  it('muestra y oculta la contraseña sin enviar el formulario', async () => {
    const action = vi.fn()
    render(<LoginForm action={action} />)
    const user = userEvent.setup()
    const password = screen.getByLabelText('Contraseña')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(password).toHaveAttribute('type', 'password')
    expect(action).not.toHaveBeenCalled()
  })

  it('avisa si no se puede contactar con el servidor', async () => {
    const action = vi.fn(async (): Promise<ActionResult<null>> => {
      throw new TypeError('Failed to fetch')
    })
    render(<LoginForm action={action} />)
    const user = await fill('dueno@catalogo.test', 'clave-123')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu conexión')
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled()
  })

  it('muestra un error genérico del servidor y conserva el correo', async () => {
    const action = vi.fn(async (): Promise<ActionResult<null>> => ({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: genericError },
    }))
    render(<LoginForm action={action} />)
    const user = await fill('dueno@empresa.pe', 'clave-incorrecta')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(genericError)
    expect(screen.getByLabelText('Correo')).toHaveValue('dueno@empresa.pe')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('no permite un segundo envío mientras el primero está en curso', async () => {
    let finish: (result: ActionResult<null>) => void = () => {}
    const action = vi.fn(() => new Promise<ActionResult<null>>((resolve) => (finish = resolve)))
    render(<LoginForm action={action} />)
    const user = await fill('dueno@empresa.pe', 'clave-correcta')
    const button = screen.getByRole('button', { name: 'Iniciar sesión' })
    await user.click(button)
    await vi.waitFor(() => expect(button).toBeDisabled())
    await user.click(button)
    expect(action).toHaveBeenCalledTimes(1)
    finish({ ok: true, data: null })
  })

  it('entra al catálogo al iniciar sesión', async () => {
    const action = vi.fn(async (): Promise<ActionResult<null>> => ({ ok: true, data: null }))
    render(<LoginForm action={action} />)
    const user = await fill('dueno@empresa.pe', 'clave-correcta')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/products'))
    expect(action).toHaveBeenCalledWith({ email: 'dueno@empresa.pe', password: 'clave-correcta' })
  })
})
