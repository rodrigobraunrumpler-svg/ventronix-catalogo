'use client'

import {
  ArrowDownAZ,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProformaControl } from '@/features/proforma/components/proforma-control'
import { findLine } from '@/features/proforma/draft'
import { useAddSingleResult } from '@/features/proforma/hooks'
import { useProforma } from '@/features/proforma/store'
import { cn } from '@/lib/utils'
import { useCategories } from '../../categories/hooks'
import { categoryColor } from '../../categories/theme'
import { formatPrice } from '../../money'
import { pageList } from '../../search-params'
import type { ProductListItem } from '../../types'
import { useCatalogFilters, useProducts } from '../hooks'
import { PAGE_SIZE } from '../queries'
import { ProductFilters } from './product-filters'

type ProductListProps = {
  onCreate: () => void
  onEdit: (product: ProductListItem) => void
  onDelete: (product: ProductListItem) => void
}

export function ProductList({ onCreate, onEdit, onDelete }: ProductListProps) {
  const { filters, query } = useProducts()
  const [, setFilters] = useCatalogFilters()
  const categories = useCategories()
  const addSingleResult = useAddSingleResult()
  const data = query.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  // Si un borrado vacía la última página, se muestra la anterior (plan, tarea 6).
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && filters.page > totalPages) {
      void setFilters({ page: totalPages === 1 ? null : totalPages })
    }
  }, [data, filters.page, totalPages, setFilters])

  const categoryName = categories.data?.find((category) => category.id === filters.category)?.name
  const title = filters.search ? 'Resultados' : (categoryName ?? 'Todos los productos')
  const hasFilters = filters.search !== '' || filters.category !== null
  const clearFilters = () => setFilters({ search: null, category: null, page: null })

  return (
    <section
      aria-label="Lista de productos"
      aria-busy={query.isPending}
      className="min-w-0 overflow-hidden rounded-[14px] border bg-card shadow-xs"
    >
      <ProductFilters onSearchEnter={() => void addSingleResult(filters)} />

      <div className="flex min-h-15 items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
        <h2 className="flex items-center gap-2.5 text-[15px] font-bold">
          {title}
          {data ? (
            <span className="rounded-full bg-muted px-2 font-mono text-xs font-medium text-muted-foreground">
              {data.total}
            </span>
          ) : null}
        </h2>
        <p className="hidden items-center gap-1.5 text-[13px] text-muted-foreground sm:flex">
          <ArrowDownAZ className="size-4" aria-hidden />
          Nombre A–Z
        </p>
      </div>

      {query.isPending ? (
        <LoadingRows />
      ) : query.isError ? (
        <EmptyState
          tone="error"
          icon={<CircleAlert className="size-6" aria-hidden />}
          title="No pudimos cargar los productos"
          text="Revisa tu conexión a internet e inténtalo de nuevo. Tus datos no se han perdido."
          action={
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw aria-hidden />
              Reintentar
            </Button>
          }
        />
      ) : data && data.total === 0 && !hasFilters ? (
        <EmptyState
          icon={<Package className="size-6" aria-hidden />}
          title="Tu catálogo empieza aquí"
          text="Añade tu primer producto para tener sus datos siempre a mano."
          action={
            <Button onClick={onCreate}>
              <Plus aria-hidden />
              Crear un producto
            </Button>
          }
        />
      ) : data && data.total === 0 ? (
        <EmptyState
          icon={<Search className="size-6" aria-hidden />}
          title="No encontramos productos"
          text="Prueba con otro nombre, código o categoría."
          action={
            <Button variant="outline" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          }
        />
      ) : data ? (
        <>
          <ProductTable items={data.items} onEdit={onEdit} onDelete={onDelete} />
          <ProductCards items={data.items} onEdit={onEdit} onDelete={onDelete} />
          <Pagination
            page={Math.min(filters.page, totalPages)}
            totalPages={totalPages}
            total={data.total}
            shown={data.items.length}
            onPage={(page) => setFilters({ page: page === 1 ? null : page })}
          />
        </>
      ) : null}
    </section>
  )
}

type RowsProps = Pick<ProductListProps, 'onEdit' | 'onDelete'> & { items: ProductListItem[] }

function CategoryBadge({ product }: { product: ProductListItem }) {
  const color = categoryColor(product.category_id)
  return (
    <span
      className="inline-flex h-6.5 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{product.category_name}</span>
    </span>
  )
}

function Price({ value }: { value: string }) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="mr-1 text-xs font-medium text-muted-foreground">S/</span>
      <span className="font-bold">{formatPrice(value)}</span>
    </span>
  )
}

