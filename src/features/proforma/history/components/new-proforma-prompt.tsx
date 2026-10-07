'use client'

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

// «Nueva proforma» con una sin generar o una corrección a medias (spec de productos libres §4.3):
// se elige, nada se borra solo. El foco empieza en «Seguir con la actual», la opción que no pierde
// nada.
export function NewProformaPrompt({
  open,
  number = null,
  summary,
  onKeep,
  onStartNew,
  onClose,
  onClosed,
}: {
  open: boolean
  // «N° 0003» si es una corrección a medias de una proforma guardada.
  number?: string | null
  // «3 productos · S/ 1,234.00»
  summary: string
  onKeep: () => void
  onStartNew: () => void
  onClose: () => void
  // Ya cerrada, tras su animación: la proforma se abre entonces y nunca hay dos ventanas a la vez
  // (con las dos, un Escape a destiempo no cerraba ninguna).
  onClosed?: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent onCloseAutoFocus={() => onClosed?.()}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Empezar una proforma nueva?</AlertDialogTitle>
          <AlertDialogDescription>
            {number
              ? `Tienes cambios sin guardar en la ${number} (${summary}). Si empiezas otra, se descartan; lo guardado sigue en el historial.`
              : `Tienes una proforma sin generar (${summary}). Si empiezas otra, esa se borra.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeep}>Seguir con la actual</AlertDialogCancel>
          <Button variant="destructive" onClick={onStartNew}>
            Empezar una nueva
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
