import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { documentInput } from '@/features/proforma/document/input'
import { buildDocumentModel } from '@/features/proforma/document/model'
import { renderProformaPdf } from '@/features/proforma/document/pdf'
import { EMPTY_DRAFT } from '@/features/proforma/draft'
import { pdfObjects } from '../support/pdf-text'
import { completeCompany, freeLine } from '../support/proforma'

// Los colores de relleno que pinta el PDF, en hexadecimal: pdfkit los escribe «r g b scn», de 0 a 1.
function fills(pdf: Buffer) {
  const hex = (part: string) =>
    Math.round(Number(part) * 255)
      .toString(16)
      .padStart(2, '0')
  const colors = new Set<string>()
  for (const stream of pdfObjects(pdf).streams.values()) {
    for (const [, r, g, b] of stream.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) scn/g)) {
      colors.add(`#${hex(r)}${hex(g)}${hex(b)}`)
    }
  }
  return colors
}

// Lo que mide cada imagen dibujada, en puntos: pdfkit la coloca con «w 0 0 -h x y cm /I1 Do».
function drawnImages(pdf: Buffer) {
  const sizes: { width: number; height: number }[] = []
  for (const stream of pdfObjects(pdf).streams.values()) {
    for (const [, width, height] of stream.matchAll(
      /([\d.]+) 0 0 (-?[\d.]+) -?[\d.]+ -?[\d.]+ cm\s+\/\w+ Do/g,
    )) {
      sizes.push({ width: Number(width), height: Math.abs(Number(height)) })
    }
  }
  return sizes
}

// Una línea con foto apaisada (el logotipo), como la firma de la captura del usuario.
async function landscapePhotoPdf() {
  const path = 'lines/00000000-0000-4000-8000-000000000001.jpg'
  const input = documentInput(
    { ...EMPTY_DRAFT, includePhotos: true, lines: [freeLine({ imagePath: path })] },
    { draft: true },
  )
  const model = buildDocumentModel(input, completeCompany, new Date('2026-10-07T15:00:00Z'))
  const photo = readFileSync('public/brand/ventronix-logo-proforma.jpg')
  return renderProformaPdf(model, new Map([[path, photo]]))
}

describe('la foto en el PDF', () => {
  it('va en un recuadro blanco: la que no es cuadrada no deja franjas grises', async () => {
    const colors = fills(await landscapePhotoPdf())
    // La franja verde del pie: los rellenos se leen bien.
    expect(colors).toContain('#72ce0b')
    expect(colors).not.toContain('#f1f3ee')
  })

  it('no tapa el borde del recuadro', async () => {
    // La foto es la imagen pequeña; el logotipo de la cabecera y la franja de marcas son grandes.
    const photos = drawnImages(await landscapePhotoPdf()).filter((size) => size.width < 50)
    expect(photos).toHaveLength(1)
    // El recuadro mide 38 pt con un borde de 0,75 pt por lado.
    expect(photos[0].width).toBeLessThanOrEqual(38 - 2 * 0.75)
  })
})
