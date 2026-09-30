import type { z } from 'zod'

// Borradores de formularios en este navegador: cerrar una ventana o recargar no pierde lo escrito.
// Son pocos datos, así que basta localStorage, sin dependencias. Si el navegador no deja guardar
// (modo privado, sin espacio), el formulario funciona igual, solo que sin borrador.
const PREFIX = 'catalogo:borrador:'

export function readDraft<T>(key: string, schema: z.ZodType<T>): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return null
    const parsed = schema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Sin almacenamiento disponible: se sigue sin borrador.
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // Sin almacenamiento disponible: no hay nada que borrar.
  }
}

// Al cerrar sesión no quedan datos del catálogo en el navegador.
export function clearAllDrafts() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Sin almacenamiento disponible: no hay nada que borrar.
  }
}
