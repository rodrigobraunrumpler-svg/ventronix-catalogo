import { describe, expect, it } from 'vitest'
import { CATEGORY_PALETTE, categoryColor } from '@/features/catalog/categories/theme'

const ids = Array.from(
  { length: 40 },
  (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
)

// Contraste WCAG entre dos colores #rrggbb.
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

// Tono (0–360°) de un color #rrggbb.
function hue(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const delta = max - Math.min(r, g, b)
  if (delta === 0) return 0
  const h =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return (h * 60 + 360) % 360
}

describe('color de categoría', () => {
  it('da siempre el mismo color al mismo ID', () => {
    expect(categoryColor(ids[7])).toEqual(categoryColor(ids[7]))
  })

  it('reparte IDs distintos entre varios colores de la paleta', () => {
    const used = new Set(ids.map((id) => categoryColor(id).fg))
    expect(used.size).toBeGreaterThan(4)
    for (const id of ids) expect(CATEGORY_PALETTE).toContainEqual(categoryColor(id))
  })

  it('no usa tonos cercanos al verde de marca, reservado para acciones', () => {
    const brandHue = hue('#72ce0b')
    for (const { fg } of CATEGORY_PALETTE) {
      const distance = Math.abs(hue(fg) - brandHue)
      expect(Math.min(distance, 360 - distance)).toBeGreaterThan(30)
    }
  })

  it('cada texto tiene un contraste de al menos 4.5:1 sobre su fondo', () => {
    for (const { bg, fg } of CATEGORY_PALETTE) {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
