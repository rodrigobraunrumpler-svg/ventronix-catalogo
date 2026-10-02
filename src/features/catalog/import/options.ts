import { z } from 'zod'
import { priceColumns } from '../price-columns'
import { IMPORT_MODES, type ImportColumn, type ImportMode, type ImportOptions } from './types'

// Límites de la carga masiva (spec del Excel §10): en un solo sitio, para ajustarlos si el negocio
// crece. Se comprueban en el navegador y otra vez en el servidor.
export const IMPORT_MAX_ROWS = 5000
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024
// Un precio que sube o baja la mitad o más pasa a «Para revisar» (spec §9.4).
export const PRICE_CHANGE_WARNING = 0.5
// Categoría «parecida»: hasta 2 letras de diferencia en nombres de 5 o más (spec §9.4).
export const CATEGORY_SIMILARITY_DISTANCE = 2
export const CATEGORY_SIMILARITY_MIN_LENGTH = 5

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  pricesIncludeTax: true,
  mode: 'all',
  categoryMap: {},
}

export const MODE_LABELS: Record<ImportMode, string> = {
  all: 'Crear y actualizar',
  create: 'Solo crear los nuevos',
  update: 'Solo actualizar los existentes',
}

// Mensajes a nivel de archivo (spec §12.1): dicen qué pasó y qué hacer.
export const FILE_MESSAGES = {
  notXlsx:
    'Ese archivo no es un Excel .xlsx. Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)".',
  tooBig: 'El archivo pesa más de 4 MB. Divide los productos en varios archivos.',
  tooManyRows: 'El archivo tiene más de 5 000 productos. Divídelo en archivos de hasta 5 000.',
  noColumns:
    'No encontramos las columnas de la plantilla. La primera fila debe tener al menos Código y lo que quieras cargar o actualizar.',
  noCode: 'Falta la columna Código: es la que identifica cada producto.',
  priceList:
    'Este archivo es una lista de precios, para clientes. Para actualizar precios usa "Descargar mi catálogo" o la plantilla.',
  empty: 'El archivo no tiene productos. Completa la plantilla desde la fila 2.',
  unreadable:
    'No pudimos abrir el archivo. Si tiene contraseña, quítasela; si no, vuelve a guardarlo desde Excel.',
} as const

// Lo que se comprueba en el navegador antes de enviar (spec §6.5); el servidor lo repite.
export function checkFile(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith('.xlsx')) return FILE_MESSAGES.notXlsx
  if (file.size > IMPORT_MAX_BYTES) return FILE_MESSAGES.tooBig
  return null
}

// Misma regla que el índice único de categorías: lower(btrim(name)).
export const categoryKey = (name: string) => name.trim().toLowerCase()

// Títulos de la plantilla, iguales a los del reporte completo: lo que se descarga se puede subir.
// Aquí y no en excel/ (solo servidor): la guía del paso 2 también los muestra.
export function templateTitles(): Record<ImportColumn, string> {
  return {
    code: 'Código',
    name: 'Nombre',
    description: 'Descripción',
    category: 'Categoría',
    price: priceColumns().catalog,
  }
}

const decisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('use'), target: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal('create') }),
])

// Llegan del navegador con cada petición: el servidor las valida (spec §9.2).
export const importOptionsSchema = z.object({
  pricesIncludeTax: z.boolean(),
  mode: z.enum(IMPORT_MODES),
  categoryMap: z
    .record(z.string().max(240), decisionSchema)
    .refine((map) => Object.keys(map).length <= IMPORT_MAX_ROWS, 'Demasiadas categorías.'),
})
