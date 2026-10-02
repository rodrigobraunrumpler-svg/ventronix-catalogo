import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  activeShortcut,
  CatalogStatsChips,
} from '@/features/catalog/products/components/catalog-stats'

describe('CatalogStatsChips', () => {
  it('muestra las cifras, marca la activa y desactiva las que están en cero', () => {
    render(
      <CatalogStatsChips
        stats={{ products: 123, createdThisMonth: 15, updatedLast7Days: 0 }}
        active="created-this-month"
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '123 productos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: '15 nuevos este mes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '0 modificados en 7 días' })).toBeDisabled()
  })

  it('usa el singular y avisa qué cifra se eligió', async () => {
    const onSelect = vi.fn()
    render(
      <CatalogStatsChips
        stats={{ products: 1, createdThisMonth: 1, updatedLast7Days: 1 }}
        active={null}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: '1 producto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 nuevo este mes' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '1 modificado en 7 días' }))
    expect(onSelect).toHaveBeenCalledWith('updated-7-days')
  })
})

describe('activeShortcut', () => {
  const base = { search: '', category: null, dateBy: 'created', date: null } as const

  it('reconoce la cifra de la vista actual', () => {
    expect(activeShortcut(base)).toBe('all')
    expect(activeShortcut({ ...base, date: 'month' })).toBe('created-this-month')
    expect(activeShortcut({ ...base, dateBy: 'updated', date: '7d' })).toBe('updated-7-days')
  })

  it('con búsqueda, categoría u otro rango no marca ninguna', () => {
    expect(activeShortcut({ ...base, search: 'hp' })).toBeNull()
    expect(activeShortcut({ ...base, date: 'month', category: 'c1' })).toBeNull()
    expect(activeShortcut({ ...base, date: '30d' })).toBeNull()
  })
})
