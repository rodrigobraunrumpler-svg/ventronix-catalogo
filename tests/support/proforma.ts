import {
  EMPTY_DRAFT,
  PROFORMA_DRAFT_KEY,
  type ProformaDraft,
  type ProformaLine,
} from '@/features/proforma/draft'
import { saveDraft } from '@/lib/drafts'

export { completeCompany } from './company'

export const line = (overrides: Partial<ProformaLine> = {}): ProformaLine => ({
  productId: '8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c',
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  catalogPrice: '2590.00',
  unitPrice: '2590.00',
  quantity: 1,
  ...overrides,
})

// Las líneas del ejemplo E1 de la spec (§5.3); la impresora lleva un precio especial.
export const e1Lines = [
  line({ quantity: 2 }),
  line({
    productId: 'impresora',
    code: 'IMP-001',
    name: 'Impresora láser',
    catalogPrice: '890.00',
    unitPrice: '850',
  }),
  line({
    productId: 'computadora',
    code: 'CMP-001',
    name: 'Computadora de escritorio',
    catalogPrice: '2490.00',
    unitPrice: '2490.00',
  }),
]

// Deja una proforma en el navegador antes de montar la pantalla.
export function seedProforma(draft: Partial<ProformaDraft>) {
  saveDraft(PROFORMA_DRAFT_KEY, { ...EMPTY_DRAFT, ...draft })
}
