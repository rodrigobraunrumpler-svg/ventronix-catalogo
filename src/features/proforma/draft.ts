import { z } from 'zod'
import type { ProductListItem } from '@/features/catalog/types'
import { MAX_QUANTITY } from './totals'

// Proforma en curso (spec §6.1): una sola, en este navegador. Los datos del producto se copian al
// añadirlo; el catálogo nunca se modifica desde aquí.
const lineSchema = z.object({
  productId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  catalogPrice: z.string(), // precio del catálogo al añadirlo
  unitPrice: z.string(), // precio de la proforma, tal como se escribe
  quantity: z.number().int().nonnegative(),
})

export const draftSchema = z.object({
  lines: z.array(lineSchema),
  client: z.object({
    name: z.string(),
    document: z.string(),
    phone: z.string(),
    address: z.string(),
    deliveryTime: z.string(),
  }),
  validityDays: z.string(), // vacío: la validez por defecto de la empresa
  discountPercent: z.string(),
  shipping: z.string(),
  number: z.number().int().positive().nullable(), // asignado al generar
  updatedAt: z.string(),
})

export type ProformaLine = z.infer<typeof lineSchema>
export type ProformaDraft = z.infer<typeof draftSchema>
export type ProformaClient = ProformaDraft['client']
type Conditions = Pick<ProformaDraft, 'validityDays' | 'discountPercent' | 'shipping'>
type ProductData = Pick<ProductListItem, 'id' | 'code' | 'name' | 'description' | 'unit_price'>

export const EMPTY_DRAFT: ProformaDraft = {
  lines: [],
  client: { name: '', document: '', phone: '', address: '', deliveryTime: '' },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  number: null,
  updatedAt: '',
}

export const findLine = (draft: ProformaDraft, productId: string) =>
  draft.lines.find((line) => line.productId === productId)

function mapLine(
  draft: ProformaDraft,
  productId: string,
  change: (line: ProformaLine) => ProformaLine,
): ProformaDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) => (line.productId === productId ? change(line) : line)),
  }
}

// Añadir un producto que ya está suma una unidad, hasta el máximo.
export function addProduct(draft: ProformaDraft, product: ProductData): ProformaDraft {
  if (findLine(draft, product.id)) {
    return mapLine(draft, product.id, (line) => ({
      ...line,
      quantity: Math.min(line.quantity + 1, MAX_QUANTITY),
    }))
  }
  const line: ProformaLine = {
    productId: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    catalogPrice: product.unit_price,
    unitPrice: product.unit_price,
    quantity: 1,
  }
  return { ...draft, lines: [...draft.lines, line] }
}

export const setQuantity = (draft: ProformaDraft, productId: string, quantity: number) =>
  mapLine(draft, productId, (line) => ({ ...line, quantity }))

export const setUnitPrice = (draft: ProformaDraft, productId: string, unitPrice: string) =>
  mapLine(draft, productId, (line) => ({ ...line, unitPrice }))

export const restorePrice = (draft: ProformaDraft, productId: string) =>
  mapLine(draft, productId, (line) => ({ ...line, unitPrice: line.catalogPrice }))

// «Actualizar» (spec §4.5): el precio actual del catálogo pasa a ser el de la línea.
export const applyCatalogPrice = (draft: ProformaDraft, productId: string, price: string) =>
  mapLine(draft, productId, (line) => ({ ...line, catalogPrice: price, unitPrice: price }))

export const removeLine = (draft: ProformaDraft, productId: string): ProformaDraft => ({
  ...draft,
  lines: draft.lines.filter((line) => line.productId !== productId),
})

// «Deshacer» devuelve la línea a su sitio, salvo que se haya vuelto a añadir mientras tanto.
export function restoreLine(
  draft: ProformaDraft,
  line: ProformaLine,
  index: number,
): ProformaDraft {
  if (findLine(draft, line.productId)) return draft
  const lines = [...draft.lines]
  lines.splice(Math.min(index, lines.length), 0, line)
  return { ...draft, lines }
}

export const patchClient = (
  draft: ProformaDraft,
  patch: Partial<ProformaClient>,
): ProformaDraft => ({
  ...draft,
  client: { ...draft.client, ...patch },
})

export const patchConditions = (
  draft: ProformaDraft,
  patch: Partial<Conditions>,
): ProformaDraft => ({
  ...draft,
  ...patch,
})

export const setNumber = (draft: ProformaDraft, number: number): ProformaDraft => ({
  ...draft,
  number,
})

export const unitCount = (draft: ProformaDraft) =>
  draft.lines.reduce((sum, line) => sum + line.quantity, 0)

export const unitsText = (quantity: number) =>
  `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`

// Aviso para lectores de pantalla con las unidades de un producto en esta proforma.
export const quantityMessage = (draft: ProformaDraft, product: { id: string; name: string }) =>
  `${product.name}: ${unitsText(findLine(draft, product.id)?.quantity ?? 0)} en la proforma`

// Clave del borrador en el navegador (prefijo de src/lib/drafts.ts, que se borra al cerrar sesión).
export const PROFORMA_DRAFT_KEY = 'proforma'
