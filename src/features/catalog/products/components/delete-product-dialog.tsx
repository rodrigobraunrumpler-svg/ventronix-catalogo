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
import type { ProductListItem } from '../../types'

type DeleteProductDialogProps = {
  product: ProductListItem | null
  onConfirm: (product: ProductListItem) => Promise<void>
  onClose: () => void
}

// Confirmación con código y nombre (plan, tarea 5).
export function DeleteProductDialog({ product, onConfirm, onClose }: DeleteProductDialogProps) {
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (!product) return
    setPending(true)
    try {
      await onConfirm(product)
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={product !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará «{product?.name}» ({product?.code}) del catálogo. Esta acción no se puede
            deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={confirm}>
            Eliminar producto
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
