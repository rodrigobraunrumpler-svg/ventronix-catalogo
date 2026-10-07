import { z } from 'zod'
import { storedCompanySchema } from '@/features/company/queries'
import { documentInputSchema, type GeneratedDocument } from '../document/input'

// La copia que guarda cada proforma del historial (spec de productos libres §3): lo que se envió al
// generarla y los datos de la empresa de ese día. Con ella se vuelve a armar el mismo PDF.
// Se guarda para siempre: un campo nuevo de DocumentInput o de la empresa necesita un valor por
// defecto, o las copias anteriores dejan de leerse (tests/unit/proforma-snapshot.test.ts).
export const snapshotSchema = z.object({
  input: documentInputSchema,
  company: storedCompanySchema,
})

export type ProformaSnapshot = z.infer<typeof snapshotSchema>

// El PDF del historial y el mensaje con que se reenvía (plan, decisión 8).
export type StoredDocument = GeneratedDocument & { message: string }
