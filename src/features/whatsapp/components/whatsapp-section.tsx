'use client'

import { useWhatsAppLink, useWhatsAppStatus } from '../hooks'
import { WhatsAppCard } from './whatsapp-card'

export function WhatsAppSection() {
  const status = useWhatsAppStatus()
  const { link, unlink } = useWhatsAppLink()
  return (
    <WhatsAppCard status={status.data} error={status.isError} onLink={link} onUnlink={unlink} />
  )
}
