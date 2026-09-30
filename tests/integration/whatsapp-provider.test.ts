import { EventEmitter } from 'node:events'
import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthenticationState } from 'baileys'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthState } from '@/features/whatsapp/auth-state'
import { baileysWhatsAppProvider, type MakeSocket } from '@/features/whatsapp/baileys-provider'
import { openState, sealState } from '@/features/whatsapp/session-crypto'
import {
  lockSession,
  readSession,
  storeLinkedSession,
  unlockSession,
} from '@/features/whatsapp/session-store'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, resetWhatsAppSession } from './db'

const password = 'whatsapp-proveedor-123'
const owner = {
  email: 'whatsapp-proveedor@catalogo.test',
  appMetadata: { catalog_access: 'owner' },
}
const key = randomBytes(32)

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  supabase = await signedInClient(owner.email, password)
})

afterAll(async () => {
  await resetWhatsAppSession(db)
  await db.end()
})

beforeEach(async () => {
  await resetWhatsAppSession(db)
})

const closed = (statusCode: number) =>
  Object.assign(new Error('cerrada'), { output: { statusCode } })

type Script = {
  // Cada conexión decide cómo termina su espera: se abre, se cierra con un código o se agota.
  connection?: (attempt: number) => 'open' | number
  exists?: boolean
}

// Socket falso con la parte de Baileys que usa el proveedor.
function fakeWhatsApp(script: Script = {}) {
  const calls = { sockets: 0, pairing: [] as string[], sent: [] as unknown[], loggedOut: 0 }
  const makeSocket: MakeSocket = (state: AuthenticationState) => {
    const attempt = ++calls.sockets
    const ev = new EventEmitter()
    return {
      ev: ev as never,
      async waitForConnectionUpdate(check) {
        const outcome = script.connection?.(attempt) ?? 'open'
        if (outcome !== 'open') throw closed(outcome)
        if (await check({ qr: 'qr' })) return
        if (await check({ connection: 'open' })) return
        throw closed(515) // tras vincular, WhatsApp pide reiniciar
      },
      async requestPairingCode(phone, code) {
        calls.pairing.push(`${phone}:${code}`)
        state.creds.registered = true
        return code!
      },
      async onWhatsApp(...numbers) {
        return numbers.map((number) => ({
          jid: `${number}@s.whatsapp.net`,
          exists: script.exists ?? true,
        }))
      },
      async sendMessage(jid, content, options) {
        calls.sent.push({ jid, content, options })
        await state.keys.set({ session: { [jid]: Buffer.from('clave nueva') } })
        setTimeout(() =>
          ev.emit('messages.update', [{ key: { id: options?.messageId }, update: { status: 2 } }]),
        )
        return { key: { id: options?.messageId } } as never
      },
      async logout() {
        calls.loggedOut++
      },
      end: vi.fn(),
    }
  }
  return { calls, makeSocket }
}

const document = {
  phone: '900000000',
  fileName: 'Proforma-0001.pdf',
  document: Buffer.from('%PDF-1.7'),
  caption: 'Hola, Cliente.',
}

async function linked() {
  const { state, serialize } = createAuthState(null)
  state.creds.registered = true
  await storeLinkedSession(supabase, { phone: '987654321', state: sealState(serialize(), key) })
}

describe('proveedor de WhatsApp con Baileys', () => {
  it('vincula con el código, reconecta como pide WhatsApp y guarda la sesión cifrada', async () => {
    const { calls, makeSocket } = fakeWhatsApp({ connection: () => 'open' })
    const provider = baileysWhatsAppProvider(supabase, key, makeSocket)
    expect(await provider.link('987654321', 'ABCD1234')).toEqual({ ok: true })
    expect(calls.pairing).toEqual(['51987654321:ABCD1234'])
    expect(calls.sockets).toBe(2)
    const session = await readSession(supabase)
    expect(session?.phone).toBe('987654321')
    expect(JSON.parse(openState(session!.state, key)).creds.registered).toBe(true)
    expect(await lockSession(supabase, 1000)).toBe(true)
  })

  it('si el código no se escribe a tiempo, no guarda nada y libera la sesión', async () => {
    const { makeSocket } = fakeWhatsApp({ connection: (attempt) => (attempt === 1 ? 408 : 'open') })
    const provider = baileysWhatsAppProvider(supabase, key, makeSocket)
    expect(await provider.link('987654321', 'ABCD1234')).toEqual({ ok: false, reason: 'timeout' })
    expect(await readSession(supabase)).toBeNull()
    expect(await lockSession(supabase, 1000)).toBe(true)
  })

  it('envía el PDF con su nombre y el mensaje, y guarda las claves nuevas', async () => {
    await linked()
    const { calls, makeSocket } = fakeWhatsApp()
    const provider = baileysWhatsAppProvider(supabase, key, makeSocket)
    expect(await provider.sendDocument(document)).toEqual({ ok: true })
    expect(calls.sent).toEqual([
      expect.objectContaining({
        jid: '51900000000@s.whatsapp.net',
        content: {
          document: document.document,
          mimetype: 'application/pdf',
          fileName: 'Proforma-0001.pdf',
          caption: 'Hola, Cliente.',
        },
      }),
    ])
    const state = createAuthState(openState((await readSession(supabase))!.state, key)).state
    expect(await state.keys.get('session', ['51900000000@s.whatsapp.net'])).toEqual({
      '51900000000@s.whatsapp.net': Buffer.from('clave nueva'),
    })
    expect(await lockSession(supabase, 1000)).toBe(true)
  })

  it('sin vincular no se conecta', async () => {
    const { calls, makeSocket } = fakeWhatsApp()
    const provider = baileysWhatsAppProvider(supabase, key, makeSocket)
    expect(await provider.sendDocument(document)).toEqual({ ok: false, reason: 'not-linked' })
    expect(calls.sockets).toBe(0)
  })

  it('con otra operación en curso, espera su turno', async () => {
    await linked()
    await lockSession(supabase, 60_000)
    const provider = baileysWhatsAppProvider(supabase, key, fakeWhatsApp().makeSocket)
    expect(await provider.sendDocument(document)).toEqual({ ok: false, reason: 'busy' })
    await unlockSession(supabase)
  })

  it('si el cliente no tiene WhatsApp, lo dice', async () => {
    await linked()
    const { calls, makeSocket } = fakeWhatsApp({ exists: false })
    const provider = baileysWhatsAppProvider(supabase, key, makeSocket)
    expect(await provider.sendDocument(document)).toEqual({ ok: false, reason: 'no-whatsapp' })
    expect(calls.sent).toEqual([])
  })

  it('si el teléfono cerró la sesión, la borra', async () => {
    await linked()
    const { makeSocket } = fakeWhatsApp({ connection: () => 401 })
    const provider = baileysWhatsAppProvider(supabase, key, makeSocket)
    expect(await provider.sendDocument(document)).toEqual({ ok: false, reason: 'logged-out' })
    expect(await readSession(supabase)).toBeNull()
  })

  it('desvincular cierra la sesión en WhatsApp y la borra', async () => {
    await linked()
    const { calls, makeSocket } = fakeWhatsApp()
    await baileysWhatsAppProvider(supabase, key, makeSocket).unlink()
    expect(calls.loggedOut).toBe(1)
    expect(await readSession(supabase)).toBeNull()
  })
})
