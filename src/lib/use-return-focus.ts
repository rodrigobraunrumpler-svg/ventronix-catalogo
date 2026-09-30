'use client'

import { useRef } from 'react'

// Los diálogos se abren desde el estado, sin DialogTrigger de Radix, así que Radix no sabe a quién
// devolver el foco al cerrar. Se guarda el elemento enfocado al abrir y se restaura al cerrar.
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      if (opener.current?.isConnected) opener.current.focus()
    },
  }
}
