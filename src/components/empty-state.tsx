import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Lista vacía, sin resultados o con error: qué pasó y qué hacer.
export function EmptyState({
  icon,
  title,
  text,
  action,
  tone = 'neutral',
}: {
  icon: ReactNode
  title: string
  text: string
  action: ReactNode
  tone?: 'neutral' | 'error'
}) {
  return (
    <div className="grid justify-items-center gap-2 border-t px-6 py-16 text-center">
      <span
        className={cn(
          'mb-2 grid size-13 place-items-center rounded-[14px]',
          tone === 'error'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-secondary-foreground',
        )}
      >
        {icon}
      </span>
      <h3 className="text-[17px] font-bold" role={tone === 'error' ? 'alert' : undefined}>
        {title}
      </h3>
      <p className="mb-3 max-w-[360px] text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  )
}
