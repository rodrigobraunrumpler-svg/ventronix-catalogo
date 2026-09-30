import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin `globals`, Testing Library no registra su limpieza automática. Los borradores del navegador
// tampoco pasan de una prueba a otra.
afterEach(() => {
  cleanup()
  localStorage.clear()
})
