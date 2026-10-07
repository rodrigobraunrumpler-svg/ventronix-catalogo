import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProductForm } from '@/features/catalog/products/components/product-form'
import type { CategoryOption, Product, ProductListItem } from '@/features/catalog/types'
import type { ActionResult } from '@/lib/action-result'
import { discardPhotos } from '@/lib/use-photos'

vi.mock('@/lib/use-photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/use-photos')>()),
  discardPhotos: vi.fn(),
}))

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
  image_path: null,
}

const field = (label: string) => screen.getByLabelText(label)

function renderForm(props: Partial<Parameters<typeof ProductForm>[0]> = {}) {
  const onSubmit = vi.fn(async (): Promise<ActionResult<Product>> => ({ ok: true, data: saved }))
  const onSaved = vi.fn()
  const onCreateCategory = vi.fn()
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ProductForm
        categories={categories}
        onSubmit={onSubmit}
        onSaved={onSaved}
        onCancel={vi.fn()}
        onCreateCategory={onCreateCategory}
        uploadPhoto={vi.fn(async () => '')}
        {...props}
      />
    </QueryClientProvider>,
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
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, { another: false }))
    expect(onSubmit).toHaveBeenCalledWith({
      code: 'LAP-004',
      name: 'Laptop de 13 pulgadas',
      description: null,
      category_id: categories[1].id,
      unit_price: '1299.50',
      image_path: null,
    })
  })

  it('sube la foto elegida y la envía con el producto', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:foto')
    URL.revokeObjectURL = vi.fn()
    const path = 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'
    const uploadPhoto = vi.fn(async () => path)
    const { onSubmit, user } = renderForm({ uploadPhoto })
    await fillValid(user)
    await user.upload(
      screen.getByLabelText('Foto'),
      new File(['foto'], 'laptop.png', { type: 'image/png' }),
    )
    await vi.waitFor(() => expect(uploadPhoto).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ image_path: path })),
    )
  })

  it('mientras sube la foto no deja guardar, para no perderla', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:foto')
    URL.revokeObjectURL = vi.fn()
    let finish: (path: string) => void = () => {}
    const uploadPhoto = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    const { user } = renderForm({ uploadPhoto })
    await fillValid(user)
    await user.upload(
      screen.getByLabelText('Foto'),
      new File(['foto'], 'laptop.png', { type: 'image/png' }),
    )
    const create = screen.getByRole('button', { name: 'Crear producto' })
    expect(create).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Crear y añadir otro' })).toBeDisabled()
    await act(async () => finish('products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'))
    expect(create).toBeEnabled()
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

  it('si se cierra sin guardar, al volver a abrir recupera lo escrito', async () => {
    const { user } = renderForm()
    await fillValid(user)
    cleanup()
    renderForm()
    expect(screen.getByRole('status')).toHaveTextContent('Recuperamos lo que estabas escribiendo.')
    expect(field('Código')).toHaveValue(' lap-004 ')
    expect(field('Nombre del producto')).toHaveValue('Laptop de 13 pulgadas')
    expect(field('Categoría')).toHaveValue(categories[1].id)
    expect(field('Precio unitario')).toHaveValue('1299,5')
  })

  it('Descartar deja el formulario vacío y borra el borrador', async () => {
    const first = renderForm()
    await fillValid(first.user)
    cleanup()
    const { user } = renderForm()
    await user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(field('Nombre del producto')).toHaveValue('')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    cleanup()
    renderForm()
    expect(field('Nombre del producto')).toHaveValue('')
  })

  it('al guardar se borra el borrador', async () => {
    const { onSaved, user } = renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    cleanup()
    renderForm()
    expect(field('Código')).toHaveValue('')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('Crear y añadir otro guarda, deja la categoría y vuelve a Código', async () => {
    const { onSubmit, onSaved, user } = renderForm()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Crear y añadir otro' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, { another: true }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(field('Código')).toHaveValue('')
    expect(field('Nombre del producto')).toHaveValue('')
    expect(field('Precio unitario')).toHaveValue('')
    expect(field('Categoría')).toHaveValue(categories[1].id)
    expect(field('Código')).toHaveFocus()
  })

  it('al editar recupera los cambios sin guardar de esa misma versión del producto', async () => {
    const product: ProductListItem = { ...saved, category_name: 'Laptops' }
    const { user } = renderForm({ product })
    await user.clear(field('Nombre del producto'))
    await user.type(field('Nombre del producto'), 'Laptop renovada')
    cleanup()
    renderForm({ product })
    expect(field('Nombre del producto')).toHaveValue('Laptop renovada')
    cleanup()
    renderForm({ product: { ...product, updated_at: '2026-09-30T10:00:00Z' } })
    expect(field('Nombre del producto')).toHaveValue('Laptop de 13 pulgadas')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
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

describe('fotos que no se guardan', () => {
  const first = 'products/11111111-1111-4111-8111-111111111111.jpg'
  const second = 'products/22222222-2222-4222-8222-222222222222.jpg'
  const png = (name: string) => new File([name], name, { type: 'image/png' })

  beforeEach(() => {
    vi.mocked(discardPhotos).mockClear()
    URL.createObjectURL = vi.fn(() => 'blob:foto')
    URL.revokeObjectURL = vi.fn()
  })

  it('cambiar o quitar una foto que aún no se guardó la borra', async () => {
    const uploadPhoto = vi
      .fn<(file: File) => Promise<string>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    const { user } = renderForm({ uploadPhoto })
    await user.upload(screen.getByLabelText('Foto'), png('a.png'))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Quitar foto' })).toBeEnabled(),
    )
    await user.upload(screen.getByLabelText('Foto'), png('b.png'))
    await vi.waitFor(() => expect(discardPhotos).toHaveBeenCalledWith([first]))
    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
    expect(discardPhotos).toHaveBeenLastCalledWith([second])
  })

  it('la foto guardada del producto se borra recién al guardarlo sin ella', async () => {
    const product: ProductListItem = { ...saved, category_name: 'Laptops', image_path: first }
    const onSubmit = vi.fn(async (): Promise<ActionResult<Product>> => ({
      ok: true,
      data: { ...saved, image_path: null },
    }))
    const { user } = renderForm({ product, onSubmit })
    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
    expect(discardPhotos).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await vi.waitFor(() => expect(discardPhotos).toHaveBeenCalledWith([first]))
  })

  it('«Descartar» el borrador borra la foto que se había subido', async () => {
    const product: ProductListItem = { ...saved, category_name: 'Laptops' }
    const { user } = renderForm({ product, uploadPhoto: vi.fn(async () => first) })
    await user.upload(screen.getByLabelText('Foto'), png('a.png'))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Quitar foto' })).toBeEnabled(),
    )
    cleanup()
    expect(discardPhotos).not.toHaveBeenCalled()
    const reopened = renderForm({ product })
    await reopened.user.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(discardPhotos).toHaveBeenCalledWith([first])
  })
})
