'use client'

import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CategoryListItem } from '../../types'
import { useCategoryMutations } from '../hooks'
import { CategoryForm } from './category-form'

export type CategoryDialogState =
  { mode: 'create' } | { mode: 'rename'; category: CategoryListItem } | null

// Crear o renombrar en un diálogo breve (spec §7); se abre desde la tarjeta o desde el formulario de producto.
export function CategoryDialog({
  state,
  onClose,
}: {
  state: CategoryDialogState
  onClose: () => void
}) {
  const { create, rename } = useCategoryMutations()

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.mode === 'rename' ? 'Renombrar categoría' : 'Nueva categoría'}
          </DialogTitle>
          <DialogDescription>
            Agrupa tus productos para encontrarlos más fácilmente.
          </DialogDescription>
        </DialogHeader>
        {state ? (
          <CategoryForm
            key={state.mode === 'rename' ? state.category.id : 'create'}
            defaultName={state.mode === 'rename' ? state.category.name : undefined}
            onSubmit={(values) =>
              state.mode === 'rename' ? rename(state.category.id, values) : create(values)
            }
            onSaved={() => {
              toast.success(state.mode === 'rename' ? 'Categoría actualizada' : 'Categoría creada')
              onClose()
            }}
            onCancel={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
