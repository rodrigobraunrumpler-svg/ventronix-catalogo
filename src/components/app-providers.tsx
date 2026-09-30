'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

let browserQueryClient: QueryClient | undefined

// El catálogo solo cambia desde esta app y cada cambio refresca lo afectado: los datos valen 5
// minutos sin volver a pedirlos. Pasado ese tiempo, volver a la pestaña trae los cambios hechos en
// otro dispositivo.
function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } } })
}

// Un cliente por render de servidor y uno estable en el navegador (guía de Next.js para TanStack Query).
function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <NuqsAdapter>{children}</NuqsAdapter>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  )
}
