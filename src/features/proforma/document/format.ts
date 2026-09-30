import { digitsOnly } from '@/lib/peru'

const LIMA = 'America/Lima'
const pad = (n: number) => String(n).padStart(2, '0')
const dmy = (date: Date) =>
  `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`

// Día en Lima de un instante (UTC−5, sin horario de verano).
function limaDay(instant: Date) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(instant)
    .split('-')
    .map(Number)
  return { year, month, day }
}

// Fecha de la proforma y «Válida hasta» (spec del documento §3), en días de Lima.
export function documentDates(issuedAt: Date, validityDays: number) {
  const { year, month, day } = limaDay(issuedAt)
  return {
    date: dmy(new Date(Date.UTC(year, month - 1, day))),
    validUntil: dmy(new Date(Date.UTC(year, month - 1, day + validityDays))),
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

type WhatsappMessageInput = {
  clientName: string
  numberLabel: string
  total: string
  validUntil: string
  sender: string
}

// Mensaje ya escrito (spec del documento §7). Sin doble punto si el nombre termina en «S.A.C.».
export function whatsappMessage({
  clientName,
  numberLabel,
  total,
  validUntil,
  sender,
}: WhatsappMessageInput) {
  const name = clientName.trim().replace(/\.+$/, '')
  return `Hola, ${name}. Le envío la proforma ${numberLabel} por ${total}, válida hasta el ${validUntil}. Quedamos atentos. — ${sender}`
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
