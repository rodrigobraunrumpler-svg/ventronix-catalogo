import type { MetadataRoute } from 'next'

// Permite instalar el catálogo en el celular («Añadir a pantalla de inicio») con la marca.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ventronix Catálogo',
    short_name: 'Ventronix',
    description: 'Catálogo privado de productos y precios de Ventronix.',
    lang: 'es',
    start_url: '/products',
    display: 'standalone',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
