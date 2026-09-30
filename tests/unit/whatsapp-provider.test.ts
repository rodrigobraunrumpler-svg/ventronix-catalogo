import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getWhatsAppProvider } from '@/features/whatsapp/provider'

const supabase = {} as never
const key = randomBytes(32).toString('base64')

describe('getWhatsAppProvider', () => {
  it('sin clave en el servidor no hay envío automático', () => {
    expect(getWhatsAppProvider(supabase, {})).toBeNull()
  })

  it('con la clave usa Baileys', () => {
    expect(getWhatsAppProvider(supabase, { WHATSAPP_SESSION_KEY: key })).not.toBeNull()
  })

  it('el de prueba solo fuera de producción', () => {
    const stub = { WHATSAPP_PROVIDER: 'stub' }
    expect(getWhatsAppProvider(supabase, { ...stub, NODE_ENV: 'development' })).not.toBeNull()
    expect(getWhatsAppProvider(supabase, { ...stub, NODE_ENV: 'production' })).toBeNull()
  })
})
