import { z } from 'zod'

// Fotos de los productos y de los productos libres (spec de productos libres §3, §5 y §8). Sirve en
// el navegador y en el servidor.
export const PHOTO_BUCKET = 'images'
export const PHOTO_MAX_SIDE = 600
// Miniatura del PDF y de las listas: nítida en su columna de 1,5 cm y unas cinco veces más liviana
// (plan, decisión 18).
export const PHOTO_THUMB_SIDE = 200
export const PHOTO_QUALITY = 0.82
// Lo que se puede elegir: el navegador las lee y las vuelve a guardar en JPEG.
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export type PhotoFolder = 'products' | 'lines'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

// La foto de 600 px a la que apuntan el producto y la línea: el bucket acepta además su miniatura.
export const photoPathSchema = (folder?: PhotoFolder) =>
  z
    .string()
    .regex(new RegExp(`^(${folder ?? 'products|lines'})/${UUID}\\.jpg$`), 'La foto no es válida.')

// La miniatura vive junto a la foto: products/<uuid>.jpg → products/<uuid>.thumb.jpg.
export const thumbPath = (path: string) => path.replace(/\.jpg$/, '.thumb.jpg')

// Lado mayor a `max`, sin agrandar las pequeñas ni dejar un lado en cero.
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
