'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronDown, Eye } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { PhotoField } from '@/components/photo-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ActionResult } from '@/lib/action-result'
import { clearDraft, readDraft, saveDraft } from '@/lib/drafts'
import { thumbPath } from '@/lib/photos'
import { usePhotoUrl } from '@/lib/use-photos'
import { cn } from '@/lib/utils'
import { categoryColor } from '../../categories/theme'
import { formatPrice, unitPriceSchema } from '../../money'
import { productSchema } from '../../schemas'
import type { CategoryOption, Product, ProductInput, ProductListItem } from '../../types'

const FIELDS = ['code', 'name', 'description', 'category_id', 'unit_price', 'image_path'] as const
type Field = (typeof FIELDS)[number]

// Borrador: los valores tal como se escribieron y la versión del producto (updated_at) sobre la que
// se editaba; null en un alta.
const valuesSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  category_id: z.string(),
  unit_price: z.string(),
  // Los borradores anteriores a las fotos no la tienen.
  image_path: z.string().nullable().default(null),
})
const draftSchema = z.object({ base: z.string().nullable(), values: valuesSchema })
type FormValues = z.infer<typeof valuesSchema>
type WatchedValues = Partial<Record<Field, string | null>>

const EMPTY: FormValues = {
  code: '',
  name: '',
  description: '',
  category_id: '',
  unit_price: '',
  image_path: null,
}

export const productDraftKey = (id?: string) => `producto:${id ?? 'nuevo'}`

const toFormValues = (values: WatchedValues): FormValues => ({
  code: values.code ?? '',
  name: values.name ?? '',
  description: values.description ?? '',
  category_id: values.category_id ?? '',
  unit_price: values.unit_price ?? '',
  image_path: values.image_path ?? null,
})

const differs = (values: WatchedValues, from: FormValues) =>
  FIELDS.some((field) => (values[field] ?? '') !== (from[field] ?? ''))

type ProductFormProps = {
  product?: ProductListItem
  categories: CategoryOption[]
  defaultCategoryId?: string | null
  onSubmit: (values: ProductInput) => Promise<ActionResult<Product>>
  onSaved: (product: Product, options: { another: boolean }) => void
  onCancel: () => void
  onCreateCategory: () => void
  // Sube la foto elegida y devuelve su ruta (spec de productos libres §4.7).
  uploadPhoto: (file: File) => Promise<string>
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
  uploadPhoto,
}: ProductFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const draftKey = productDraftKey(product?.id)
  const base = product?.updated_at ?? null
  // Punto de partida sin borrador: los datos del producto o un alta vacía. «Descartar» vuelve aquí.
  const [initial] = useState<FormValues>(() => ({
    code: product?.code ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    category_id: product?.category_id ?? defaultCategoryId ?? '',
    unit_price: product?.unit_price ?? '',
    image_path: product?.image_path ?? null,
  }))
  // Solo se recupera el borrador de esta misma versión del producto (o del alta).
  const [restored, setRestored] = useState<FormValues | null>(() => {
    const draft = readDraft(draftKey, draftSchema)
    return draft && draft.base === base && differs(draft.values, initial) ? draft.values : null
  })
  // Con qué se compara para saber si hay algo que guardar como borrador.
  const [baseline, setBaseline] = useState(initial)

  // Los valores iniciales se toman una sola vez: un refetch no pisa lo que se está editando.
  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    setValue,
    getValues,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: restored ?? initial,
  })
  const live = useWatch({ control })
  // La miniatura basta para la vista previa del formulario.
  const photoUrl = usePhotoUrl(live.image_path ? thumbPath(live.image_path) : null)

  // Al abrir, el foco va a Código (también si el formulario llega después de cargar) y no a
  // «Descartar»: Enter no debe borrar un borrador por accidente.
  useEffect(() => {
    setFocus('code')
  }, [setFocus])

  // Cada cambio queda guardado: cerrar la ventana o recargar la página no pierde lo escrito.
  useEffect(() => {
    if (differs(live, baseline)) {
      saveDraft(draftKey, { base, values: toFormValues(live) })
    } else {
      clearDraft(draftKey)
    }
  }, [live, baseline, draftKey, base])

  function discard() {
    setBaseline(initial)
    reset(initial)
    clearDraft(draftKey)
    setRestored(null)
  }

  const save = (another: boolean) =>
    handleSubmit(async (values) => {
      setServerError(null)
      const result = await onSubmit(values)
      if (result.ok) {
        clearDraft(draftKey)
        setRestored(null)
        if (another) {
          // Siguiente producto de la misma categoría: se limpia el resto y se vuelve a Código. El
          // foco va antes de reset(), que vuelve a registrar los campos en el siguiente render.
          const next = { ...EMPTY, category_id: getValues('category_id') ?? '' }
          setFocus('code')
          setBaseline(next)
          reset(next)
        }
        onSaved(result.data, { another })
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

  const previewCategory = categories.find((category) => category.id === live.category_id)
  const previewColor = previewCategory ? categoryColor(previewCategory.id) : null
  const previewPrice = unitPriceSchema.safeParse(live.unit_price ?? '')

  return (
    <form onSubmit={save(false)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 py-5 sm:grid-cols-2 sm:gap-x-4">
        {restored ? (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/60 py-1.5 pr-1.5 pl-3 text-sm sm:col-span-2"
          >
            <span>Recuperamos lo que estabas escribiendo.</span>
            <Button type="button" variant="ghost" size="sm" onClick={discard}>
              Descartar
            </Button>
          </div>
        ) : null}

        {serverError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive sm:col-span-2"
          >
            {serverError}
          </p>
        ) : null}

        <div className="grid gap-1 sm:col-span-2">
          <PhotoField
            value={live.image_path ?? null}
            url={photoUrl}
            alt={`Foto de ${live.name?.trim() || 'tu producto'}`}
            upload={uploadPhoto}
            onChange={(path) => setValue('image_path', path, { shouldDirty: true })}
          />
          {errors.image_path ? (
            <p className="text-xs font-medium text-destructive">{errors.image_path.message}</p>
          ) : null}
        </div>

        <div className="grid content-start gap-1.5">
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
            help="Único para cada producto. Se guarda en mayúsculas."
          />
        </div>

        <div className="grid content-start gap-1.5">
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

        <div className="grid gap-1.5 sm:col-span-2">
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
            className="min-h-20 bg-card px-3"
            {...register('description')}
          />
          <FieldMessage id="product-description" error={errors.description?.message} />
        </div>

        <section aria-label="Vista previa" className="rounded-[14px] border sm:col-span-2">
          <p className="flex items-center gap-2 border-b bg-background/60 px-4 py-2 text-xs font-medium text-muted-foreground">
            <Eye className="size-3.5" aria-hidden />
            Así se verá en tu catálogo
          </p>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold wrap-break-word">
                {live.name?.trim() || 'Nombre de tu producto'}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="rounded-md border bg-background/60 px-1.5 font-mono text-xs">
                  {live.code?.trim().toUpperCase() || 'CÓDIGO'}
                </span>
                <span
                  className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold"
                  style={
                    previewColor
                      ? { backgroundColor: previewColor.bg, color: previewColor.fg }
                      : { backgroundColor: 'var(--accent)', color: 'var(--secondary-foreground)' }
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

      <div className="flex flex-col-reverse gap-2 border-t bg-background/60 px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        {product ? null : (
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={save(true)}>
            Crear y añadir otro
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {product ? 'Guardar cambios' : 'Crear producto'}
        </Button>
      </div>
    </form>
  )
}
