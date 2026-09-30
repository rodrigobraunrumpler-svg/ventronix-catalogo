'use client'

import { useLayoutEffect, useRef } from 'react'

// Los diálogos se abren desde el estado, sin DialogTrigger de Radix, así que Radix no sabe a quién
// devolver el foco al cerrar. Se guarda el elemento enfocado al abrir y se restaura al cerrar. El
// efecto de layout corre antes de que el contenido mueva el foco (por ejemplo, a su primer campo).
// Si el que abrió ya no existe (la barra de la proforma tras «Nueva proforma»), va a fallbackId.
export function useReturnFocus(open: boolean, fallbackId?: string) {
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
  }, [open])
  return {
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      if (opener.current?.isConnected) opener.current.focus()
      else if (fallbackId) document.getElementById(fallbackId)?.focus()
    },
  }
}
