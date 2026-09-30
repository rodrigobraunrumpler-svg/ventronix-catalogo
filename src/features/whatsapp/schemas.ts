import { z } from 'zod'
import { digitsOnly } from '@/lib/peru'
import { PAIRING_CODE } from './format'

// Vincular el WhatsApp de la empresa (spec de WhatsApp §4): el celular y el código que muestra la
// pantalla.
export const linkSchema = z.object({
  phone: z
    .string()
    .transform(digitsOnly)
    .pipe(z.string().regex(/^9\d{8}$/, 'Escribe un celular de 9 dígitos que empiece con 9.')),
  code: z.string().regex(PAIRING_CODE, 'El código no es válido.'),
})

export type WhatsAppStatus = { configured: boolean; phone: string | null; linkedAt: string | null }
