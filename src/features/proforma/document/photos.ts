import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PHOTO_BUCKET, thumbPath } from '@/lib/photos'
import type { Database } from '@/lib/supabase/database.types'

// Un JPEG empieza con FF D8 FF: react-pdf no dibuja otra cosa con format 'jpg'.
const isJpeg = (bytes: Buffer) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

// ponytail: tope fijo de bytes de fotos por PDF. Con miniaturas de unos 12 KB caben unas 200; las
// demás se dejan fuera para que el PDF en base64 no pase los 4,5 MB de una respuesta de Vercel.
// Si hiciera falta más, el PDF tendría que viajar por Storage en vez de en la respuesta.
export const PDF_PHOTO_BUDGET = 2_500_000

// Las fotos del PDF se descargan del bucket con la sesión de la cuenta (spec §7): la miniatura y,
// si faltara, la de 600 px. Una que no se puede leer se deja fuera: la fila sale sin foto y el PDF
// se genera igual (plan, decisión 12).
export async function loadPhotos(
  supabase: SupabaseClient<Database>,
  paths: (string | null)[],
  budget = PDF_PHOTO_BUDGET,
): Promise<Map<string, Buffer>> {
  const storage = supabase.storage.from(PHOTO_BUCKET)
  async function read(path: string) {
    for (const candidate of [thumbPath(path), path]) {
      const { data } = await storage.download(candidate)
      const bytes = data ? Buffer.from(await data.arrayBuffer()) : null
      if (bytes && isJpeg(bytes)) return bytes
    }
    console.error('[proforma] foto omitida:', path)
    return null
  }
  const unique = [...new Set(paths.filter((path): path is string => path !== null))]
  const loaded = await Promise.all(unique.map(read))
  // En el orden de las líneas: si hay que dejar fotos fuera, son las últimas.
  const photos = new Map<string, Buffer>()
  let used = 0
  unique.forEach((path, index) => {
    const bytes = loaded[index]
    if (!bytes || used + bytes.length > budget) return
    used += bytes.length
    photos.set(path, bytes)
  })
  return photos
}
