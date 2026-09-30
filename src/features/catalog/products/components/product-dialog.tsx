'use client'

import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useReturnFocus } from '@/lib/use-return-focus'
import { useCategoryOptions } from '../../categories/hooks'
import type { ProductListItem } from '../../types'
import { useCatalogFilters, useProduct, useProductMutations } from '../hooks'
import { ProductForm } from './product-form'

export type ProductDialogState =
  { mode: 'create' } | { mode: 'edit'; product: ProductListItem } | null

type ProductDialogProps = {
  state: ProductDialogState
  onClose: () => void
  onCreateCategory: () => void
}

// Alta y edición en una ventana centrada, sin salir de la lista (spec §7). Lo escrito queda como
// borrador: cerrar la ventana no lo pierde.
export function ProductDialog({ state, onClose, onCreateCategory }: ProductDialogProps) {
  const editing = state?.mode === 'edit'
  const options = useCategoryOptions()
  const current = useProduct(editing ? state.product.id : null)
  const [{ category: selectedCategory }] = useCatalogFilters()
  const { create, update } = useProductMutations()
  const returnFocus = useReturnFocus(state !== null)

  const categories = options.data ?? []
  const defaultCategoryId = categories.some((c) => c.id === selectedCategory)
    ? selectedCategory
    : null
  const product = editing ? current.data : undefined
  const loading = options.isPending || (editing && current.isPending)
  const failed = options.isError || (editing && current.isError)
  const gone = editing && current.isSuccess && current.data === null

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        {...returnFocus}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[680px]"
      >
        <DialogHeader className="border-b px-6 pt-5 pr-12 pb-4">
          <DialogTitle className="text-lg font-bold">
            {editing ? 'Editar producto' : 'Nuevo producto'}
          </DialogTitle>
          <DialogDescription>
            Si cierras sin guardar, conservamos lo que escribiste.
          </DialogDescription>
        </DialogHeader>

        {state === null ? null : loading ? (
          <p className="px-6 py-5 text-sm text-muted-foreground">Cargando…</p>
        ) : failed ? (
          <p role="alert" className="px-6 py-5 text-sm text-destructive">
            No pudimos cargar los datos. Cierra la ventana e inténtalo de nuevo.
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
            onSaved={(_, { another }) => {
              toast.success(editing ? 'Cambios guardados' : 'Producto creado')
              if (!another) onClose()
            }}
            onCancel={onClose}
            onCreateCategory={onCreateCategory}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
