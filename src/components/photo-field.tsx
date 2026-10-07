'use client'

import { ImageIcon, LoaderCircle } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PHOTO_TYPES } from '@/lib/photos'
import { UnreadablePhotoError } from '@/lib/use-photos'
import { cn } from '@/lib/utils'

type PhotoFieldProps = {
  value: string | null
  // URL firmada de la foto guardada (usePhotoUrl).
  url: string | undefined
  alt: string
  upload: (file: File) => Promise<string>
  onChange: (path: string | null) => void
  // Más pequeño, para el formulario del producto libre.
  compact?: boolean
}

// «Foto (opcional)» (spec de productos libres §4.7): vista previa, elegir, cambiar o quitar. Se sube
// al elegirla (plan, decisión 13) y se ve al instante con una copia local (decisión 25).
export function PhotoField({
  value,
  url,
  alt,
  upload,
  onChange,
  compact = false,
}: PhotoFieldProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // La copia local de la foto elegida: path es null mientras se sube.
  const [local, setLocal] = useState<{ url: string; path: string | null } | null>(null)
  const localUrl = local?.url
  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl)
    },
    [localUrl],
  )
  const shown =
    local && (local.path === null || local.path === value) ? local.url : value ? url : undefined

  async function pick(file: File | undefined) {
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) {
      setError('Elige una foto JPG, PNG o WebP.')
      return
    }
    setError(null)
    setUploading(true)
    setLocal({ url: URL.createObjectURL(file), path: null })
    try {
      const path = await upload(file)
      setLocal((current) => current && { ...current, path })
      onChange(path)
    } catch (failure) {
      setLocal(null)
      setError(
        failure instanceof UnreadablePhotoError
          ? 'No pudimos leer esta foto. Prueba con otra en JPG, PNG o WebP.'
          : 'No pudimos subir la foto. Revisa tu conexión e inténtalo de nuevo.',
      )
    } finally {
      setUploading(false)
    }
  }

  const preview = (
    <span
      data-slot="photo-preview"
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden border bg-muted text-muted-foreground',
        compact ? 'size-10.5 rounded-lg' : 'size-28 rounded-xl',
      )}
    >
      {shown ? (
        <Image
          src={shown}
          alt={alt}
          width={compact ? 42 : 112}
          height={compact ? 42 : 112}
          unoptimized
          className={cn('size-full object-contain', uploading && 'opacity-50')}
        />
      ) : (
        <ImageIcon className={compact ? 'size-4.5' : 'size-8'} aria-hidden />
      )}
      {uploading ? (
        <LoaderCircle
          className={cn('absolute animate-spin text-foreground', compact ? 'size-4.5' : 'size-6')}
          aria-hidden
        />
      ) : null}
    </span>
  )

  // Compacto (producto libre): «Cambiar» y «Quitar» a la altura de los campos de al lado.
  const buttons = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={uploading}
        aria-label={compact && value ? 'Cambiar foto' : undefined}
        aria-describedby={`${id}-help`}
        className={cn(compact && 'h-10.5')}
        onClick={() => input.current?.click()}
      >
        {value ? (compact ? 'Cambiar' : 'Cambiar foto') : 'Elegir foto'}
      </Button>
      {value ? (
        <Button
          type="button"
          variant="ghost"
          disabled={uploading}
          aria-label={compact ? 'Quitar foto' : undefined}
          className={cn(
            'text-destructive hover:bg-destructive/10 hover:text-destructive',
            compact && 'h-10.5 px-3',
          )}
          onClick={() => {
            setLocal(null)
            onChange(null)
          }}
        >
          {compact ? 'Quitar' : 'Quitar foto'}
        </Button>
      ) : null}
    </div>
  )

  const notes = (
    <>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {compact
          ? 'JPG, PNG o WebP'
          : 'JPG, PNG o WebP. Antes de guardarla se reduce a 600 px (unos 50 KB).'}
      </p>
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {uploading ? (
        <p role="status" className="sr-only">
          Subiendo la foto…
        </p>
      ) : null}
    </>
  )

  return (
    <div className={cn('grid', compact ? 'gap-1.5' : 'gap-2')}>
      {compact ? (
        // Igual que las etiquetas del formulario del producto libre: la fila queda a su altura.
        <div className="flex items-center gap-1.5">
          <Label id={`${id}-label`} className="text-[13px] font-semibold text-foreground">
            Foto
          </Label>
          <span className="text-[13px] text-muted-foreground">(opcional)</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span id={`${id}-label`} className="text-sm font-medium text-foreground">
            Foto
          </span>
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">Opcional</span>
        </div>
      )}
      {compact ? (
        <>
          <div className="flex items-center gap-2">
            {preview}
            {buttons}
          </div>
          {notes}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {preview}
          <div className="grid gap-2">
            {buttons}
            {notes}
          </div>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        tabIndex={-1}
        aria-labelledby={`${id}-label`}
        className="sr-only"
        onChange={(event) => {
          void pick(event.target.files?.[0])
          // Elegir el mismo archivo otra vez vuelve a avisar.
          event.target.value = ''
        }}
      />
    </div>
  )
}
