// Paleta fija sin tonos cercanos al verde de marca de las acciones; cada texto cumple 4.5:1 sobre
// su fondo (spec §7).
export const CATEGORY_PALETTE = [
  { bg: '#e3f5ec', fg: '#047857' },
  { bg: '#fef3e2', fg: '#a0550b' },
  { bg: '#e0f4f8', fg: '#0e7490' },
  { bg: '#efebfe', fg: '#5b3fd1' },
  { bg: '#fdecf1', fg: '#be185d' },
  { bg: '#fdeee6', fg: '#c2410c' },
  { bg: '#eef2f7', fg: '#475569' },
  { bg: '#e7eefc', fg: '#1d4ed8' },
] as const

// Color estable derivado del ID: sin columnas de color en la base de datos.
export function categoryColor(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length]
}
