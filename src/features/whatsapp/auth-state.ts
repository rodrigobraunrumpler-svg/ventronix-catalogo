import 'server-only'
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from 'baileys'

type Stored = { creds: AuthenticationCreds; keys: Record<string, unknown> }

// Estado de Baileys en memoria mientras dura una operación. Baileys cambia las credenciales en su
// sitio y las claves con keys.set; serialize() lo deja todo listo para cifrarlo y guardarlo.
export function createAuthState(serialized: string | null) {
  const { creds, keys }: Stored = serialized
    ? JSON.parse(serialized, BufferJSON.reviver)
    : { creds: initAuthCreds(), keys: {} }
  const state: AuthenticationState = {
    creds,
    keys: {
      async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
        const data: { [id: string]: SignalDataTypeMap[T] } = {}
        for (const id of ids) {
          const value = keys[`${type}-${id}`]
          if (!value) continue
          // Como en useMultiFileAuthState: estas claves vuelven a ser su tipo de protobuf.
          data[id] = (
            type === 'app-state-sync-key'
              ? proto.Message.AppStateSyncKeyData.fromObject(value as object)
              : value
          ) as SignalDataTypeMap[T]
        }
        return data
      },
      async set(data) {
        for (const [type, entries] of Object.entries(data)) {
          for (const [id, value] of Object.entries(entries ?? {})) {
            if (value) keys[`${type}-${id}`] = value
            else delete keys[`${type}-${id}`]
          }
        }
      },
    },
  }
  return { state, serialize: () => JSON.stringify({ creds, keys }, BufferJSON.replacer) }
}
