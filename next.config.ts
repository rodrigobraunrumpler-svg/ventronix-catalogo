import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Baileys (WhatsApp) es ESM con WebAssembly y ExcelJS es CommonJS con dependencias opcionales: los
  // dos se cargan tal cual en el servidor, sin empaquetar.
  serverExternalPackages: ['baileys', 'exceljs'],
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
