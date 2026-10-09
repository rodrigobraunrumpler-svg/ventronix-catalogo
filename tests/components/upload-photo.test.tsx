import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadPhoto } from '@/lib/use-photos'

const upload = vi.fn(async (path: string) => ({ data: { path }, error: null }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ upload }) } }),
}))

beforeEach(() => {
  upload.mockClear()
  // El navegador lee la foto y la redibuja en un canvas; aquí basta con simularlo.
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 1200, height: 800, close: vi.fn() })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['jpg'], { type: 'image/jpeg' })),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const file = new File(['png'], 'foto.png', { type: 'image/png' })
const uploaded = () => upload.mock.calls.map(([path]) => path).sort()

describe('uploadPhoto', () => {
  it('un producto del catálogo guarda la foto de 600 px, para su ficha, y su miniatura', async () => {
    const path = await uploadPhoto('products', file)
    expect(path).toMatch(/^products\/[0-9a-f-]{36}\.jpg$/)
    expect(uploaded()).toEqual([path, path.replace(/\.jpg$/, '.thumb.jpg')].sort())
  })

  it('un producto libre guarda solo la miniatura: es la única que se ve', async () => {
    const path = await uploadPhoto('lines', file)
    expect(path).toMatch(/^lines\/[0-9a-f-]{36}\.jpg$/)
    expect(uploaded()).toEqual([path.replace(/\.jpg$/, '.thumb.jpg')])
  })
})
