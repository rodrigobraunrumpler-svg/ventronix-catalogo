'use client'

import { ImageIcon, LoaderCircle } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
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

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span id={`${id}-label`} className="text-sm font-medium text-foreground">
          Foto
        </span>
        <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">Opcional</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={cn(
            'relative grid shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted text-muted-foreground',
            compact ? 'size-12' : 'size-28',
          )}
        >
          {shown ? (
            <Image
              src={shown}
              alt={alt}
              width={compact ? 48 : 112}
              height={compact ? 48 : 112}
              unoptimized
              className={cn('size-full object-contain', uploading && 'opacity-50')}
            />
          ) : (
            <ImageIcon className={compact ? 'size-5' : 'size-8'} aria-hidden />
          )}
          {uploading ? (
            <LoaderCircle className="absolute size-6 animate-spin text-foreground" aria-hidden />
          ) : null}
        </span>
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              aria-describedby={`${id}-help`}
              onClick={() => input.current?.click()}
            >
              {value ? 'Cambiar foto' : 'Elegir foto'}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                disabled={uploading}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setLocal(null)
                  onChange(null)
                }}
              >
                Quitar foto
              </Button>
            ) : null}
          </div>
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            JPG, PNG o WebP. Antes de guardarla se reduce a 600 px (unos 50 KB).
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
        </div>
      </div>
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
