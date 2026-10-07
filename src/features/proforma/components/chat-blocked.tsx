'use client'

import { toast } from 'sonner'
import { whatsappLink } from '../document/format'

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3'

// El navegador no dejó abrir la pestaña del chat; un enlace sí se abre al pulsarlo.
export function toastChatBlocked(phone: string, message: string) {
  toast('Tu navegador bloqueó la pestaña de WhatsApp.', {
    duration: 10_000,
    action: (
      <a
        href={whatsappLink(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        className={`ml-auto shrink-0 ${inlineAction}`}
      >
        Abrir el chat
      </a>
    ),
  })
}
