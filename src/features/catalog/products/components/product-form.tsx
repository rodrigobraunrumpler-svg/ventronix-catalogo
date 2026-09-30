'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, Eye } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ActionResult } from '@/lib/action-result'
import { cn } from '@/lib/utils'
import { categoryColor } from '../../categories/theme'
import { formatPrice, unitPriceSchema } from '../../money'
import { productSchema } from '../../schemas'
import type { CategoryOption, Product, ProductInput, ProductListItem } from '../../types'

const FIELDS = ['code', 'name', 'description', 'category_id', 'unit_price'] as const
type Field = (typeof FIELDS)[number]

type ProductFormProps = {
  product?: ProductListItem
  categories: CategoryOption[]
  defaultCategoryId?: string | null
  onSubmit: (values: ProductInput) => Promise<ActionResult<Product>>
  onSaved: (product: Product) => void
  onCancel: () => void
  onCreateCategory: () => void
}

function FieldMessage({ id, error, help }: { id: string; error?: string; help?: ReactNode }) {
  if (error) {
    return (
      <p id={`${id}-error`} className="text-xs font-medium text-destructive">
        {error}
      </p>
    )
  }
  return help ? (
    <p id={`${id}-help`} className="text-xs text-muted-foreground">
      {help}
    </p>
  ) : null
}

export function ProductForm({
  product,
  categories,
  defaultCategoryId,
  onSubmit,
  onSaved,
  onCancel,
  onCreateCategory,
}: ProductFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  // Los valores iniciales se toman una sola vez: un refetch no pisa lo que se está editando.
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      code: product?.code ?? '',
      name: product?.name ?? '',
      description: product?.description ?? '',
      category_id: product?.category_id ?? defaultCategoryId ?? '',
      unit_price: product?.unit_price ?? '',
    },
  })
  const draft = useWatch({ control })

  const submit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await onSubmit(values)
    if (result.ok) {
      onSaved(result.data)
      return
    }
    const fieldErrors = result.error.fieldErrors ?? {}
    const invalid = FIELDS.filter((field) => fieldErrors[field]?.[0])
    invalid.forEach((field, index) =>
      setError(field, { message: fieldErrors[field][0] }, { shouldFocus: index === 0 }),
    )
    if (invalid.length === 0) setServerError(result.error.message)
  })

  const a11y = (field: Field, id: string, hasHelp = false) => ({
    id,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-error` : hasHelp ? `${id}-help` : undefined,
  })

  const previewCategory = categories.find((category) => category.id === draft.category_id)
  const previewColor = previewCategory ? categoryColor(previewCategory.id) : null
  const previewPrice = unitPriceSchema.safeParse(draft.unit_price ?? '')

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 py-5">
        {serverError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            {serverError}
          </p>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor="product-code">Código</Label>
          <Input
            {...a11y('code', 'product-code', true)}
            autoComplete="off"
            maxLength={64}
            placeholder="Por ejemplo, LAP-004"
            className="font-mono"
            {...register('code')}
          />
          <FieldMessage
            id="product-code"
            error={errors.code?.message}
            help="Un código único para cada producto. Se guarda en mayúsculas."
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="product-name">Nombre del producto</Label>
          <Input
            {...a11y('name', 'product-name')}
            autoComplete="off"
            maxLength={120}
            placeholder="Por ejemplo, Laptop de 14 pulgadas"
            {...register('name')}
          />
          <FieldMessage id="product-name" error={errors.name?.message} />
        </div>

        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="product-description">Descripción</Label>
            <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">
              Opcional
            </span>
          </div>
          <Textarea
            {...a11y('description', 'product-description')}
            maxLength={2000}
            placeholder="Características o detalles que te ayuden a identificarlo…"
            className="min-h-24 bg-card px-3"
            {...register('description')}
          />
          <FieldMessage id="product-description" error={errors.description?.message} />
        </div>

        <div className="grid content-start gap-1.5">
          <Label htmlFor="product-category">Categoría</Label>
          <div className="relative">
            <select
              {...a11y('category_id', 'product-category')}
              className="h-10.5 w-full appearance-none rounded-lg border border-input bg-card pr-9 pl-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm"
              {...register('category_id')}
            >
              <option value="">Selecciona una categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-3 right-3 size-4 text-muted-foreground"
              aria-hidden
            />
          </div>
          <FieldMessage id="product-category" error={errors.category_id?.message} />
          {categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              <span>Aún no hay categorías.</span>{' '}
              <button
                type="button"
                onClick={onCreateCategory}
                className="font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-2"
              >
                Crear una categoría
              </button>
            </p>
          ) : null}
        </div>

        <div className="grid content-start gap-1.5">
          <Label htmlFor="product-price">Precio unitario</Label>
          <div
            className={cn(
              'flex h-10.5 overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
              errors.unit_price && 'border-destructive ring-3 ring-destructive/20',
            )}
          >
            <span className="grid place-items-center border-r bg-muted px-3 text-[13px] font-semibold text-muted-foreground">
              S/
            </span>
            <input
              {...a11y('unit_price', 'product-price', true)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              className="w-full min-w-0 bg-transparent px-3 text-base tabular-nums outline-none md:text-sm"
              {...register('unit_price')}
            />
          </div>
          <FieldMessage
            id="product-price"
            error={errors.unit_price?.message}
            help="Hasta dos decimales."
          />
        </div>

        <section aria-label="Vista previa" className="overflow-hidden rounded-[14px] border">
          <p className="flex items-center gap-2 border-b bg-background/60 px-4 py-2.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Eye className="size-4" aria-hidden />
            Vista previa en el catálogo
          </p>
          <div className="flex items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold wrap-break-word">
                {draft.name?.trim() || 'Nombre de tu producto'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-md border bg-background/60 px-1.5 font-mono text-xs">
                  {draft.code?.trim().toUpperCase() || 'CÓDIGO'}
                </span>
                <span
                  className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold"
                  style={
                    previewColor
                      ? { backgroundColor: previewColor.bg, color: previewColor.fg }
                      : { backgroundColor: 'var(--accent)', color: '#3d4b63' }
                  }
                >
                  <span className="size-1.5 rounded-full bg-current" />
                  {previewCategory?.name ?? 'Categoría'}
                </span>
              </div>
            </div>
            <p className="whitespace-nowrap tabular-nums">
              <span className="mr-1 text-xs text-muted-foreground">S/</span>
              <span className="text-base font-bold">
                {previewPrice.success ? formatPrice(previewPrice.data) : '0.00'}
              </span>
            </p>
          </div>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t bg-background/60 px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {product ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}
