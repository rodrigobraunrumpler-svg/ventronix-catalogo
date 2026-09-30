import type { Metadata } from 'next'
import { CompanyScreen } from '@/features/company/components/company-screen'

export const metadata: Metadata = { title: 'Empresa' }

// Vincular WhatsApp espera hasta 2 minutos a que se escriba el código en el teléfono.
export const maxDuration = 150

export default function CompanyPage() {
  return <CompanyScreen />
}
