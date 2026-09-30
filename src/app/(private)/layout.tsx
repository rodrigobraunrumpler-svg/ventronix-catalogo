import type { ReactNode } from 'react'
import { AppShell } from '@/components/app-shell'

// La tarea 3 añade aquí la comprobación de sesión.
export default function PrivateLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
