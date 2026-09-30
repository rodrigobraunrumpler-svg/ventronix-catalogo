'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { CategoryListItem } from '../../types'

type DeleteCategoryDialogProps = {
  category: CategoryListItem | null
  onConfirm: (category: CategoryListItem) => Promise<void>
  onClose: () => void
}

export function DeleteCategoryDialog({ category, onConfirm, onClose }: DeleteCategoryDialogProps) {
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (!category) return
    setPending(true)
    try {
      await onConfirm(category)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={category !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar categoría</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará la categoría «{category?.name}». Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            Eliminar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
