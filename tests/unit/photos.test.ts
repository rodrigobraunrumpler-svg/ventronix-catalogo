import { describe, expect, it } from 'vitest'
import { fitWithin, photoPathSchema, PHOTO_THUMB_SIDE, thumbPath } from '@/lib/photos'

describe('fitWithin', () => {
  it.each([
    [4000, 3000, 600, { width: 600, height: 450 }],
    [1080, 1920, 600, { width: 338, height: 600 }],
    [300, 200, 600, { width: 300, height: 200 }],
    [6000, 10, 600, { width: 600, height: 1 }],
    [4000, 3000, PHOTO_THUMB_SIDE, { width: 200, height: 150 }],
  ])('%i × %i en %i px', (width, height, max, expected) => {
    expect(fitWithin(width, height, max)).toEqual(expected)
  })
})

describe('rutas de fotos', () => {
  const id = '8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c'

  it('acepta <carpeta>/<uuid>.jpg y, si se pide, solo una carpeta', () => {
    expect(photoPathSchema().safeParse(`lines/${id}.jpg`).success).toBe(true)
    expect(photoPathSchema('products').safeParse(`products/${id}.jpg`).success).toBe(true)
    expect(photoPathSchema('products').safeParse(`lines/${id}.jpg`).success).toBe(false)
  })

  it.each([
    `otros/${id}.jpg`,
    `products/${id}.png`,
    `products/../${id}.jpg`,
    'products/foto.jpg',
    `products/${id}.jpg.exe`,
    `/products/${id}.jpg`,
    `products/${id.toUpperCase()}.jpg`,
    `products/${id}.thumb.jpg`,
  ])('rechaza %s', (path) => {
    expect(photoPathSchema().safeParse(path).success).toBe(false)
  })

  it('la miniatura vive junto a la foto', () => {
    expect(thumbPath(`products/${id}.jpg`)).toBe(`products/${id}.thumb.jpg`)
  })
})
