import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Baileys (WhatsApp) es ESM con WebAssembly: se carga tal cual en el servidor, sin empaquetar.
  serverExternalPackages: ['baileys'],
  // El PDF de la proforma lee sus fuentes y el logotipo del disco en el servidor: se incluyen en la
  // función de Vercel que atiende /products.
  outputFileTracingIncludes: {
    '/products': [
      './src/features/proforma/document/fonts/**',
      './public/brand/ventronix-logo-proforma.jpg',
      './public/brand/marcas.jpg',
    ],
  },
}

export default nextConfig
