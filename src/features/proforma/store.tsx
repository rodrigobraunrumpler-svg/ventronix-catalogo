'use client'

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { toast } from 'sonner'
import { readDraft, saveDraft } from '@/lib/drafts'
import {
  draftSchema,
  EMPTY_DRAFT,
  PROFORMA_DRAFT_KEY,
  removeLine,
  restoreLine,
  type ProformaDraft,
} from './draft'

// «Deshacer» dura 5 segundos (spec §4.2).
export const UNDO_MS = 5000

type Store = {
  subscribe: (listener: () => void) => () => void
  getDraft: () => ProformaDraft
  getMessage: () => string
  // Devuelve la proforma ya guardada, para anunciar lo que de verdad quedó.
  update: (change: (draft: ProformaDraft) => ProformaDraft) => ProformaDraft
  announce: (message: string) => void
}

// Un almacén por pantalla: al volver a Productos, o tras cerrar sesión (que borra los borradores),
// se vuelve a leer el navegador. En el servidor y al hidratar se usa la proforma vacía.
function createStore(): Store {
  let draft: ProformaDraft | null = null
  let message = ''
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  const getDraft = () => (draft ??= readDraft(PROFORMA_DRAFT_KEY, draftSchema) ?? EMPTY_DRAFT)
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getDraft,
    getMessage: () => message,
    update(change) {
      draft = { ...change(getDraft()), updatedAt: new Date().toISOString() }
      saveDraft(PROFORMA_DRAFT_KEY, draft)
      notify()
      return draft
    },
    announce(text) {
      message = text
      notify()
    },
  }
}

const StoreContext = createContext<Store | null>(null)
const serverDraft = () => EMPTY_DRAFT
const serverMessage = () => ''

export function ProformaProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore)
  const message = useSyncExternalStore(store.subscribe, store.getMessage, serverMessage)
  return (
    <StoreContext value={store}>
      {children}
      {/* Aviso para lectores de pantalla al añadir o quitar productos (spec §9). */}
      <p role="status" className="sr-only">
        {message}
      </p>
    </StoreContext>
  )
}

function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('Falta <ProformaProvider>.')
  return store
}

export function useProforma() {
  const store = useStore()
  const draft = useSyncExternalStore(store.subscribe, store.getDraft, serverDraft)
  return { draft, update: store.update, announce: store.announce }
}

// Quitar una línea no pide confirmación: avisa con «Deshacer» (spec §4.2).
export function useRemoveLine() {
  const { draft, update } = useProforma()
  return (productId: string) => {
    const index = draft.lines.findIndex((line) => line.productId === productId)
    if (index === -1) return
    const line = draft.lines[index]
    update((current) => removeLine(current, productId))
    toast(`Quitaste ${line.name}`, {
      duration: UNDO_MS,
      action: {
        label: 'Deshacer',
        onClick: () => update((current) => restoreLine(current, line, index)),
      },
    })
  }
}

// «Vaciar» también se puede deshacer; recupera la proforma tal como estaba.
export function useEmptyProforma() {
  const { draft, update } = useProforma()
  return () => {
    const previous = draft
    update(() => EMPTY_DRAFT)
    toast('Vaciaste la proforma', {
      duration: UNDO_MS,
      action: { label: 'Deshacer', onClick: () => update(() => previous) },
    })
  }
}
