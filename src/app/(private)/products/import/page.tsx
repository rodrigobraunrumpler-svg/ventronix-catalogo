import type { Metadata } from 'next'
import { ImportScreen } from '@/features/catalog/import/components/import-screen'

export const metadata: Metadata = { title: 'Carga masiva' }

// Revisar e importar 5 000 filas tarda segundos; el margen cubre una base lenta.
export const maxDuration = 60

export default function ImportPage() {
  return <ImportScreen />
}
