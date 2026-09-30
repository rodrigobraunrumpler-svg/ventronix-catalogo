// Importe en letras del documento (spec del documento §5): mayúsculas con tildes, hasta el tope de
// la proforma (menos de S/ 10 000 000 000).
const UNITS = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
]
const TENS = [
  '',
  '',
  '',
  'TREINTA',
  'CUARENTA',
  'CINCUENTA',
  'SESENTA',
  'SETENTA',
  'OCHENTA',
  'NOVENTA',
]
const HUNDREDS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
]

// 1 a 999.
function hundreds(n: number) {
  if (n === 100) return 'CIEN'
  const words = n >= 100 ? [HUNDREDS[Math.floor(n / 100)]] : []
  const rest = n % 100
  if (rest >= 30) {
    const unit = rest % 10
    words.push(unit ? `${TENS[Math.floor(rest / 10)]} Y ${UNITS[unit]}` : TENS[rest / 10])
  } else if (rest > 0) {
    words.push(UNITS[rest])
  }
  return words.join(' ')
}

// Delante de MIL o de MILLONES: «UN», «VEINTIÚN», «TREINTA Y UN».
const shortened = (words: string) => words.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN')

// 1 a 999 999.
function thousands(n: number) {
  const high = Math.floor(n / 1000)
  const low = n % 1000
  const words = high === 0 ? [] : high === 1 ? ['MIL'] : [`${shortened(hundreds(high))} MIL`]
  if (low) words.push(hundreds(low))
  return words.join(' ')
}

function integerWords(n: number) {
  if (n === 0) return 'CERO'
  const millions = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  const words =
    millions === 0
      ? []
      : millions === 1
        ? ['UN MILLÓN']
        : [`${shortened(thousands(millions))} MILLONES`]
  if (rest) words.push(thousands(rest))
  return words.join(' ')
}

export function amountInWords(cents: bigint) {
  const soles = Number(cents / BigInt(100))
  const fraction = String(cents % BigInt(100)).padStart(2, '0')
  return `SON: ${integerWords(soles)} CON ${fraction}/100 SOLES`
}
