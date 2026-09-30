import { digitsOnly } from '@/lib/peru'

// Alfabeto de los códigos de WhatsApp (Crockford sin 0, O, I ni U): 32 letras y cifras.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTVWXYZ'
export const PAIRING_CODE = /^[1-9A-HJ-NP-TV-Z]{8}$/

// Código para vincular el número (spec de WhatsApp §3). Lo genera la pantalla para mostrarlo al
// instante; el servidor se lo pide a WhatsApp. 256 es múltiplo de 32: todas las letras salen igual.
export function pairingCode(
  random = (size: number) => crypto.getRandomValues(new Uint8Array(size)),
) {
  return Array.from(random(8), (byte) => ALPHABET[byte % 32]).join('')
}

// Número de WhatsApp de un celular de Perú: el 51 delante.
export const whatsappNumber = (phone: string) => `51${digitsOnly(phone)}`
