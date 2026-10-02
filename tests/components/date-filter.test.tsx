import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateFilterControl } from '@/features/catalog/products/components/date-filter'

const none = { dateBy: 'created', date: null, from: null, to: null } as const
const today = '2026-10-02'

describe('DateFilterControl', () => {
  it('sin filtro dice «Fecha»; un rango rápido se aplica al pulsarlo y cierra el panel', async () => {
    const onChange = vi.fn()
    render(<DateFilterControl value={none} today={today} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Filtrar por fecha' }))
    await user.click(screen.getByRole('radio', { name: 'Últimos 7 días' }))
    expect(onChange).toHaveBeenCalledWith({ date: '7d', from: null, to: null })
    expect(screen.queryByRole('radio', { name: 'Hoy' })).not.toBeInTheDocument()
  })

  it('con filtro muestra la selección y permite quitarlo', async () => {
    const onChange = vi.fn()
    render(
      <DateFilterControl
        value={{ ...none, dateBy: 'updated', date: 'today' }}
        today={today}
        onChange={onChange}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Fecha: Modificación: hoy' }))
    await user.click(screen.getByRole('button', { name: 'Quitar filtro' }))
    expect(onChange).toHaveBeenCalledWith({ date: null, from: null, to: null })
  })

  it('cambia qué fecha se usa sin perder el rango', async () => {
    const onChange = vi.fn()
    render(<DateFilterControl value={{ ...none, date: '7d' }} today={today} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Fecha: Registro: últimos 7 días' }))
    await user.click(screen.getByRole('radio', { name: 'Última modificación' }))
    expect(onChange).toHaveBeenCalledWith({ dateBy: 'updated', date: '7d', from: null, to: null })
  })

  it('el personalizado avisa si «Desde» va después de «Hasta» y aplica cuando está bien', async () => {
    const onChange = vi.fn()
    render(<DateFilterControl value={none} today={today} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Filtrar por fecha' }))
    await user.click(screen.getByRole('radio', { name: 'Personalizado' }))
    expect(screen.getByLabelText('Desde')).toHaveAttribute('max', today)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-10' } })
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha "Desde" no puede ser posterior a "Hasta".',
    )
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-25' } })
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(onChange).toHaveBeenCalledWith({ date: 'custom', from: '2026-09-20', to: '2026-09-25' })
  })

  it('el personalizado sin fechas pide al menos una', async () => {
    const onChange = vi.fn()
    render(<DateFilterControl value={none} today={today} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Filtrar por fecha' }))
    await user.click(screen.getByRole('radio', { name: 'Personalizado' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elige al menos una fecha.')
    expect(onChange).not.toHaveBeenCalled()
  })
})
