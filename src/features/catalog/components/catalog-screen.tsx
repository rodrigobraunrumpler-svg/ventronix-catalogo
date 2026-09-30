'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CategoryDialog, type CategoryDialogState } from '../categories/components/category-dialog'
import { CategoryPanel } from '../categories/components/category-panel'
import { DeleteProductDialog } from '../products/components/delete-product-dialog'
import { ProductList } from '../products/components/product-list'
import { ProductSheet, type ProductSheetState } from '../products/components/product-sheet'
import { useProductMutations } from '../products/hooks'
import type { ProductListItem } from '../types'

// Pantalla única del catálogo (spec §7): categorías y productos sin cambiar de página.
export function CatalogScreen() {
  const [productSheet, setProductSheet] = useState<ProductSheetState>(null)
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>(null)
  const [toDelete, setToDelete] = useState<ProductListItem | null>(null)
  const { remove } = useProductMutations()

  async function confirmDelete(product: ProductListItem) {
    const result = await remove(product.id)
    setToDelete(null)
    if (result.ok) toast.success('Producto eliminado')
    else toast.error(result.error.message)
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Tu catálogo y sus categorías, en un mismo lugar.
          </p>
        </div>
        <Button onClick={() => setProductSheet({ mode: 'create' })}>
          <Plus aria-hidden />
          Nuevo producto
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <CategoryPanel />
        <ProductList
          onCreate={() => setProductSheet({ mode: 'create' })}
          onEdit={(product) => setProductSheet({ mode: 'edit', product })}
          onDelete={setToDelete}
        />
      </div>

      <ProductSheet
        state={productSheet}
        onClose={() => setProductSheet(null)}
        onCreateCategory={() => setCategoryDialog({ mode: 'create' })}
      />
      <CategoryDialog state={categoryDialog} onClose={() => setCategoryDialog(null)} />
      <DeleteProductDialog
        product={toDelete}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
