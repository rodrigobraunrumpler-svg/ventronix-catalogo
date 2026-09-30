import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addProduct, EMPTY_DRAFT } from '@/features/proforma/draft'
import { ProformaProvider, useProforma } from '@/features/proforma/store'
import { clearAllDrafts } from '@/lib/drafts'
import { seedProforma } from '../support/proforma'

// Lo que ve esta pestaña cuando otra escribe o borra la proforma en el navegador.
function changeInOtherTab(value: string | null) {
  const key = 'catalogo:borrador:proforma'
  act(() => {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }))
  })
}

const laptop = {
  id: 'p1',
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  unit_price: '2590.00',
}

function Probe() {
  const { draft, update } = useProforma()
  return (
    <div>
      <p>Líneas: {draft.lines.length}</p>
      <button type="button" onClick={() => update((current) => addProduct(current, laptop))}>
        Añadir
      </button>
    </div>
  )
}

const renderProbe = () =>
  render(
    <ProformaProvider>
      <Probe />
    </ProformaProvider>,
  )

describe('proforma guardada en el navegador', () => {
  it('conserva lo añadido al volver a abrir la pantalla', async () => {
    renderProbe()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Añadir' }))
    expect(screen.getByText('Líneas: 1')).toBeVisible()
    cleanup()
    renderProbe()
    expect(screen.getByText('Líneas: 1')).toBeVisible()
  })

  it('tras cerrar sesión (borradores borrados) empieza vacía', async () => {
    renderProbe()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Añadir' }))
    cleanup()
    clearAllDrafts()
    renderProbe()
    expect(screen.getByText('Líneas: 0')).toBeVisible()
  })

  it('ignora un borrador dañado o de otra versión sin romper la pantalla', () => {
    localStorage.setItem('catalogo:borrador:proforma', '{"lines":[{"precio":1}]}')
    renderProbe()
    expect(screen.getByText('Líneas: 0')).toBeVisible()
  })

  it('sigue los cambios hechos en otra pestaña, sin pisarlos', () => {
    renderProbe()
    changeInOtherTab(JSON.stringify(addProduct(EMPTY_DRAFT, laptop)))
    expect(screen.getByText('Líneas: 1')).toBeVisible()
  })

  it('si otra pestaña cierra sesión, la proforma se vacía aquí también', () => {
    seedProforma({ lines: addProduct(EMPTY_DRAFT, laptop).lines })
    renderProbe()
    expect(screen.getByText('Líneas: 1')).toBeVisible()
    changeInOtherTab(null)
    expect(screen.getByText('Líneas: 0')).toBeVisible()
  })
})
