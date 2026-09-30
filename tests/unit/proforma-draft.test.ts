import { describe, expect, it } from 'vitest'
import {
  addProduct,
  applyCatalogPrice,
  draftSchema,
  EMPTY_DRAFT,
  patchClient,
  removeLine,
  restoreLine,
  restorePrice,
  setNumber,
  setQuantity,
  setUnitPrice,
  unitCount,
} from '@/features/proforma/draft'

const laptop = {
  id: 'p1',
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: 'Ligera',
  unit_price: '2590.00',
}
const printer = {
  id: 'p2',
  code: 'IMP-001',
  name: 'Impresora láser',
  description: null,
  unit_price: '890.00',
}

describe('proforma en curso', () => {
  it('añadir copia los datos del producto y añadir otra vez suma una unidad', () => {
    const draft = addProduct(addProduct(EMPTY_DRAFT, laptop), laptop)
    expect(draft.lines).toEqual([
      {
        productId: 'p1',
        code: 'LAP-001',
        name: 'Laptop de 14 pulgadas',
        description: 'Ligera',
        catalogPrice: '2590.00',
        unitPrice: '2590.00',
        quantity: 2,
      },
    ])
  })

  it('no pasa de 9 999 unidades', () => {
    const full = setQuantity(addProduct(EMPTY_DRAFT, laptop), 'p1', 9999)
    expect(addProduct(full, laptop).lines[0].quantity).toBe(9999)
  })

  it('Restaurar vuelve al precio del catálogo y Actualizar adopta el nuevo', () => {
    const edited = setUnitPrice(addProduct(EMPTY_DRAFT, laptop), 'p1', '2400')
    expect(restorePrice(edited, 'p1').lines[0].unitPrice).toBe('2590.00')
    expect(applyCatalogPrice(edited, 'p1', '2490.00').lines[0]).toMatchObject({
      catalogPrice: '2490.00',
      unitPrice: '2490.00',
    })
  })

  it('Deshacer devuelve la línea quitada a su sitio, sin duplicarla', () => {
    const draft = addProduct(addProduct(EMPTY_DRAFT, laptop), printer)
    const removed = removeLine(draft, 'p1')
    expect(restoreLine(removed, draft.lines[0], 0).lines.map((line) => line.productId)).toEqual([
      'p1',
      'p2',
    ])
    expect(restoreLine(addProduct(removed, laptop), draft.lines[0], 0).lines).toHaveLength(2)
  })

  it('cuenta las unidades y cambia al cliente sin tocar las líneas', () => {
    const draft = patchClient(addProduct(addProduct(EMPTY_DRAFT, laptop), laptop), {
      name: 'Cliente',
    })
    expect(unitCount(draft)).toBe(2)
    expect(draft.client).toMatchObject({ name: 'Cliente', document: '' })
    expect(draft.lines).toHaveLength(1)
  })

  it('el esquema acepta la proforma vacía y rechaza datos incompletos', () => {
    expect(draftSchema.safeParse(EMPTY_DRAFT).success).toBe(true)
    expect(draftSchema.safeParse({ lines: [{ precio: 1 }] }).success).toBe(false)
  })

  it('al generar guarda el número y fija la fecha', () => {
    const draft = setNumber(EMPTY_DRAFT, 7, '2026-09-30T15:00:00.000Z')
    expect(draft).toMatchObject({ number: 7, issuedAt: '2026-09-30T15:00:00.000Z' })
  })

  it('lee borradores guardados antes de que existiera la fecha', () => {
    const { issuedAt, ...older } = { ...EMPTY_DRAFT, number: 3 }
    expect(issuedAt).toBeNull()
    expect(draftSchema.parse(older)).toMatchObject({ number: 3, issuedAt: null })
  })
})
