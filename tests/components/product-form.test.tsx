import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductForm } from '@/features/catalog/products/components/product-form'
import type { CategoryOption, Product, ProductListItem } from '@/features/catalog/types'
import type { ActionResult } from '@/lib/action-result'

const categories: CategoryOption[] = [
  { id: '6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a', name: 'Impresoras' },
  { id: '7a2d3b8f-4c5e-4d6f-9a0b-1c2d3e4f5a6b', name: 'Laptops' },
]

const saved: Product = {
  id: '8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c',
  code: 'LAP-004',
  name: 'Laptop de 13 pulgadas',
  description: null,
  category_id: categories[1].id,
  unit_price: '1299.50',
  created_at: '2026-09-29T00:00:00Z',
  updated_at: '2026-09-29T00:00:00Z',
}

const field = (label: string) => screen.getByLabelText(label)

function renderForm(props: Partial<Parameters<typeof ProductForm>[0]> = {}) {
  const onSubmit = vi.fn(async (): Promise<ActionResult<Product>> => ({ ok: true, data: saved }))
  const onSaved = vi.fn()
  const onCreateCategory = vi.fn()
  render(
    <ProductForm
      categories={categories}
      onSubmit={onSubmit}
      onSaved={onSaved}
      onCancel={vi.fn()}
      onCreateCategory={onCreateCategory}
      {...props}
    />,
  )
  return { onSubmit, onSaved, onCreateCategory, user: userEvent.setup() }
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field('Código'), ' lap-004 ')
  await user.type(field('Nombre del producto'), 'Laptop de 13 pulgadas')
  await user.selectOptions(field('Categoría'), 'Laptops')
  await user.type(field('Precio unitario'), '1299,5')
}

describe('ProductForm', () => {
  it('marca los campos obligatorios y enfoca el primero', async () => {
    const { onSubmit, user } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    expect(await screen.findByText('Escribe un código para identificar el producto.')).toBeVisible()
    expect(screen.getByText('Escribe el nombre del producto.')).toBeVisible()
    expect(screen.getByText('Selecciona una categoría.')).toBeVisible()
    expect(field('Precio unitario')).toHaveAttribute('aria-invalid', 'true')
    expect(field('Código')).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('envía los datos normalizados: código en mayúsculas, precio exacto y sin descripción', async () => {
    const { onSubmit, onSaved, user } = renderForm()
    await fillValid(user)
    await user.type(field('Descripción'), '   ')
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(onSubmit).toHaveBeenCalledWith({
      code: 'LAP-004',
      name: 'Laptop de 13 pulgadas',
      description: null,
      category_id: categories[1].id,
      unit_price: '1299.50',
    })
  })

  it('acepta el precio con punto decimal', async () => {
    const { onSubmit, user } = renderForm()
    await fillValid(user)
    await user.clear(field('Precio unitario'))
    await user.type(field('Precio unitario'), '1299.99')
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ unit_price: '1299.99' })),
    )
  })

  it('muestra el código repetido junto al campo y conserva el borrador', async () => {
    const message = 'Ese código ya está en uso. Elige otro.'
    const { user } = renderForm({
      onSubmit: vi.fn(async (): Promise<ActionResult<Product>> => ({
        ok: false,
        error: { code: 'CONFLICT', message, fieldErrors: { code: [message] } },
      })),
    })
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    expect(await screen.findByText(message)).toBeVisible()
    expect(field('Código')).toHaveFocus()
    expect(field('Código')).toHaveAttribute('aria-invalid', 'true')
    expect(field('Nombre del producto')).toHaveValue('Laptop de 13 pulgadas')
  })

  it('muestra un error del servidor sin perder el borrador', async () => {
    const { user } = renderForm({
      onSubmit: vi.fn(async (): Promise<ActionResult<Product>> => ({
        ok: false,
        error: { code: 'UNEXPECTED', message: 'No se pudo completar la operación.' },
      })),
    })
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la operación.')
    expect(field('Precio unitario')).toHaveValue('1299,5')
  })

  it('sin categorías ofrece crear una en lugar de inventarla', async () => {
    const { onCreateCategory, user } = renderForm({ categories: [] })
    expect(screen.getByText('Aún no hay categorías.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Crear una categoría' }))
    expect(onCreateCategory).toHaveBeenCalled()
  })

  it('al editar parte de los datos actuales', () => {
    const product: ProductListItem = {
      ...saved,
      description: 'Diseño ligero',
      category_name: 'Laptops',
    }
    renderForm({ product })
    expect(field('Código')).toHaveValue('LAP-004')
    expect(field('Descripción')).toHaveValue('Diseño ligero')
    expect(field('Categoría')).toHaveValue(categories[1].id)
    expect(field('Precio unitario')).toHaveValue('1299.50')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeVisible()
  })

  it('bloquea el guardado mientras se envía', async () => {
    let finish: (result: ActionResult<Product>) => void = () => {}
    const onSubmit = vi.fn(
      () => new Promise<ActionResult<Product>>((resolve) => (finish = resolve)),
    )
    const { user } = renderForm({ onSubmit })
    await fillValid(user)
    const button = screen.getByRole('button', { name: 'Crear producto' })
    await user.click(button)
    await vi.waitFor(() => expect(button).toBeDisabled())
    await user.click(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    finish({ ok: true, data: saved })
  })
})
