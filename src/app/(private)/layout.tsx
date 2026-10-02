import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/app-shell'
import { requireOwner, UnauthorizedError, type AuthorizedContext } from '@/lib/auth/require-owner'
import { SIDEBAR_COOKIE } from '@/lib/sidebar'

// Además del proxy: la autorización se comprueba aquí y en cada Action (spec §5).
export default async function PrivateLayout({ children }: { children: ReactNode }) {
  let owner: AuthorizedContext
  try {
    owner = await requireOwner()
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect('/login')
    throw error
  }

  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed'
  return (
    <AppShell email={owner.user.email ?? ''} collapsed={collapsed}>
      {children}
    </AppShell>
  )
}