function RowActions({
  product,
  onEdit,
  onDelete,
}: Omit<RowsProps, 'items'> & { product: ProductListItem }) {
  return (
    <div className="inline-flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Editar ${product.name}`}
        title="Editar"
        onClick={() => onEdit(product)}
      >
        <Pencil aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Eliminar ${product.name}`}
        title="Eliminar"
        className="hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onDelete(product)}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  )
}

function CodeChip({ code }: { code: string }) {
  return (
    <span className="shrink-0 rounded-md border bg-background/60 px-1.5 font-mono text-xs font-medium whitespace-nowrap text-secondary-foreground">
      {code}
    </span>
  )
}

// PC: tabla con anchos fijos para que nunca se desborde de su tarjeta. Las filas que están en la
// proforma se marcan con un fondo verde claro (spec §4.1).
function ProductTable({ items, onEdit, onDelete }: RowsProps) {
  const { draft } = useProforma()
  const th =
    'h-11 border-y bg-background/60 px-3.5 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase'
  return (
    <table className="hidden w-full table-fixed border-collapse text-left md:table">
      <caption className="sr-only">Productos del catálogo</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(th, 'pl-5')}>
            Producto
          </th>
          <th scope="col" className={cn(th, 'w-36')}>
            Categoría
          </th>
          <th scope="col" className={cn(th, 'w-36 text-right')}>
            Precio unitario
          </th>
          <th scope="col" className={cn(th, 'w-36 text-center')}>
            Proforma
          </th>
          <th scope="col" className={cn(th, 'w-28 pr-5 text-right')}>
            Acciones
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((product) => (
          <tr
            key={product.id}
            className={cn(
              'border-b transition-colors last:border-b-0',
              findLine(draft, product.id)
                ? 'bg-[#f6fbef] hover:bg-[#f1f8e6]'
                : 'hover:bg-background/40',
            )}
          >
            <td className="overflow-hidden py-3.5 pr-3.5 pl-5 align-middle">
              <p className="truncate font-semibold" title={product.name}>
                {product.name}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <CodeChip code={product.code} />
                <span
                  className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground"
                  title={product.description ?? undefined}
                >
                  {product.description ?? 'Sin descripción'}
                </span>
              </div>
            </td>
            <td className="px-3.5 py-3.5 align-middle">
              <CategoryBadge product={product} />
            </td>
            <td className="px-3.5 py-3.5 text-right align-middle">
              <Price value={product.unit_price} />
            </td>
            <td className="px-2 py-3.5 text-center align-middle">
              <ProformaControl product={product} />
            </td>
            <td className="py-3.5 pr-5 pl-2 text-right align-middle">
              <RowActions product={product} onEdit={onEdit} onDelete={onDelete} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Móvil: tarjetas legibles sin desbordamiento horizontal, con el mismo control de proforma.
function ProductCards({ items, onEdit, onDelete }: RowsProps) {
  const { draft } = useProforma()
  return (
    <ul className="md:hidden">
      {items.map((product) => (
        <li
          key={product.id}
          className={cn(
            'grid gap-2 border-t px-4 py-3.5',
            findLine(draft, product.id) && 'bg-[#f6fbef]',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-semibold">{product.name}</p>
            <Price value={product.unit_price} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CodeChip code={product.code} />
            <CategoryBadge product={product} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <ProformaControl product={product} />
            <RowActions product={product} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Pagination({
  page,
  totalPages,
  total,
  shown,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  shown: number
  onPage: (page: number) => void
}) {
  const from = (page - 1) * PAGE_SIZE + 1
  const to = from + shown - 1
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <p className="text-[13px] text-muted-foreground">
        Mostrando {from}–{to} de {total} {total === 1 ? 'producto' : 'productos'}
      </p>
      <nav aria-label="Páginas de productos" className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        {pageList(page, totalPages).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={`Página ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={cn(item === page && 'border border-input font-bold')}
              onClick={() => onPage(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página siguiente"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </nav>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="border-t">
      <span className="sr-only">Cargando productos…</span>
      {[46, 38, 52, 34, 44, 40].map((width) => (
        <div key={width} className="flex h-17 items-center gap-4 border-b px-5 last:border-b-0">
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3 rounded-md" style={{ width: `${width}%` }} />
            <Skeleton className="h-2.5 w-1/4 rounded-md" />
          </div>
          <Skeleton className="hidden h-6 w-24 rounded-full sm:block" />
          <Skeleton className="h-3.5 w-20 rounded-md" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({
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
