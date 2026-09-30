'use client'

import { Package } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Un único destino por ahora (spec §7); Proformas se añadirá cuando exista.
const navItems = [{ href: '/products', label: 'Productos', icon: Package }]

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <span className="grid size-[38px] place-items-center rounded-[11px] bg-sidebar-primary text-sidebar-primary-foreground">
        <Package className="size-5" aria-hidden />
      </span>
      <span className="grid leading-tight">
        <span className="text-[17px] font-extrabold tracking-[-0.02em] text-foreground">
          Catálogo
        </span>
        <span className="text-xs font-medium text-muted-foreground">Gestión comercial</span>
      </span>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-4 py-3 font-semibold text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Ir al contenido
      </a>
      <aside className="hidden border-r border-sidebar-border bg-sidebar px-3.5 py-5 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-8">
        <Brand />
        <nav aria-label="Navegación principal" className="grid gap-1">
          <p className="px-3 pb-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Menú
          </p>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[42px] items-center gap-3 rounded-[10px] px-3 font-semibold transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'hover:bg-sidebar-accent/60',
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 items-center border-b bg-card px-4 lg:hidden">
          <Brand />
        </header>
        <main id="main" tabIndex={-1} className="px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
