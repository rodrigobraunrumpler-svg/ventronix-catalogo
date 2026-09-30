import type { Metadata } from 'next'
import { CompanyScreen } from '@/features/company/components/company-screen'

export const metadata: Metadata = { title: 'Empresa' }

export default function CompanyPage() {
  return <CompanyScreen />
}
