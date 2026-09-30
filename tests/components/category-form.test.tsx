import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CategoryForm } from '@/features/catalog/categories/components/category-form'
import type { Category } from '@/features/catalog/types'
import type { ActionResult } from '@/lib/action-result'

const saved: Category = {
  id: '6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a',
  name: 'Impresoras',
  created_at: '2026-09-29T00:00:00Z',
  updated_at: '2026-09-29T00:00:00Z',
}

const nameField = () => screen.getByLabelText('Nombre de la categoría')

describe('CategoryForm', () => {
  it('rechaza un nombre vacío y deja el foco en el campo', async () => {
    const onSubmit = vi.fn()
    render(<CategoryForm onSubmit={onSubmit} onSaved={vi.fn()} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(await screen.findByText('Escribe un nombre para la categoría.')).toBeInTheDocument()
    expect(nameField()).toHaveAttribute('aria-invalid', 'true')
    expect(nameField()).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('envía el nombre sin espacios exteriores', async () => {
    const onSubmit = vi.fn(async (): Promise<ActionResult<Category>> => ({ ok: true, data: saved }))
    const onSaved = vi.fn()
    render(<CategoryForm onSubmit={onSubmit} onSaved={onSaved} />)
    const user = userEvent.setup()
    await user.type(nameField(), '  Impresoras  ')
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Impresoras' })
  })

  it('muestra junto al campo el nombre repetido que devuelve el servidor', async () => {
    const message = 'Ya existe una categoría con ese nombre.'
    const onSubmit = vi.fn(async (): Promise<ActionResult<Category>> => ({
      ok: false,
      error: { code: 'CONFLICT', message, fieldErrors: { name: [message] } },
    }))
    render(<CategoryForm onSubmit={onSubmit} onSaved={vi.fn()} />)
    const user = userEvent.setup()
    await user.type(nameField(), 'Laptops')
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(nameField()).toHaveValue('Laptops')
    expect(nameField()).toHaveFocus()
  })

  it('muestra un error inesperado sin perder el nombre', async () => {
    const onSubmit = vi.fn(async (): Promise<ActionResult<Category>> => ({
      ok: false,
      error: { code: 'UNEXPECTED', message: 'No se pudo guardar. Inténtalo de nuevo.' },
    }))
    render(<CategoryForm onSubmit={onSubmit} onSaved={vi.fn()} />)
    const user = userEvent.setup()
    await user.type(nameField(), 'Plotters')
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar.')
    expect(nameField()).toHaveValue('Plotters')
  })

  it('al renombrar parte del nombre actual y bloquea el envío mientras guarda', async () => {
    let finish: (result: ActionResult<Category>) => void = () => {}
    const onSubmit = vi.fn(
      () => new Promise<ActionResult<Category>>((resolve) => (finish = resolve)),
    )
    render(<CategoryForm defaultName="Laptops" onSubmit={onSubmit} onSaved={vi.fn()} />)
    expect(nameField()).toHaveValue('Laptops')
    const user = userEvent.setup()
    const button = screen.getByRole('button', { name: 'Guardar cambios' })
    await user.click(button)
    await vi.waitFor(() => expect(button).toBeDisabled())
    await user.click(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    finish({ ok: true, data: { ...saved, name: 'Laptops' } })
  })
})
