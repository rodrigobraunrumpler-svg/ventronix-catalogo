import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach } from 'vitest'

// jsdom no implementa la captura del puntero; Sonner la usa al pulsar un aviso (por ejemplo,
// «Deshacer»).
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.hasPointerCapture ??= () => false

// Radix (Popover, DropdownMenu) mide el contenido con ResizeObserver, que jsdom no trae.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Sin `globals`, Testing Library no registra su limpieza automática. Los borradores del navegador
// tampoco pasan de una prueba a otra.
afterEach(() => {
  cleanup()
  localStorage.clear()
})

// Sonner retira un aviso cerrado 200 ms después y no cancela ese temporizador al desmontarse. Se
// espera antes de cerrar jsdom: si saltara sin `window`, Vitest lo contaría como error.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 250)))
