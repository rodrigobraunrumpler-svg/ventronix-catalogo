import type { Metadata } from 'next'
import { ProformasScreen } from '@/features/proforma/history/components/proformas-screen'

export const metadata: Metadata = { title: 'Proformas' }

// Enviar o reenviar por WhatsApp conecta, envía y guarda la sesión (spec de WhatsApp §3).
export const maxDuration = 60

export default function ProformasPage() {
  return <ProformasScreen />
}
