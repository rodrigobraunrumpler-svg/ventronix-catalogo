'use client'

import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ProformaControl } from '@/features/proforma/components/proforma-control'
import { useReturnFocus } from '@/lib/use-return-focus'
import { formatInstant } from '../../list-options'
import type { ProductListItem } from '../../types'
import { CategoryBadge, CodeChip, Price } from './product-list'

// Ficha de solo lectura con los datos que ya trae la lista, sin otra consulta: el nombre y la
// descripción completos, que en la tabla se cortan y en el celular no se ven.
export function ProductDetail({
  product,
  onClose,
  onEdit,
}: {
  product: ProductListItem | null
  onClose: () => void
  onEdit: (product: ProductListItem) => void
}) {
  // El último producto se conserva para que la ficha no se vacíe mientras se cierra.
  const [shown, setShown] = useState(product)
  if (product !== null && product !== shown) setShown(product)
  const data = product ?? shown
  const returnFocus = useReturnFocus(product !== null)

  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        {...returnFocus}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        {data ? (
          <>
            <DialogHeader className="gap-2.5 border-b px-6 pt-5 pr-12 pb-4">
              <DialogTitle className="text-lg leading-snug font-bold">{data.name}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <CodeChip code={data.code} />
                  <CategoryBadge product={data} />
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 overflow-y-auto px-6 py-5">
              <div className="grid gap-1">
                <h3 className="text-xs font-semibold text-muted-foreground">Precio unitario</h3>
                <p className="text-lg">
                  <Price value={data.unit_price} />
                </p>
              </div>
              <div className="grid gap-1">
                <h3 className="text-xs font-semibold text-muted-foreground">Descripción</h3>
                <p className="text-[15px] leading-relaxed whitespace-pre-line [overflow-wrap:anywhere]">
                  {data.description ?? 'Sin descripción'}
                </p>
              </div>
              <p className="text-[13px] text-muted-foreground">
                Registrado el {formatInstant(data.created_at)} · Modificado el{' '}
                {formatInstant(data.updated_at)}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4">
              <Button variant="outline" onClick={() => onEdit(data)}>
                <Pencil aria-hidden />
                Editar
              </Button>
              <ProformaControl product={data} />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
