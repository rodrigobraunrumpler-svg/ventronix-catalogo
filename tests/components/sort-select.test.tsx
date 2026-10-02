import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SortSelect } from '@/features/catalog/products/components/sort-select'

describe('SortSelect', () => {
  it('muestra el orden actual y avisa del nuevo', async () => {
    const onChange = vi.fn()
    render(<SortSelect value="name" onChange={onChange} />)
    const select = screen.getByLabelText('Ordenar por')
    expect(select).toHaveDisplayValue('Nombre A–Z')
    await userEvent.setup().selectOptions(select, 'Precio: mayor a menor')
    expect(onChange).toHaveBeenCalledWith('price-desc')
  })
})
