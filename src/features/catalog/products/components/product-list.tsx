'use client'

import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Link2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProformaControl } from '@/features/proforma/components/proforma-control'
import { findLine } from '@/features/proforma/draft'
import { useAddSingleResult } from '@/features/proforma/hooks'
import { useProforma } from '@/features/proforma/store'
import { cn } from '@/lib/utils'
import { useCategories } from '../../categories/hooks'
import { categoryColor } from '../../categories/theme'
import { describeDateFilter, relativeDay, rowDateField, type DateField } from '../../list-options'
import { formatPrice } from '../../money'
import { pageList } from '../../search-params'
import type { ProductListItem } from '../../types'
import { useCatalogFilters, useProducts } from '../hooks'
import { PAGE_SIZE } from '../queries'
import { ExportMenu } from './export-menu'
import { ProductFilters } from './product-filters'
import { SortSelect } from './sort-select'

type ProductListProps = {
  onCreate: () => void
  onView: (product: ProductListItem) => void
  onEdit: (product: ProductListItem) => void
  onDelete: (product: ProductListItem) => void
}

export function ProductList({ onCreate, onView, onEdit, onDelete }: ProductListProps) {
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
  const dateLabel = describeDateFilter(filters)
  const dateField = rowDateField(filters)
  const hasFilters = filters.search !== '' || filters.category !== null || filters.date !== null
  const onlyDate = filters.date !== null && filters.search === '' && filters.category === null
  const clearFilters = () =>
    setFilters({ search: null, category: null, date: null, from: null, to: null, page: null })
  const clearDate = () => setFilters({ date: null, from: null, to: null, page: null })
  const goToPage = (page: number) => setFilters({ page: page === 1 ? null : page })
  const listRef = useRef<HTMLElement>(null)
  // Con los botones de abajo, la página nueva se lee desde el principio de la lista.
  const goToPageFromBottom = (page: number) => {
    void goToPage(page)
    const list = listRef.current
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: 'start' })
  }

  return (
    <section
      ref={listRef}
      aria-label="Lista de productos"
      aria-busy={query.isPending}
      className="min-w-0 scroll-mt-16 overflow-clip rounded-[14px] border bg-card shadow-xs lg:scroll-mt-0"
    >
      <ProductFilters onSearchEnter={() => void addSingleResult(filters)} />

      <div className="flex min-h-15 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5 lg:short:min-h-12 lg:short:py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 className="flex items-center gap-2.5 text-[15px] font-bold">
            {title}
            {data ? (
              <span className="rounded-full bg-muted px-2 font-mono text-xs font-medium text-muted-foreground">
                {data.total}
              </span>
            ) : null}
          </h2>
          {dateLabel ? <DateChip label={dateLabel} onClear={clearDate} /> : null}
          {hasFilters || filters.sort !== 'name' ? <CopyLinkButton /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SortSelect value={filters.sort} onChange={(sort) => setFilters({ sort, page: null })} />
          <ExportMenu filters={filters} disabled={!data || data.total === 0} />
          {data && totalPages > 1 ? (
            <PageStepper
              page={Math.min(filters.page, totalPages)}
              totalPages={totalPages}
              onPage={goToPage}
            />
          ) : null}
        </div>
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
      ) : data && data.total === 0 && onlyDate ? (
        <EmptyState
          icon={<Search className="size-6" aria-hidden />}
          title="No hay productos en esas fechas"
          text="Prueba con otro rango o quita el filtro de fecha."
          action={
            <Button variant="outline" onClick={clearDate}>
              Quitar filtro de fecha
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
          <ProductTable
            items={data.items}
            dateField={dateField}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          <ProductCards
            items={data.items}
            dateField={dateField}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          <Pagination
            page={Math.min(filters.page, totalPages)}
            totalPages={totalPages}
            total={data.total}
            shown={data.items.length}
            onPage={goToPageFromBottom}
          />
        </>
      ) : null}
    </section>
  )
}

type RowsProps = Pick<ProductListProps, 'onView' | 'onEdit' | 'onDelete'> & {
  items: ProductListItem[]
}

export function CategoryBadge({ product }: { product: ProductListItem }) {
  const color = categoryColor(product.category_id)
  return (
    <span
      className="inline-flex h-5.5 max-w-full min-w-0 items-center gap-1.5 rounded-full px-2 text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{product.category_name}</span>
    </span>
  )
}

