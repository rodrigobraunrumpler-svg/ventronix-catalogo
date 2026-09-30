'use client'

import { Info, Package, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { useQueryState } from 'nuqs'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { CategoryListItem } from '../../types'
import { useCategories, useCategoryMutations } from '../hooks'
import { categoryColor } from '../theme'
import { CategoryForm } from './category-form'
import { DeleteCategoryDialog } from './delete-category-dialog'

type FormState = { mode: 'create' } | { mode: 'rename'; category: CategoryListItem } | null

function inUseMessage({ name, product_count: count }: CategoryListItem) {
  return count === 1
    ? `«${name}» tiene 1 producto. Muévelo o elimínalo primero.`
    : `«${name}» tiene ${count} productos. Muévelos o elimínalos primero.`
}

function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2 font-mono text-xs text-muted-foreground">
      {children}
    </span>
  )
}

export function CategoryPanel() {
  const { data: categories, isPending, isError, refetch } = useCategories()
  const { create, rename, remove } = useCategoryMutations()
  const [selectedId, setSelectedId] = useQueryState('category')
  const [form, setForm] = useState<FormState>(null)
  const [toDelete, setToDelete] = useState<CategoryListItem | null>(null)

  const activeId = categories?.some((category) => category.id === selectedId) ? selectedId : null
  const total = categories?.reduce((sum, category) => sum + category.product_count, 0) ?? 0

  function askDelete(category: CategoryListItem) {
    if (category.product_count > 0) toast.warning(inUseMessage(category))
    else setToDelete(category)
  }

  async function confirmDelete(category: CategoryListItem) {
    const result = await remove(category.id)
    setToDelete(null)
    if (result.ok) {
      if (activeId === category.id) await setSelectedId(null)
      toast.success('Categoría eliminada')
      return
    }
    if (result.error.code === 'CATEGORY_IN_USE') toast.warning(result.error.message)
    else toast.error(result.error.message)
    await refetch()
  }

  return (
    <section
      aria-labelledby="categories-title"
      className="overflow-hidden rounded-[14px] border bg-card shadow-xs lg:sticky lg:top-6"
    >
      <div className="flex h-17 items-center justify-between gap-2.5 border-b pr-3.5 pl-5">
        <h2 id="categories-title" className="flex items-center gap-2 text-[15px] font-bold">
          Categorías
          {categories ? <CountPill>{categories.length}</CountPill> : null}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setForm({ mode: 'create' })}>
          <Plus aria-hidden />
          Nueva<span className="sr-only"> categoría</span>
        </Button>
      </div>

      {isPending ? (
        <div className="grid gap-0.5 p-2" aria-busy="true">
          <span className="sr-only">Cargando categorías…</span>
          {[62, 48, 56, 40, 52].map((width) => (
            <div key={width} className="flex h-11.5 items-center gap-3 px-2">
              <Skeleton className="size-7.5 rounded-[9px]" />
              <Skeleton className="h-3 rounded-md" style={{ width: `${width}%` }} />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="grid justify-items-start gap-3 p-5 text-sm">
          <p role="alert" className="text-muted-foreground">
            No pudimos cargar las categorías.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <nav aria-label="Filtrar por categoría" className="grid gap-0.5 p-2">
          <FilterRow
            label="Todos los productos"
            count={total}
            active={activeId === null}
            icon={<Package className="size-4" aria-hidden />}
            tile={{ bg: 'var(--accent)', fg: '#3d4b63' }}
            onSelect={() => setSelectedId(null)}
          />
          <div className="mx-2.5 my-1 h-px bg-border" />
          {categories.map((category) => (
            <FilterRow
              key={category.id}
              label={category.name}
              count={category.product_count}
              active={activeId === category.id}
              icon={<Tag className="size-4" aria-hidden />}
              tile={categoryColor(category.id)}
              onSelect={() => setSelectedId(category.id)}
              actions={
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Renombrar ${category.name}`}
                    title="Renombrar"
                    onClick={() => setForm({ mode: 'rename', category })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Eliminar ${category.name}`}
                    title="Eliminar"
                    className="hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => askDelete(category)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </>
              }
            />
          ))}
          {categories.length === 0 ? (
            <p className="px-2.5 py-3.5 text-[13px] leading-relaxed text-muted-foreground">
              Aún no hay categorías. Crea la primera para organizar tus productos.
            </p>
          ) : null}
        </nav>
      )}

      <p className="flex items-start gap-2 border-t bg-background/60 px-5 py-3.5 text-xs leading-normal text-muted-foreground">
        <Info className="size-4 shrink-0" aria-hidden />
        Solo se pueden eliminar categorías sin productos.
      </p>

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.mode === 'rename' ? 'Renombrar categoría' : 'Nueva categoría'}
            </DialogTitle>
            <DialogDescription>
              Agrupa tus productos para encontrarlos más fácilmente.
            </DialogDescription>
          </DialogHeader>
          {form ? (
            <CategoryForm
              key={form.mode === 'rename' ? form.category.id : 'create'}
              defaultName={form.mode === 'rename' ? form.category.name : undefined}
              onSubmit={(values) =>
                form.mode === 'rename' ? rename(form.category.id, values) : create(values)
              }
              onSaved={() => {
                toast.success(form.mode === 'rename' ? 'Categoría actualizada' : 'Categoría creada')
                setForm(null)
              }}
              onCancel={() => setForm(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <DeleteCategoryDialog
        category={toDelete}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </section>
  )
}

type FilterRowProps = {
  label: string
  count: number
  active: boolean
  icon: ReactNode
  tile: { bg: string; fg: string }
  onSelect: () => void
  actions?: ReactNode
}

// Las acciones aparecen al pasar el cursor, al enfocar la fila o con la fila seleccionada (spec §7).
function FilterRow({ label, count, active, icon, tile, onSelect, actions }: FilterRowProps) {
  return (
    <div
      data-active={active}
      className={cn(
        'group flex min-h-11.5 items-center rounded-[10px]',
        active ? 'bg-accent' : 'hover:bg-[#f6f8fc]',
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-3 self-stretch rounded-[10px] px-2 text-left text-sm',
          active ? 'font-semibold text-foreground' : 'font-medium text-secondary-foreground',
        )}
      >
        <span
          className="grid size-7.5 shrink-0 place-items-center rounded-[9px]"
          style={{ backgroundColor: tile.bg, color: tile.fg }}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span
          className={cn(
            actions &&
              'group-focus-within:hidden group-hover:hidden group-data-[active=true]:hidden',
          )}
        >
          <CountPill>{count}</CountPill>
        </span>
      </button>
      {actions ? (
        <div className="hidden items-center gap-0.5 pr-1.5 group-focus-within:flex group-hover:flex group-data-[active=true]:flex">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
