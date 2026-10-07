import { addDays } from 'date-fns'
import { formatDate, lima } from '@/lib/dates'
import { digitsOnly } from '@/lib/peru'

// Fecha de la proforma y «Válida hasta» (spec del documento §3), en días de Lima.
export function documentDates(issuedAt: Date, validityDays: number) {
  return {
    date: formatDate(issuedAt),
    validUntil: formatDate(addDays(issuedAt, validityDays, { in: lima })),
  }
}

// «Cliente de ejemplo S.A.C.» → «Proforma-0001-Cliente-de-ejemplo-SAC.pdf»: sin tildes ni símbolos.
export function documentFileName(number: number | null, clientName: string) {
  const slug = clientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const id = number === null ? 'borrador' : String(number).padStart(4, '0')
  return `Proforma-${id}${slug ? `-${slug}` : ''}.pdf`
}

// Mensaje que acompaña al PDF (spec de proformas libres §3 y §4.6): el de Empresa o, si está vacío,
// el de siempre. Los datos van entre llaves.
export const DEFAULT_WHATSAPP_MESSAGE =
  'Hola, {cliente}. Le envío la proforma {numero} por {total}, válida hasta el {vence}. Quedamos atentos. — {empresa}'

export const WHATSAPP_MESSAGE_LIMIT = 500

// Los datos que se pueden insertar, en el orden de los botones de Empresa.
export const MESSAGE_FIELDS = [
  { token: '{cliente}', label: 'Cliente' },
  { token: '{numero}', label: 'N° de proforma' },
  { token: '{total}', label: 'Total' },
  { token: '{vence}', label: 'Válida hasta' },
  { token: '{empresa}', label: 'Empresa' },
] as const

type WhatsappMessageInput = {
  clientName: string
  numberLabel: string
  total: string
  validUntil: string
  sender: string
}

// Un dato entre llaves, quizá seguido de punto. Mayúsculas, tildes y espacios no importan:
// «{Número}» y «{ numero }» son {numero} (plan, decisión 19).
const FIELD_PATTERN = /\{([^{}\n]{1,20})\}(\.?)/g
const fieldKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

// Lo que no es un dato queda tal cual. Un dato seguido de punto no lo duplica: «S.A.C.».
export function whatsappMessage(template: string | null, data: WhatsappMessageInput) {
  const values = new Map([
    ['cliente', data.clientName.trim()],
    ['numero', data.numberLabel],
    ['total', data.total],
    ['vence', data.validUntil],
    ['empresa', data.sender],
  ])
  return (template?.trim() || DEFAULT_WHATSAPP_MESSAGE).replace(
    FIELD_PATTERN,
    (whole: string, text: string, dot: string) => {
      const value = values.get(fieldKey(text))
      if (value === undefined) return whole
      return dot ? `${value.replace(/\.+$/, '')}.` : value
    },
  )
}

// Lo que va entre llaves y no es un dato: se enviaría tal cual, y el editor de Empresa lo avisa.
export function unknownMessageFields(template: string) {
  const known = new Set(MESSAGE_FIELDS.map((field) => field.token.slice(1, -1)))
  const unknown = [...template.matchAll(FIELD_PATTERN)]
    .map(([, text]) => text)
    .filter((text) => !known.has(fieldKey(text)))
  return [...new Set(unknown)].map((text) => `{${text}}`)
}

// Chat del cliente en WhatsApp con el mensaje: código de Perú delante del celular.
export const whatsappLink = (phone: string, message: string) =>
  `https://wa.me/51${digitsOnly(phone)}?text=${encodeURIComponent(message)}`

// Un código largo se parte en líneas de `width` caracteres, como lo haría el navegador: tras «-»,
// «/», «_», «.» o un espacio; un tramo que no cabe se corta donde llegue (la fuente es monoespaciada).
export function wrapCode(code: string, width: number) {
  const lines: string[] = []
  let line = ''
  for (const part of code.match(/[^-/_. ]+[-/_. ]*|[-/_. ]+/g) ?? []) {
    if (line && line.length + part.trimEnd().length > width) {
      lines.push(line.trimEnd())
      line = ''
    }
    line += part
    while (line.trimEnd().length > width) {
      lines.push(line.slice(0, width))
      line = line.slice(width)
    }
  }
  if (line.trimEnd()) lines.push(line.trimEnd())
  return lines.join('\n')
}

const NBSP = ' '

// Una palabra de más de 20 caracteres (un correo, una URL) se parte tras «/», «.», «-», «_», «?»,
// «&», «=» y antes de «@»; un tramo de más de 24 sin separadores (ya no es una palabra), cada 20.
function splitWord(word: string) {
  if (word.length <= 20) return [word]
  return word
    .split(/(?<=[/.\-_?&=])|(?=@)/)
    .filter(Boolean)
    .flatMap((part) => (part.length > 24 ? (part.match(/.{1,20}/gu) ?? []) : [part]))
}

// react-pdf solo parte las líneas en los espacios: una palabra más larga que su columna se sale. Si
// hay alguna, el texto se reparte en trozos (por párrafos) que el PDF coloca uno tras otro y pasa a
// la línea siguiente cuando no caben; el espacio va pegado al final del trozo, sin partir, para que
// ninguna línea empiece con él. null si ninguna palabra se parte: el texto va entero, como siempre.
export function flowPieces(text: string) {
  const paragraphs = text.split('\n').map((line) => line.split(' ').filter(Boolean).map(splitWord))
  if (paragraphs.every((words) => words.every((pieces) => pieces.length === 1))) return null
  return paragraphs.map((words) =>
    words.length === 0
      ? [NBSP]
      : words.flatMap((pieces, index) =>
          index < words.length - 1 ? [...pieces.slice(0, -1), pieces.at(-1) + NBSP] : pieces,
        ),
  )
}
