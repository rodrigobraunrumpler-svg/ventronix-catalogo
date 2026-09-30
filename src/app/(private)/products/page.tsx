import type { Metadata } from 'next'
import { CatalogScreen } from '@/features/catalog/components/catalog-screen'

export const metadata: Metadata = { title: 'Productos' }

// Enviar una proforma por WhatsApp conecta, envía y guarda la sesión (spec de WhatsApp §3).
export const maxDuration = 60

export default function ProductsPage() {
  return <CatalogScreen />
}
