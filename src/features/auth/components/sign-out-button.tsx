'use client'

import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { signOut } from '../actions'

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await signOut()
      queryClient.clear()
      router.replace('/login')
      router.refresh()
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? 'icon' : 'sm'}
      disabled={pending}
      onClick={handleClick}
      aria-label={compact ? 'Cerrar sesión' : undefined}
      title={compact ? 'Cerrar sesión' : undefined}
      className={compact ? undefined : 'justify-start text-muted-foreground'}
    >
      <LogOut aria-hidden />
      {compact ? null : 'Cerrar sesión'}
    </Button>
  )
}
