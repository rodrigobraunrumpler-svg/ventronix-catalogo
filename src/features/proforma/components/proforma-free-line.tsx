'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { PhotoField } from '@/components/photo-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { thumbPath } from '@/lib/photos'
import { usePhotoUrl } from '@/lib/use-photos'
import { cn } from '@/lib/utils'
import { addFreeLine, freeLineSchema, type FreeLineValues } from '../draft'
import { useProforma } from '../store'
import { TAX_CONFIG } from '../tax'

const EMPTY: FreeLineValues = { name: '', code: '', quantity: '1', unitPrice: '', imagePath: null }
const PRICE_LABEL = TAX_CONFIG.mode.startsWith('included')
  ? 'Precio con IGV (S/)'
  : 'Precio unitario (S/)'

function Field({
  id,
  label,
  optional,
  error,
  className,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-[13px] font-semibold text-foreground">
          {label}
        </Label>
        {optional ? <span className="text-[13px] text-muted-foreground">(opcional)</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// Productos que no están en el catálogo (spec de productos libres §4.3). Tras añadir uno, el
// formulario queda vacío y abierto para el siguiente (plan, decisión 3).
export function FreeLineForm({
  onClose,
  uploadPhoto,
}: {
  onClose: () => void
  // Sube la foto del producto libre y devuelve su ruta (spec de productos libres §4.3).
  uploadPhoto: (file: File) => Promise<string>
}) {
  const id = useId()
  const { update } = useProforma()
  const [added, setAdded] = useState<string | null>(null)
  // Mientras sube la foto no se añade: la línea quedaría sin ella.
  const [photoBusy, setPhotoBusy] = useState(false)
  async function upload(file: File) {
    setPhotoBusy(true)
    try {
      return await uploadPhoto(file)
    } finally {
      setPhotoBusy(false)
    }
  }
  const {
    register,
    control,
    setValue,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(freeLineSchema), defaultValues: EMPTY })
  const imagePath = useWatch({ control, name: 'imagePath' })
  const photoUrl = usePhotoUrl(imagePath ? thumbPath(imagePath) : null)

  const add = handleSubmit((values) => {
    update((draft) => addFreeLine(draft, values))
    // Confirma cada uno: la línea nueva puede quedar fuera de la vista, debajo del formulario.
    setAdded(values.name)
    // Antes de vaciarlo: reset() olvida las referencias de los campos hasta el siguiente render.
    setFocus('name')
    reset(EMPTY)
  })

  const a11y = (field: keyof FreeLineValues) => ({
    id: `${id}-${field}`,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  })

  return (
    <form
      id="free-line-form"
      aria-label="Añadir producto libre"
      noValidate
      onSubmit={add}
      className="mb-3 grid gap-3 rounded-[14px] border border-dashed border-[#9cc96a] bg-[#fafdf6] p-4"
    >
      <p className="text-[13px] text-muted-foreground">
        Para productos que no están en el catálogo. No se guardan en él.
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Field id={`${id}-name`} label="Descripción" error={errors.name?.message}>
          <Input
            {...a11y('name')}
            // Se abre al pedirlo: se escribe enseguida (como «Corregir» en proforma-ready.tsx).
            autoFocus
            maxLength={120}
            autoComplete="off"
            className="bg-card"
            {...register('name')}
          />
        </Field>
        <Field id={`${id}-code`} label="Código" optional error={errors.code?.message}>
          <Input
            {...a11y('code')}
            maxLength={64}
            autoComplete="off"
            placeholder="Sin código"
            className="bg-card font-mono"
            {...register('code')}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <Field
          id={`${id}-quantity`}
          label="Cantidad"
          error={errors.quantity?.message}
          className="w-28"
        >
          <Input
            {...a11y('quantity')}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            className="bg-card tabular-nums"
            {...register('quantity')}
          />
        </Field>
        <Field
          id={`${id}-unitPrice`}
          label={PRICE_LABEL}
          error={errors.unitPrice?.message}
          className="w-44"
        >
          <Input
            {...a11y('unitPrice')}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            className="bg-card text-right tabular-nums"
            {...register('unitPrice')}
          />
        </Field>
        <div className="min-w-0 flex-1 basis-56">
          <PhotoField
            compact
            value={imagePath}
            url={photoUrl}
            alt="Foto del producto libre"
            upload={upload}
            onChange={(path) => setValue('imagePath', path)}
          />
        </div>
      </div>
      {added ? (
        <p role="status" className="text-[13px] font-medium text-ring">
          Añadiste «{added}». Escribe el siguiente o cierra el formulario.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting || photoBusy}>
          Añadir a la proforma
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {added ? 'Cerrar' : 'Cancelar'}
        </Button>
      </div>
    </form>
  )
}
