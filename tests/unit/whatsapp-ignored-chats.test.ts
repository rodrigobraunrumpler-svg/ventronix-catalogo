import { describe, expect, it } from 'vitest'
import { ignoredChat } from '@/features/whatsapp/baileys-provider'

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
