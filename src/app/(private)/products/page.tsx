import type { Metadata } from 'next'
import { CategoryPanel } from '@/features/catalog/categories/components/category-panel'

export const metadata: Metadata = { title: 'Productos' }

// Pantalla única del catálogo (spec §7): la tabla de productos llega en las tareas 5 y 6.
export default function ProductsPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Productos</h1>
        <p className="text-sm text-muted-foreground">
          Tu catálogo y sus categorías, en un mismo lugar.
        </p>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <CategoryPanel />
      </div>
    </div>
  )
}
