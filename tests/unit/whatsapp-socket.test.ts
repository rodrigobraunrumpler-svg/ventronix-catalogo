import { Browsers } from 'baileys'
import { describe, expect, it } from 'vitest'
import { createAuthState } from '@/features/whatsapp/auth-state'
import { ignoredChat, socketConfig } from '@/features/whatsapp/baileys-provider'

describe('ignoredChat', () => {
  it('no procesa estados, difusiones, grupos ni canales: la sesión no crece con sus claves', () => {
    expect(ignoredChat('status@broadcast')).toBe(true)
    expect(ignoredChat('1234567890@broadcast')).toBe(true)
    expect(ignoredChat('120363000000000000@g.us')).toBe(true)
    expect(ignoredChat('120363000000000000@newsletter')).toBe(true)
  })

  it('los chats uno a uno se procesan como siempre', () => {
    expect(ignoredChat('51987654321@s.whatsapp.net')).toBe(false)
    expect(ignoredChat('123456789012345@lid')).toBe(false)
  })
})

describe('socketConfig', () => {
  it('usa el nombre estándar: WhatsApp rechaza uno propio al vincular con código', () => {
    expect(socketConfig(createAuthState(null).state).browser).toEqual(Browsers.macOS('Chrome'))
  })

  it('solo lo necesario para enviar: sin historial, sin «en línea» y sin chats de grupo', () => {
    expect(socketConfig(createAuthState(null).state)).toMatchObject({
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldIgnoreJid: ignoredChat,
      fireInitQueries: false,
    })
  })
})
