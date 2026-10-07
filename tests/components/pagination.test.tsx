import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from '@/components/pagination'

describe('Pagination', () => {
  it('muestra qué filas se ven y cambia de página con los números, Anterior y Siguiente', async () => {
    const onPage = vi.fn()
    render(
      <Pagination
        page={2}
        totalPages={9}
        label="Páginas de proformas"
        summary="Proformas 21–40 de 171"
        onPage={onPage}
      />,
    )
    const nav = within(screen.getByRole('navigation', { name: 'Páginas de proformas' }))
    expect(screen.getByText('Proformas 21–40 de 171')).toBeVisible()
    expect(nav.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')
    const user = userEvent.setup()
    await user.click(nav.getByRole('button', { name: 'Página 9' }))
    await user.click(nav.getByRole('button', { name: 'Página anterior' }))
    await user.click(nav.getByRole('button', { name: 'Página siguiente' }))
    expect(onPage.mock.calls).toEqual([[9], [1], [3]])
  })

  it('en la primera y en la última no deja salirse', () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={2} label="Páginas" summary="" onPage={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    rerender(<Pagination page={2} totalPages={2} label="Páginas" summary="" onPage={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
  })
})
