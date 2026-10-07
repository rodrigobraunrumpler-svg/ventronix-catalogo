'use client'

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useQueryStates } from 'nuqs'
import { useState } from 'react'
import { toast } from 'sonner'
import { resolveDateRange } from '@/features/catalog/list-options'
import { useDebouncedValue } from '@/features/catalog/products/hooks'
import { settle } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/client'
import { base64ToFile, downloadFile, newTab, openFile, TAB_BLOCKED } from '../document/files'
import { getProformaDocument } from './actions'
import {
  findClient,
  listProformas,
  type ClientMatch,
  type HistoryQuery,
  type ProformaRow,
} from './queries'
import { historyParsers } from './search-params'

// Bajo «proformas»: generar una proforma refresca la lista, las cifras y los PDF (spec §6).
export const historyKeys = {
  all: ['proformas'] as const,
  list: (query: HistoryQuery) => ['proformas', 'list', query] as const,
  document: (id: string) => ['proformas', 'document', id] as const,
  client: (document: string) => ['proformas', 'client', document] as const,
}

// El PDF de una proforma guardada vale un minuto: «Ver PDF», «Descargar PDF» y «Reenviar» lo
// comparten y un doble clic no lo genera dos veces (plan, decisión 22).
export const DOCUMENT_STALE_MS = 60_000

// Lanza el error del servidor: TanStack Query lo guarda como el error de la consulta.
export async function fetchStoredDocument(id: string) {
  const result = await settle(getProformaDocument(id))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

// Búsqueda, fechas y página viven en la URL; cada filtro añade una entrada al historial del
// navegador para que atrás y adelante los restauren.
export function useHistoryFilters() {
  return useQueryStates(historyParsers, { history: 'push' })
}

// La búsqueda espera 300 ms (spec §4.2); las fechas viajan ya resueltas en días de Lima.
export function useProformaHistory() {
  const [filters] = useHistoryFilters()
  const search = useDebouncedValue(filters.search, 300)
  const range = resolveDateRange(filters)
  const query: HistoryQuery = {
    search,
    page: filters.page,
    dateFrom: range?.from ?? null,
    dateTo: range?.to ?? null,
  }
  return {
    filters,
    query: useQuery({
      queryKey: historyKeys.list(query),
      queryFn: ({ signal }) => listProformas(createClient(), query, signal),
      placeholderData: keepPreviousData,
    }),
  }
}

// «Ver PDF» y «Descargar PDF» desde la copia (spec §6). La pestaña se abre al pulsar, antes de
// esperar al servidor, para que el navegador no la bloquee.
export function useStoredDocument() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)

  async function fetchFile(row: ProformaRow) {
    setPending(row.id)
    try {
      const stored = await queryClient.fetchQuery({
        queryKey: historyKeys.document(row.id),
        queryFn: () => fetchStoredDocument(row.id),
        staleTime: DOCUMENT_STALE_MS,
        retry: false,
      })
      return base64ToFile(stored.base64, stored.fileName)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos preparar el PDF.')
      return null
    } finally {
      setPending(null)
    }
  }

  return {
    pending,
    async view(row: ProformaRow) {
      const tab = newTab()
      const file = await fetchFile(row)
      if (!file) {
        tab?.close()
        return
      }
      if (!openFile(file, tab)) toast(TAB_BLOCKED)
    },
    async download(row: ProformaRow) {
      const file = await fetchFile(row)
      if (file) downloadFile(file)
    },
  }
}

// Al completar un RUC o DNI (spec §4.3). Sin respuesta, la proforma sigue sin completar.
export function useClientLookup() {
  const queryClient = useQueryClient()
  return (document: string): Promise<ClientMatch | null> =>
    queryClient
      .fetchQuery({
        queryKey: historyKeys.client(document),
        queryFn: () => findClient(createClient(), document),
        staleTime: 0,
      })
      .catch(() => null)
}
