'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionResult } from '@/lib/action-result'
import { categorySchema } from '../../schemas'
import type { Category, CategoryInput } from '../../types'

type CategoryFormProps = {
  defaultName?: string
  onSubmit: (values: CategoryInput) => Promise<ActionResult<Category>>
  onSaved: (category: Category) => void
  onCancel?: () => void
}

export function CategoryForm({ defaultName, onSubmit, onSaved, onCancel }: CategoryFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: defaultName ?? '' },
  })

  const submit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await onSubmit(values)
    if (result.ok) {
      onSaved(result.data)
      return
    }
    const fieldMessage = result.error.fieldErrors?.name?.[0]
    if (fieldMessage) setError('name', { message: fieldMessage }, { shouldFocus: true })
    else setServerError(result.error.message)
  })

  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      {serverError ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          {serverError}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="category-name">Nombre de la categoría</Label>
        <Input
          id="category-name"
          autoComplete="off"
          maxLength={120}
          placeholder="Por ejemplo, Impresoras"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'category-name-error' : 'category-name-help'}
          {...register('name')}
        />
        {errors.name ? (
          <p id="category-name-error" className="text-xs font-medium text-destructive">
            {errors.name.message}
          </p>
        ) : (
          <p id="category-name-help" className="text-xs text-muted-foreground">
            Usa un nombre breve y fácil de reconocer.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {defaultName === undefined ? 'Crear categoría' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
