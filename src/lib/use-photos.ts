'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  fitWithin,
  PHOTO_BUCKET,
  PHOTO_MAX_SIDE,
  PHOTO_QUALITY,
  PHOTO_THUMB_SIDE,
  thumbPath,
  type PhotoFolder,
} from './photos'

// El navegador no pudo leer la foto: no es una imagen o no conoce su formato.
export class UnreadablePhotoError extends Error {}

// Un tamaño en JPEG, con fondo blanco: un PNG transparente no queda negro.
function toJpeg(image: ImageBitmap, max: number) {
  const { width, height } = fitWithin(image.width, image.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new UnreadablePhotoError()
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new UnreadablePhotoError())),
      'image/jpeg',
      PHOTO_QUALITY,
    ),
  )
}

// La foto se lee una vez y se sube con la sesión de la cuenta (spec §8). La de un producto del
// catálogo, en dos tamaños: 600 px para su ficha y 200 px para el PDF y las listas. La de un
// producto libre, solo la de 200 px: es la única que se ve (su línea, el formulario y el PDF). El
// original no se guarda. Cada foto es un archivo nuevo: las proformas anteriores conservan la suya.
// Devuelve la ruta de la foto (la de 600 px); la miniatura vive a su lado.
export async function uploadPhoto(folder: PhotoFolder, file: File) {
  const image = await createImageBitmap(file).catch(() => {
    throw new UnreadablePhotoError()
  })
  const path = `${folder}/${crypto.randomUUID()}.jpg`
  const sizes: [string, number][] = [[thumbPath(path), PHOTO_THUMB_SIDE]]
  if (folder === 'products') sizes.push([path, PHOTO_MAX_SIDE])
  const blobs = await Promise.all(sizes.map(([, side]) => toJpeg(image, side))).finally(() =>
    image.close(),
  )
  const storage = createClient().storage.from(PHOTO_BUCKET)
  const options = { contentType: 'image/jpeg' }
  const results = await Promise.all(
    sizes.map(([name], index) => storage.upload(name, blobs[index], options)),
  )
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
  return path
}

// Borra fotos que ya no se usan, con sus miniaturas. La base solo deja borrar las que no usa ningún
// producto ni ninguna proforma guardada; si no se puede, la foto se queda sin avisar: no es un error
// de quien usa la app.
export async function discardPhotos(paths: string[]) {
  if (paths.length === 0) return
  await createClient()
    .storage.from(PHOTO_BUCKET)
    .remove(paths.flatMap((path) => [path, thumbPath(path)]))
    .catch(() => undefined)
}

// URL firmada de una hora para ver una foto del bucket privado. Una consulta por foto: añadir una
// línea no vuelve a pedir ni a descargar las demás (plan, decisión 11).
export function usePhotoUrl(path: string | null) {
  return useQuery({
    queryKey: ['photos', path],
    queryFn: async () => {
      const { data, error } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .createSignedUrl(path ?? '', 3600)
      if (error) throw error
      return data.signedUrl
    },
    enabled: path !== null,
    staleTime: 50 * 60 * 1000,
  }).data
}
