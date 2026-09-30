import { z } from 'zod'

// Precio como string decimal exacto: sin coma flotante, hasta 10 enteros y 2 decimales (spec §6).
export const unitPriceSchema = z
  .string()
  .trim()
  .min(1, 'Escribe el precio unitario.')
  .regex(
    /^\d{1,10}(?:[.,]\d{1,2})?$/,
    'Escribe solo números con hasta dos decimales, por ejemplo 1250.50.',
  )
  .transform((value) => {
    const [whole, fraction = ''] = value.replace(',', '.').split('.')
    return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`
  })
  .refine((value) => BigInt(value.replace('.', '')) > BigInt(0), {
    message: 'El precio debe ser mayor que cero',
  })

// Presentación con separador de miles; opera sobre el texto, sin coma flotante.
export function formatPrice(value: string) {
  const [whole, fraction = '00'] = value.split('.')
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`
}
