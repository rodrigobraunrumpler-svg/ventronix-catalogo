import { z } from 'zod'

// Precio como string decimal exacto: sin coma flotante, hasta 10 enteros y 2 decimales (spec §6).
export const unitPriceSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/, 'Usa hasta dos decimales, sin miles')
  .transform((value) => {
    const [whole, fraction = ''] = value.replace(',', '.').split('.')
    return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`
  })
  .refine((value) => BigInt(value.replace('.', '')) > BigInt(0), {
    message: 'El precio debe ser mayor que cero',
  })
