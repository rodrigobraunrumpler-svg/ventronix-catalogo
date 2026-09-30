'use client'

import { Building2, Package } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Brand } from '@/components/brand'
import { SignOutButton } from '@/features/auth/components/sign-out-button'
import { cn } from '@/lib/utils'

// Productos (con la proforma) y los datos de la empresa que salen en ella.
const navItems = [
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/company', label: 'Empresa', icon: Building2 },
]

function NavLinks({ pathname, compact = false }: { pathname: string; compact?: boolean }) {
  return navItems.map(({ href, label, icon: Icon }) => {
    const active = pathname.startsWith(href)
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-[10px] px-3 font-semibold transition-colors',
          compact ? 'h-9 text-sm' : 'h-10.5',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-sidebar-accent/60',
        )}
      >
        <Icon className="size-4.5" aria-hidden />
        {label}
      </Link>
    )
  })
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-4 py-3 font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Ir al contenido
      </a>
      <aside className="hidden border-r border-sidebar-border bg-sidebar px-3.5 py-5 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-8">
        <Brand />
        <nav aria-label="Navegación principal" className="grid gap-1">
          <p className="px-3 pb-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Menú
          </p>
          <NavLinks pathname={pathname} />
        </nav>
        <div className="mt-auto grid gap-1 rounded-xl border bg-background/60 p-2">
          <p className="truncate px-2 pt-1 text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <SignOutButton />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-card px-4 lg:hidden">
          <Brand />
          <SignOutButton compact />
        </header>
        <nav
          aria-label="Navegación principal"
          className="flex gap-1 border-b bg-card px-4 py-2 lg:hidden"
        >
          <NavLinks pathname={pathname} compact />
        </nav>
        <main id="main" tabIndex={-1} className="px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
