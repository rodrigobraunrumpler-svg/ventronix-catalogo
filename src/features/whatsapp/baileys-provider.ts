import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import makeWASocket, {
  DisconnectReason,
  generateMessageIDV2,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  proto,
  type AuthenticationState,
  type WAMessageUpdate,
  type WASocket,
} from 'baileys'
import type { Database } from '@/lib/supabase/database.types'
import { createAuthState } from './auth-state'
import { whatsappNumber } from './format'
import type { LinkResult, SendDocumentResult, WhatsAppProvider } from './provider'
import { openState, sealState } from './session-crypto'
import {
  clearSession,
  lockSession,
  readSession,
  storeLinkedSession,
  storeSessionState,
  unlockSession,
} from './session-store'

type Client = SupabaseClient<Database>
type Socket = Pick<
  WASocket,
  | 'ev'
  | 'waitForConnectionUpdate'
  | 'requestPairingCode'
  | 'onWhatsApp'
  | 'sendMessage'
  | 'logout'
  | 'end'
>
export type MakeSocket = (state: AuthenticationState) => Socket

// Baileys escribe mucho: aquí solo quedan sus errores.
const logger = {
  level: 'error',
  child: () => logger,
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error: (detail: unknown, message?: string) => console.error('[whatsapp]', message ?? '', detail),
}

// El dispositivo vinculado recibe copia de todo lo que llega al número. Estados, difusiones, grupos
// y canales no se procesan (Baileys los rechaza sin descifrarlos): la sesión no crece con sus claves
// y conectar sigue siendo rápido. Los chats uno a uno se procesan como siempre.
export const ignoredChat = (jid: string) =>
  Boolean(isJidBroadcast(jid) || isJidGroup(jid) || isJidNewsletter(jid))

// Solo lo necesario para enviar: sin historial, sin aparecer «en línea» y sin consultas iniciales.
// En el teléfono, Dispositivos vinculados la muestra como «Google Chrome (Proformas Ventronix)»: el
// sistema (browser[0]) es el nombre de la app. Se fija al vincular.
export const socketConfig = (state: AuthenticationState) => ({
  auth: state,
  logger,
  browser: ['Proformas Ventronix', 'Chrome', '1.0.0'] as [string, string, string],
  markOnlineOnConnect: false,
  syncFullHistory: false,
  shouldSyncHistoryMessage: () => false,
  shouldIgnoreJid: ignoredChat,
  fireInitQueries: false,
})

const connect: MakeSocket = (state) => makeWASocket(socketConfig(state))

const statusCode = (error: unknown) =>
  (error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode

// Espera a que el servidor de WhatsApp confirme el mensaje; sin confirmación en `ms`, sigue: el
// mensaje ya salió.
function serverAck(socket: Socket, id: string, ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms)
    function listener(updates: WAMessageUpdate[]) {
      const acked = updates.some(
        ({ key, update }) =>
          key.id === id && (update.status ?? 0) >= proto.WebMessageInfo.Status.SERVER_ACK,
      )
      if (acked) done()
    }
    function done() {
      clearTimeout(timer)
      socket.ev.off('messages.update', listener)
      resolve()
    }
    socket.ev.on('messages.update', listener)
  })
}

const LINK_MS = 150_000
const SEND_MS = 90_000

// La app como dispositivo vinculado del número de la empresa (spec de WhatsApp §4): una conexión
// por operación, con la sesión reservada mientras se usa y guardada cifrada al terminar.
export function baileysWhatsAppProvider(
  supabase: Client,
  key: Buffer,
  makeSocket: MakeSocket = connect,
): WhatsAppProvider {
  // Con otra clave (se cambió WHATSAPP_SESSION_KEY) la sesión guardada ya no se puede abrir.
  function restore(state: string) {
    try {
      return createAuthState(openState(state, key))
    } catch {
      return null
    }
  }

  async function reserved<T>(ms: number, busy: T, run: () => Promise<T>) {
    if (!(await lockSession(supabase, ms))) return busy
    try {
      return await run()
    } finally {
      await unlockSession(supabase)
    }
  }

  return {
    link: (phone, code) =>
      reserved<LinkResult>(LINK_MS, { ok: false, reason: 'busy' }, async () => {
        const auth = createAuthState(null)
        let socket = makeSocket(auth.state)
        try {
          await socket.waitForConnectionUpdate(async ({ qr }) => Boolean(qr), 20_000)
          await socket.requestPairingCode(whatsappNumber(phone), code)
          // El teléfono acepta el código y WhatsApp cierra la conexión para reiniciarla.
          await socket
            .waitForConnectionUpdate(async () => false, 120_000)
            .catch((error) => {
              if (statusCode(error) !== DisconnectReason.restartRequired) throw error
            })
          socket.end(undefined)
          socket = makeSocket(auth.state)
          await socket.waitForConnectionUpdate(
            async ({ connection }) => connection === 'open',
            30_000,
          )
          // Baileys termina de guardar sus claves justo después de abrir.
          await new Promise((resolve) => setTimeout(resolve, 1000))
          await storeLinkedSession(supabase, { phone, state: sealState(auth.serialize(), key) })
          return { ok: true }
        } catch (error) {
          if (statusCode(error) === DisconnectReason.timedOut)
            return { ok: false, reason: 'timeout' }
          console.error('[whatsapp] vincular:', error)
          return { ok: false, reason: 'failed' }
        } finally {
          socket.end(undefined)
        }
      }),

    async sendDocument({ phone, fileName, document, caption }) {
      const session = await readSession(supabase)
      if (!session) return { ok: false, reason: 'not-linked' }
      return reserved<SendDocumentResult>(SEND_MS, { ok: false, reason: 'busy' }, async () => {
        const auth = restore(session.state)
        if (!auth) {
          await clearSession(supabase)
          return { ok: false, reason: 'logged-out' }
        }
        const socket = makeSocket(auth.state)
        let connected = false
        try {
          await socket.waitForConnectionUpdate(
            async ({ connection }) => connection === 'open',
            25_000,
          )
          connected = true
          const [contact] = (await socket.onWhatsApp(whatsappNumber(phone))) ?? []
          if (!contact?.exists) return { ok: false, reason: 'no-whatsapp' }
          const messageId = generateMessageIDV2(auth.state.creds.me?.id)
          const acknowledged = serverAck(socket, messageId, 10_000)
          await socket.sendMessage(
            contact.jid,
            { document, mimetype: 'application/pdf', fileName, caption },
            { messageId },
          )
          await acknowledged
          return { ok: true }
        } catch (error) {
          if (statusCode(error) === DisconnectReason.loggedOut) {
            await clearSession(supabase)
            return { ok: false, reason: 'logged-out' }
          }
          console.error('[whatsapp] enviar:', error)
          return { ok: false, reason: 'failed' }
        } finally {
          socket.end(undefined)
          // Cada envío cambia las claves: sin guardarlas, los siguientes no llegarían.
          if (connected) await storeSessionState(supabase, sealState(auth.serialize(), key))
        }
      })
    },

    async unlink() {
      const session = await readSession(supabase)
      if (session) {
        await reserved(60_000, undefined, async () => {
          const auth = restore(session.state)
          if (!auth) return
          const socket = makeSocket(auth.state)
          try {
            await socket.waitForConnectionUpdate(
              async ({ connection }) => connection === 'open',
              20_000,
            )
            await socket.logout()
          } catch (error) {
            // Ya estaba cerrada desde el teléfono o no hubo conexión: basta con borrarla.
            console.error('[whatsapp] desvincular:', error)
          } finally {
            socket.end(undefined)
          }
        })
      }
      await clearSession(supabase)
    },
  }
}
