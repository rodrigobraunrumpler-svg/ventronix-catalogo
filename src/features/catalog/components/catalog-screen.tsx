'use client'

import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ProformaBar } from '@/features/proforma/components/proforma-bar'
import { ProformaDialog } from '@/features/proforma/components/proforma-dialog'
import { ProformaProvider } from '@/features/proforma/store'
import { clearDraft } from '@/lib/drafts'
import { CategoryDialog, type CategoryDialogState } from '../categories/components/category-dialog'
import { CategoryPanel } from '../categories/components/category-panel'
import { DeleteProductDialog } from '../products/components/delete-product-dialog'
import { ProductList } from '../products/components/product-list'
import { ProductDialog, type ProductDialogState } from '../products/components/product-dialog'
import { productDraftKey } from '../products/components/product-form'
import { useProductMutations } from '../products/hooks'
import type { ProductListItem } from '../types'

// «/» lleva al buscador si no se está escribiendo en un campo ni hay una ventana abierta (spec §4.1).
function useSearchShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]',
        )
      ) {
        return
      }
      event.preventDefault()
      document.getElementById('product-search')?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}

// Pantalla única del catálogo (spec §7): categorías y productos sin cambiar de página. La proforma
// se arma aquí mismo (spec de la proforma §4).
export function CatalogScreen() {
  const [productDialog, setProductDialog] = useState<ProductDialogState>(null)
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>(null)
  const [toDelete, setToDelete] = useState<ProductListItem | null>(null)
  const [proformaOpen, setProformaOpen] = useState(false)
  const { remove } = useProductMutations()
  useSearchShortcut()

  async function confirmDelete(product: ProductListItem) {
    const result = await remove(product.id)
    setToDelete(null)
    if (result.ok) {
      clearDraft(productDraftKey(product.id))
      toast.success('Producto eliminado')
    } else toast.error(result.error.message)
  }

  return (
    <ProformaProvider>
      <div className="grid gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-1.5">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
              Productos
            </h1>
            <p className="text-sm text-muted-foreground">
              Tu catálogo y sus categorías, en un mismo lugar.
            </p>
          </div>
          <Button onClick={() => setProductDialog({ mode: 'create' })}>
            <Plus aria-hidden />
            Nuevo producto
          </Button>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <CategoryPanel />
          <ProductList
            onCreate={() => setProductDialog({ mode: 'create' })}
            onEdit={(product) => setProductDialog({ mode: 'edit', product })}
            onDelete={setToDelete}
          />
        </div>

        <ProductDialog
          state={productDialog}
          onClose={() => setProductDialog(null)}
          onCreateCategory={() => setCategoryDialog({ mode: 'create' })}
        />
        <CategoryDialog state={categoryDialog} onClose={() => setCategoryDialog(null)} />
        <DeleteProductDialog
          product={toDelete}
          onConfirm={confirmDelete}
          onClose={() => setToDelete(null)}
        />
        <ProformaBar onComplete={() => setProformaOpen(true)} />
        <ProformaDialog open={proformaOpen} onClose={() => setProformaOpen(false)} />
      </div>
    </ProformaProvider>
  )
}
