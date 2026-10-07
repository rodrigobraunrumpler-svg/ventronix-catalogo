import { z } from 'zod'
import type { ProductListItem } from '@/features/catalog/types'
import { photoPathSchema } from '@/lib/photos'
import { priceError } from './readiness'
import { MAX_QUANTITY } from './totals'

// Proforma en curso (spec §6.1): una sola, en este navegador. Los datos del producto se copian al
// añadirlo; el catálogo nunca se modifica desde aquí. Un producto libre (spec de productos libres
// §4.3) existe solo en la proforma: no tiene producto ni precio de catálogo.
const lineSchema = z.preprocess(
  // Los borradores anteriores a los productos libres identificaban la línea por su producto.
  (value) =>
    value !== null && typeof value === 'object' && !('id' in value) && 'productId' in value
      ? { ...value, id: value.productId }
      : value,
  z.object({
    id: z.string(), // el del producto, o «libre-…»
    productId: z.string().nullable(), // null en un producto libre
    code: z.string(), // puede ir vacío en un producto libre
    name: z.string(),
    description: z.string().nullable(),
    catalogPrice: z.string().nullable(), // precio del catálogo al añadirlo; null si es libre
    unitPrice: z.string(), // precio de la proforma, tal como se escribe
    quantity: z.number().int().nonnegative(),
    // La foto copiada del producto o la subida para el libre (spec de productos libres §4.3).
    imagePath: z.string().nullable().default(null),
  }),
)

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
  // «Incluir fotos en el PDF» (spec §4.5): activado; solo se ve si alguna línea tiene foto.
  includePhotos: z.boolean().default(true),
  number: z.number().int().positive().nullable(), // asignado al generar
  // Fecha al generar (ISO). Los borradores anteriores no la tienen: se lee como null.
  issuedAt: z.string().nullable().default(null),
  updatedAt: z.string(),
})

export type ProformaLine = z.infer<typeof lineSchema>
export type ProformaDraft = z.infer<typeof draftSchema>
export type ProformaClient = ProformaDraft['client']
type Conditions = Pick<ProformaDraft, 'validityDays' | 'discountPercent' | 'shipping'>
type ProductData = Pick<
  ProductListItem,
  'id' | 'code' | 'name' | 'description' | 'unit_price' | 'image_path'
>

export const EMPTY_DRAFT: ProformaDraft = {
  lines: [],
  client: { name: '', document: '', phone: '', address: '', deliveryTime: '' },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  includePhotos: true,
  number: null,
  issuedAt: null,
  updatedAt: '',
}

// Nada que perder: ni productos, ni número, ni datos escritos. La preferencia de fotos no cuenta.
export const isEmptyDraft = (draft: ProformaDraft) =>
  draft.lines.length === 0 &&
  draft.number === null &&
  Object.values(draft.client).every((value) => value === '') &&
  draft.validityDays === '' &&
  draft.discountPercent === '' &&
  draft.shipping === ''

// Una línea del catálogo tiene el id de su producto: buscarla por producto es buscarla por línea.
export const findLine = (draft: ProformaDraft, id: string) =>
  draft.lines.find((line) => line.id === id)

function mapLine(
  draft: ProformaDraft,
  id: string,
  change: (line: ProformaLine) => ProformaLine,
): ProformaDraft {
  return { ...draft, lines: draft.lines.map((line) => (line.id === id ? change(line) : line)) }
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
    id: product.id,
    productId: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    catalogPrice: product.unit_price,
    unitPrice: product.unit_price,
    quantity: 1,
    imagePath: product.image_path,
  }
  return { ...draft, lines: [...draft.lines, line] }
}

// Lo que se escribe en «Añadir producto libre» (spec de productos libres §4.3).
export type FreeLineInput = Pick<
  ProformaLine,
  'code' | 'name' | 'unitPrice' | 'quantity' | 'imagePath'
>

