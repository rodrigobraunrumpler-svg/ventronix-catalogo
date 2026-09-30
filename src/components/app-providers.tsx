'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

let browserQueryClient: QueryClient | undefined

// Un cliente por render de servidor y uno estable en el navegador (guía de Next.js para TanStack Query).
function getQueryClient() {
  if (typeof window === 'undefined') return new QueryClient()
  browserQueryClient ??= new QueryClient()
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
