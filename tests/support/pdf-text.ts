import { inflateSync } from 'node:zlib'

// Texto de un PDF de react-pdf (pdfkit) tal como sale al copiarlo: cada fuente traduce sus glifos
// con su mapa ToUnicode. Una línea por cada texto dibujado.
export function pdfText(pdf: Buffer) {
  const raw = pdf.toString('latin1')
  const dicts = new Map<string, string>()
  const streams = new Map<string, string>()
  for (const match of raw.matchAll(
    /(\d+) 0 obj\s*<<((?:(?!endobj)[\s\S])*?)>>\s*(stream\r?\n|endobj)/g,
  )) {
    const [whole, id, dict, end] = match
    dicts.set(id, dict)
    if (end !== 'endobj') {
      const start = match.index + whole.length
      const bytes = pdf.subarray(start, start + Number(/\/Length (\d+)/.exec(dict)?.[1]))
      streams.set(
        id,
        (dict.includes('/FlateDecode') ? inflateSync(bytes) : bytes).toString('latin1'),
      )
    }
  }

  // Glifo (4 cifras hexadecimales) → texto, según el mapa ToUnicode de la fuente.
  const glyphs = (fontId: string) => {
    const map = new Map<string, string>()
    const cmap = /\/ToUnicode (\d+) 0 R/.exec(dicts.get(fontId) ?? '')?.[1]
    for (const [, from, list] of (streams.get(cmap ?? '') ?? '').matchAll(
      /<(\w+)> <\w+> \[([^\]]*)\]/g,
    )) {
      ;[...list.matchAll(/<([\w ]+)>/g)].forEach(([, units], offset) => {
        const gid = (parseInt(from, 16) + offset).toString(16).padStart(4, '0')
        map.set(gid, String.fromCharCode(...units.split(' ').map((unit) => parseInt(unit, 16))))
      })
    }
    return map
  }
  const fonts = new Map<string, Map<string, string>>()
  for (const [, name, id] of raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) fonts.set(name, glyphs(id))

  const lines: string[] = []
  for (const [, contents] of raw.matchAll(/\/Contents (\d+) 0 R/g)) {
    let font = new Map<string, string>()
    for (const [, name, array] of (streams.get(contents) ?? '').matchAll(
      /\/(F\d+) [\d.]+ Tf|\[([^\]]*)\] TJ/g,
    )) {
      if (name) font = fonts.get(name) ?? new Map()
      else
        lines.push(
          [...array.matchAll(/<(\w+)>/g)]
            .flatMap(([, hex]) => hex.match(/\w{4}/g) ?? [])
            .map((gid) => font.get(gid) ?? '')
            .join(''),
        )
    }
  }
  return lines.join('\n')
}