// Cada producto libre es una línea nueva, aunque repita la descripción de otro.
export function addFreeLine(
  draft: ProformaDraft,
  input: FreeLineInput,
  id = `libre-${crypto.randomUUID()}`,
): ProformaDraft {
  const line: ProformaLine = {
    ...input,
    id,
    productId: null,
    description: null,
    catalogPrice: null,
  }
  return { ...draft, lines: [...draft.lines, line] }
}

// «Añadir producto libre» (spec de productos libres §4.3): las reglas de una línea del catálogo,
// con la descripción obligatoria y el código opcional.
export const freeLineSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Escribe la descripción.')
    .max(120, 'Usa como máximo 120 caracteres.'),
  code: z.string().trim().max(64, 'Usa como máximo 64 caracteres.'),
  quantity: z
    .string()
    .trim()
    .refine((value) => /^\d{1,4}$/.test(value) && Number(value) >= 1, 'De 1 a 9 999.')
    .transform(Number),
  unitPrice: z
    .string()
    .trim()
    .refine(
      (value) => priceError(value) === null,
      'Escribe un precio mayor que cero, con hasta dos decimales.',
    ),
  imagePath: photoPathSchema('lines').nullable(),
})

export type FreeLineValues = z.input<typeof freeLineSchema>

export const setQuantity = (draft: ProformaDraft, id: string, quantity: number) =>
  mapLine(draft, id, (line) => ({ ...line, quantity }))

export const setUnitPrice = (draft: ProformaDraft, id: string, unitPrice: string) =>
  mapLine(draft, id, (line) => ({ ...line, unitPrice }))

// Un producto libre no tiene precio de catálogo al que volver.
export const restorePrice = (draft: ProformaDraft, id: string) =>
  mapLine(draft, id, (line) =>
    line.catalogPrice === null ? line : { ...line, unitPrice: line.catalogPrice },
  )

// «Actualizar» (spec §4.5): el precio actual del catálogo pasa a ser el de la línea.
export const applyCatalogPrice = (draft: ProformaDraft, id: string, price: string) =>
  mapLine(draft, id, (line) => ({ ...line, catalogPrice: price, unitPrice: price }))

export const removeLine = (draft: ProformaDraft, id: string): ProformaDraft => ({
  ...draft,
  lines: draft.lines.filter((line) => line.id !== id),
})

// «Deshacer» devuelve la línea a su sitio, salvo que se haya vuelto a añadir mientras tanto.
export function restoreLine(
  draft: ProformaDraft,
  line: ProformaLine,
  index: number,
): ProformaDraft {
  if (findLine(draft, line.id)) return draft
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

export const setIncludePhotos = (draft: ProformaDraft, includePhotos: boolean): ProformaDraft => ({
  ...draft,
  includePhotos,
})

// El número y la fecha se fijan juntos al generar: «Corregir» conserva ambos (spec §6.3).
export const setNumber = (
  draft: ProformaDraft,
  number: number,
  issuedAt: string,
): ProformaDraft => ({ ...draft, number, issuedAt })

// Las fotos de los productos libres: solo las usa la proforma (las del catálogo son del producto).
export const freeLinePhotos = (lines: ProformaLine[]) =>
  lines.flatMap((line) => (line.productId === null && line.imagePath ? [line.imagePath] : []))

export const unitCount = (draft: ProformaDraft) =>
  draft.lines.reduce((sum, line) => sum + line.quantity, 0)

export const unitsText = (quantity: number) =>
  `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`

// Aviso para lectores de pantalla con las unidades de una línea de esta proforma.
export const quantityMessage = (draft: ProformaDraft, item: { id: string; name: string }) =>
  `${item.name}: ${unitsText(findLine(draft, item.id)?.quantity ?? 0)} en la proforma`

// Clave del borrador en el navegador (prefijo de src/lib/drafts.ts, que se borra al cerrar sesión).
export const PROFORMA_DRAFT_KEY = 'proforma'
