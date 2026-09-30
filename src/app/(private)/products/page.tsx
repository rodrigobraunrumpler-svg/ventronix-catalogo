import type { Metadata } from 'next'
import { CatalogScreen } from '@/features/catalog/components/catalog-screen'

export const metadata: Metadata = { title: 'Productos' }

export default function ProductsPage() {
  return <CatalogScreen />
}
