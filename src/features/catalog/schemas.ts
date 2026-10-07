import { z } from 'zod'
import { photoPathSchema } from '@/lib/photos'
import { unitPriceSchema } from './money'

// Importable en cliente y servidor. Las claves desconocidas (id, fechas) se descartan al parsear.

export const idSchema = z.uuid('Identificador no válido')

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Escribe un nombre para la categoría.')
    .max(120, 'Usa como máximo 120 caracteres.'),
})

export const productSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Escribe un código para identificar el producto.')
    .max(64, 'Usa como máximo 64 caracteres.')
    .transform((code) => code.toUpperCase()),
  name: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre del producto.')
    .max(120, 'Usa como máximo 120 caracteres.'),
  description: z
    .string()
    .trim()
    .max(2000, 'Usa como máximo 2000 caracteres.')
    .nullish()
    .transform((description) => description || null),
  category_id: z.uuid('Selecciona una categoría.'),
  unit_price: unitPriceSchema,
  // Opcional (spec de productos libres §4.7): solo una ruta products/<uuid>.jpg del bucket.
  image_path: photoPathSchema('products')
    .nullish()
    .transform((path) => path ?? null),
})

// Valores del formulario (entrada) frente a datos normalizados (salida).
export type CategoryFormValues = z.input<typeof categorySchema>
export type ProductFormValues = z.input<typeof productSchema>
