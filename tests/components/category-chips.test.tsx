import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CategoryChips } from '@/features/catalog/categories/components/category-chips'
import type { CategoryListItem } from '@/features/catalog/types'

const category = (id: string, name: string, product_count: number): CategoryListItem => ({
  id,
  name,
  product_count,
  created_at: '',
  updated_at: '',
})
const categories = [category('c1', 'Impresoras', 16), category('c2', 'Laptops', 22)]

describe('CategoryChips', () => {
  it('muestra todas las categorías con su cantidad y marca la elegida', () => {
    render(<CategoryChips categories={categories} selected="c2" onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Todos 38' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: 'Laptops 22' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('al tocar una categoría filtra por ella, y «Todos» quita el filtro', async () => {
    const onSelect = vi.fn()
    render(<CategoryChips categories={categories} selected={null} onSelect={onSelect} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Impresoras 16' }))
    expect(onSelect).toHaveBeenCalledWith('c1')
    await user.click(screen.getByRole('button', { name: 'Todos 38' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
})
