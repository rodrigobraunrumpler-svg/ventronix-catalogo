import { describe, expect, it } from 'vitest'
import { createAuthState } from '@/features/whatsapp/auth-state'

describe('estado de Baileys', () => {
  it('una sesión nueva no está registrada y guarda, lee y borra claves', async () => {
    const { state } = createAuthState(null)
    expect(state.creds.registered).toBe(false)
    const preKey = { public: Buffer.from([1, 2]), private: Buffer.from([3, 4]) }
    await state.keys.set({ 'pre-key': { '1': preKey } })
    expect(await state.keys.get('pre-key', ['1', '2'])).toEqual({ '1': preKey })
    await state.keys.set({ 'pre-key': { '1': null } })
    expect(await state.keys.get('pre-key', ['1'])).toEqual({})
  })

  it('lo guardado se recupera igual, con sus Buffers', async () => {
    const auth = createAuthState(null)
    await auth.state.keys.set({ session: { 'a.0': Buffer.from('hola') } })
    const again = createAuthState(auth.serialize())
    expect(again.state.creds.noiseKey.private).toEqual(auth.state.creds.noiseKey.private)
    expect(Buffer.isBuffer(again.state.creds.noiseKey.private)).toBe(true)
    expect(await again.state.keys.get('session', ['a.0'])).toEqual({ 'a.0': Buffer.from('hola') })
  })

  it('las claves de sincronización vuelven como AppStateSyncKeyData', async () => {
    const auth = createAuthState(null)
    await auth.state.keys.set({ 'app-state-sync-key': { k: { keyData: Buffer.from([9]) } } })
    const again = createAuthState(auth.serialize())
    const { k } = await again.state.keys.get('app-state-sync-key', ['k'])
    expect(k.constructor.name).toBe('AppStateSyncKeyData')
    expect(Buffer.from(k.keyData!)).toEqual(Buffer.from([9]))
  })
})
