import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// La sesión de WhatsApp se guarda cifrada (AES-256-GCM) con una clave que solo tiene el servidor
// (spec de WhatsApp §6). Formato: base64 de iv (12 bytes) + etiqueta (16) + contenido.
export function sealState(plain: string, key: Buffer) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const content = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64')
}

// Falla si la clave no es la misma o el contenido cambió.
export function openState(sealed: string, key: Buffer) {
  const bytes = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
  decipher.setAuthTag(bytes.subarray(12, 28))
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
}

// null sin clave (el envío automático queda apagado); una clave mal escrita es un error de
// configuración y se dice.
export function sessionKey(env: Record<string, string | undefined> = process.env) {
  const value = env.WHATSAPP_SESSION_KEY?.trim()
  if (!value) return null
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('WHATSAPP_SESSION_KEY debe ser de 32 bytes en base64.')
  return key
}
