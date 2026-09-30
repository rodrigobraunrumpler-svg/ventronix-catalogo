import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Productos' }

// La tarjeta Categorías (tarea 4) y la tabla (tareas 5 y 6) se añaden debajo de la cabecera.
export default function ProductsPage() {
  return (
    <div className="grid gap-1.5">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Productos</h1>
      <p className="text-sm text-muted-foreground">
        Tu catálogo y sus categorías, en un mismo lugar.
      </p>
    </div>
  )
}
