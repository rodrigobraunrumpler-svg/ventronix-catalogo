import type { Metadata } from 'next'
import { ImportScreen } from '@/features/catalog/import/components/import-screen'
import { getCatalogStats } from '@/features/catalog/products/queries'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Carga masiva' }

// Revisar e importar 5 000 filas tarda segundos; el margen cubre una base lenta.
export const maxDuration = 60

export default async function ImportPage() {
  const supabase = await createClient()
  // Con el catálogo vacío se propone cargar productos nuevos; si no, actualizarlos (spec §6.2).
  const hasProducts = await getCatalogStats(supabase)
    .then((stats) => stats.products > 0)
    .catch(() => true)
  return <ImportScreen hasProducts={hasProducts} />
}
