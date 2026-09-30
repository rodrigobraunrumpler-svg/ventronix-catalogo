import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom no implementa la captura del puntero; Sonner la usa al pulsar un aviso (por ejemplo,
// «Deshacer»).
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.hasPointerCapture ??= () => false

// Sin `globals`, Testing Library no registra su limpieza automática. Los borradores del navegador
// tampoco pasan de una prueba a otra.
afterEach(() => {
  cleanup()
  localStorage.clear()
})
