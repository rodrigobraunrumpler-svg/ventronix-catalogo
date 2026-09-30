'use client'

import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCategoryOptions } from '../../categories/hooks'
import type { ProductListItem } from '../../types'
import { useCatalogFilters, useProduct, useProductMutations } from '../hooks'
import { ProductForm } from './product-form'

export type ProductSheetState =
  { mode: 'create' } | { mode: 'edit'; product: ProductListItem } | null

type ProductSheetProps = {
  state: ProductSheetState
  onClose: () => void
  onCreateCategory: () => void
}

// Alta y edición sin salir de la lista (spec §7); el estado del panel no va en la URL.
export function ProductSheet({ state, onClose, onCreateCategory }: ProductSheetProps) {
  const editing = state?.mode === 'edit'
  const options = useCategoryOptions()
  const current = useProduct(editing ? state.product.id : null)
  const [{ category: selectedCategory }] = useCatalogFilters()
  const { create, update } = useProductMutations()

  const categories = options.data ?? []
  const defaultCategoryId = categories.some((c) => c.id === selectedCategory)
    ? selectedCategory
    : null
  const product = editing ? current.data : undefined
  const loading = options.isPending || (editing && current.isPending)
  const failed = options.isError || (editing && current.isError)
  const gone = editing && current.isSuccess && current.data === null

  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[540px]">
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle className="text-lg font-bold">
            {editing ? 'Editar producto' : 'Nuevo producto'}
          </SheetTitle>
          <SheetDescription>
            {editing
              ? 'Actualiza los datos de tu catálogo.'
              : 'Añade los datos que necesitas para trabajar.'}
          </SheetDescription>
        </SheetHeader>

        {state === null ? null : loading ? (
          <p className="px-6 py-5 text-sm text-muted-foreground">Cargando…</p>
        ) : failed ? (
          <p role="alert" className="px-6 py-5 text-sm text-destructive">
            No pudimos cargar los datos. Cierra el panel e inténtalo de nuevo.
          </p>
        ) : gone ? (
          <p role="alert" className="px-6 py-5 text-sm text-destructive">
            El producto ya no existe. Actualiza la lista.
          </p>
        ) : (
          <ProductForm
            key={editing ? state.product.id : 'create'}
            product={product ?? undefined}
            categories={categories}
            defaultCategoryId={defaultCategoryId}
            onSubmit={(values) => (editing ? update(state.product.id, values) : create(values))}
            onSaved={() => {
              toast.success(editing ? 'Cambios guardados' : 'Producto creado')
              onClose()
            }}
            onCancel={onClose}
            onCreateCategory={onCreateCategory}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
