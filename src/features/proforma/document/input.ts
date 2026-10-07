import { z } from 'zod'
import type { ProformaDraft } from '../draft'
import { MAX_QUANTITY } from '../totals'

const text = (max: number) => z.string().max(max)

// Lo que viaja al servidor para generar el documento. El servidor lo valida y recalcula todo.
export const documentInputSchema = z.object({
  draft: z.boolean(),
  number: z.number().int().positive().nullable(),
  issuedAt: z.iso.datetime().nullable(),
  lines: z
    .array(
      z.object({
        code: z.string().trim().max(64), // un producto libre puede no tener código
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).nullable(),
        unitPrice: text(20),
        quantity: z.number().int().min(1).max(MAX_QUANTITY),
      }),
    )
    .min(1)
    .max(300),
  client: z.object({
    name: text(200),
    document: text(11),
    phone: text(11),
    address: text(300),
    deliveryTime: text(120),
  }),
  validityDays: text(3),
  discountPercent: text(10),
  shipping: text(20),
})

export type DocumentInput = z.infer<typeof documentInputSchema>

// El PDF viaja en base64 dentro de la respuesta de la Server Action.
export type GeneratedDocument = { fileName: string; base64: string }

export function documentInput(draft: ProformaDraft, options: { draft: boolean }): DocumentInput {
  return {
    draft: options.draft,
    number: draft.number,
    issuedAt: draft.issuedAt,
    lines: draft.lines.map(({ code, name, description, unitPrice, quantity }) => ({
      code,
      name,
      description,
      unitPrice,
      quantity,
    })),
    client: draft.client,
    validityDays: draft.validityDays,
    discountPercent: draft.discountPercent,
    shipping: draft.shipping,
  }
}