export function Price({ value }: { value: string }) {
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
}: Omit<RowsProps, 'items' | 'onView'> & { product: ProductListItem }) {
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

// Con un filtro o un orden por fecha, cada fila dice cuándo se registró o modificó (spec §4.3).
function RowDate({ product, field }: { product: ProductListItem; field: DateField }) {
  const instant = field === 'created' ? product.created_at : product.updated_at
  return (
    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
      {field === 'created' ? 'Registrado' : 'Modificado'} {relativeDay(instant)}
    </span>
  )
}

// Los filtros viven en la URL: copiarla guarda la vista para volver a ella o compartirla.
function CopyLinkButton() {
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(
        'Enlace copiado: guárdalo en favoritos o compártelo para volver a esta misma vista.',
      )
    } catch {
      toast.error('No se pudo copiar el enlace. Cópialo desde la barra de direcciones.')
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copiar enlace de esta vista"
      title="Copiar enlace de esta vista"
      onClick={() => void copy()}
    >
      <Link2 aria-hidden />
    </Button>
  )
}

// El filtro de fecha activo, para quitarlo con un clic (spec §4.3).
function DateChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full bg-accent pr-1 pl-3 text-[13px] font-medium">
      {label}
      <button
        type="button"
        aria-label="Quitar filtro de fecha"
        onClick={onClear}
        className="grid size-5 cursor-pointer place-items-center rounded-full hover:bg-background"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  )
}

export function CodeChip({ code }: { code: string }) {
  return (
    <span className="shrink-0 rounded-md border bg-background/60 px-1.5 font-mono text-xs font-medium whitespace-nowrap text-secondary-foreground">
      {code}
    </span>
  )
}

// PC: tabla con anchos fijos para que nunca se desborde de su tarjeta. La categoría va debajo del
// nombre y no en su propia columna: así el nombre tiene todo el ancho posible. Las filas que están
// en la proforma se marcan con un fondo verde claro (spec §4.1).
// El nombre abre la ficha del producto: ahí se lee completo, con toda su descripción.
function NameButton({
  product,
  onView,
  className,
}: {
  product: ProductListItem
  onView: RowsProps['onView']
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={`Ver ficha de ${product.name}`}
      title={product.name}
      className={cn(
        'cursor-pointer text-left font-semibold decoration-primary decoration-2 underline-offset-3 hover:underline',
        className,
      )}
      onClick={() => onView(product)}
    >
      {product.name}
    </button>
  )
}

function ProductTable({
  items,
  dateField,
  onView,
  onEdit,
  onDelete,
}: RowsProps & { dateField: DateField | null }) {
  const { draft } = useProforma()
  const th =
    'h-11 border-y bg-background/60 px-3.5 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase lg:short:h-9'
  return (
    <table className="hidden w-full table-fixed border-collapse text-left md:table">
      <caption className="sr-only">Productos del catálogo</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(th, 'pl-5')}>
            Producto
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
            <td className="overflow-hidden py-3.5 pr-3.5 pl-5 align-middle lg:short:py-2.5">
              <NameButton product={product} onView={onView} className="block max-w-full truncate" />
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <CodeChip code={product.code} />
                <CategoryBadge product={product} />
                <span
                  className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground"
                  title={product.description ?? undefined}
                >
                  {product.description ?? 'Sin descripción'}
                </span>
                {dateField ? <RowDate product={product} field={dateField} /> : null}
              </div>
            </td>
            <td className="px-3.5 py-3.5 text-right align-middle lg:short:py-2.5">
              <Price value={product.unit_price} />
            </td>
            <td className="px-2 py-3.5 text-center align-middle lg:short:py-2.5">
              <ProformaControl product={product} />
            </td>
            <td className="py-3.5 pr-5 pl-2 text-right align-middle lg:short:py-2.5">
              <RowActions product={product} onEdit={onEdit} onDelete={onDelete} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Móvil: tarjetas legibles sin desbordamiento horizontal, con el mismo control de proforma.
function ProductCards({
  items,
  dateField,
  onView,
  onEdit,
  onDelete,
}: RowsProps & { dateField: DateField | null }) {
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
            <NameButton product={product} onView={onView} className="min-w-0" />
            <Price value={product.unit_price} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CodeChip code={product.code} />
            <CategoryBadge product={product} />
            {dateField ? <RowDate product={product} field={dateField} /> : null}
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

// Arriba, junto al título: cambiar de página sin bajar hasta el final de la lista.
function PageStepper({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (page: number) => void
}) {
  return (
    <div role="group" aria-label="Cambiar de página" className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Anterior"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <span className="min-w-21 text-center text-[13px] whitespace-nowrap text-muted-foreground tabular-nums">
        Página {page} de {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Siguiente"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </div>
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
