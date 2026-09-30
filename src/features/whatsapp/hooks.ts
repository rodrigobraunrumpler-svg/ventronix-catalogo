'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { settle, type ActionResult } from '@/lib/action-result'
import { getWhatsAppStatus, linkWhatsApp, unlinkWhatsApp } from './actions'
import type { WhatsAppStatus } from './schemas'

export const whatsappKeys = { status: ['whatsapp', 'status'] as const }

// Estado del WhatsApp de la empresa (spec de WhatsApp §4). Si no se puede consultar, la proforma
// sigue con el paso 1 (abrir el chat).
export function useWhatsAppStatus(enabled = true) {
  return useQuery({
    queryKey: whatsappKeys.status,
    queryFn: async () => {
      const result = await settle(getWhatsAppStatus())
      if (!result.ok) throw new Error(result.error.message)
      return result.data
    },
    enabled,
  })
}

// Vincular y desvincular dejan el estado nuevo en la caché; refresh lo vuelve a pedir (por ejemplo,
// si un envío descubre que el teléfono cerró la sesión).
export function useWhatsAppLink() {
  const queryClient = useQueryClient()
  const keep = (result: ActionResult<WhatsAppStatus>) => {
    if (result.ok) queryClient.setQueryData(whatsappKeys.status, result.data)
    return result
  }
  return {
    link: async (input: { phone: string; code: string }) => keep(await settle(linkWhatsApp(input))),
    unlink: async () => keep(await settle(unlinkWhatsApp())),
    refresh: () => queryClient.invalidateQueries({ queryKey: whatsappKeys.status }),
  }
}
