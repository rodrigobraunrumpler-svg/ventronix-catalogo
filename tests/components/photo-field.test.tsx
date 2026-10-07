import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoField } from '@/components/photo-field'
import { UnreadablePhotoError } from '@/lib/use-photos'

const path = 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:local')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('PhotoField', () => {
  it('muestra la foto elegida al instante, la sube y deja quitarla', async () => {
    const upload = vi.fn(async () => path)
    const onChange = vi.fn()
    const { rerender } = render(
      <PhotoField
        value={null}
        url={undefined}
        alt="Foto de Laptop"
        upload={upload}
        onChange={onChange}
      />,
    )
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Elegir foto' })).toBeVisible()
    expect(
      screen.getByText('JPG, PNG o WebP. Antes de guardarla se reduce a 600 px (unos 50 KB).'),
    ).toBeVisible()
    const file = new File(['foto'], 'laptop.webp', { type: 'image/webp' })
    await user.upload(screen.getByLabelText('Foto'), file)
    expect(upload).toHaveBeenCalledWith(file)
    expect(onChange).toHaveBeenCalledWith(path)

    rerender(
      <PhotoField
        value={path}
        url={undefined}
        alt="Foto de Laptop"
        upload={upload}
        onChange={onChange}
      />,
    )
    // La copia local, sin esperar la URL firmada.
    expect(screen.getByRole('img', { name: 'Foto de Laptop' })).toHaveAttribute('src', 'blob:local')
    expect(screen.getByRole('button', { name: 'Cambiar foto' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('una foto ya guardada se ve con su URL firmada', () => {
    render(
      <PhotoField
        value={path}
        url="https://storage.test/foto.thumb.jpg"
        alt="Foto de Laptop"
        upload={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('img', { name: 'Foto de Laptop' })).toHaveAttribute(
      'src',
      'https://storage.test/foto.thumb.jpg',
    )
  })

  it('distingue un archivo que no es foto, una foto ilegible y un fallo de conexión', async () => {
    const upload = vi
      .fn<(file: File) => Promise<string>>()
      .mockRejectedValueOnce(new UnreadablePhotoError())
      .mockRejectedValueOnce(new Error('sin red'))
    render(
      <PhotoField value={null} url={undefined} alt="Foto" upload={upload} onChange={vi.fn()} />,
    )
    const user = userEvent.setup({ applyAccept: false })
    const input = screen.getByLabelText('Foto')
    await user.upload(input, new File(['x'], 'nota.txt', { type: 'text/plain' }))
    expect(screen.getByText('Elige una foto JPG, PNG o WebP.')).toBeVisible()
    expect(upload).not.toHaveBeenCalled()
    await user.upload(input, new File(['x'], 'rota.jpg', { type: 'image/jpeg' }))
    expect(
      await screen.findByText('No pudimos leer esta foto. Prueba con otra en JPG, PNG o WebP.'),
    ).toBeVisible()
    await user.upload(input, new File(['x'], 'foto.png', { type: 'image/png' }))
    expect(
      await screen.findByText('No pudimos subir la foto. Revisa tu conexión e inténtalo de nuevo.'),
    ).toBeVisible()
  })
})
