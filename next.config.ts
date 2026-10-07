import type { NextConfig } from 'next'

// El PDF de la proforma lee sus fuentes y el logotipo del disco en el servidor: se incluyen en las
// funciones de Vercel que lo generan.
const PROFORMA_FILES = [
  './src/features/proforma/document/fonts/**',
  './public/brand/ventronix-logo-proforma.jpg',
  './public/brand/marcas.jpg',
]

const nextConfig: NextConfig = {
  // Baileys (WhatsApp) es ESM con WebAssembly y ExcelJS es CommonJS con dependencias opcionales: los
  // dos se cargan tal cual en el servidor, sin empaquetar.
  serverExternalPackages: ['baileys', 'exceljs'],
  experimental: {
    // La carga masiva sube un Excel de hasta 4 MB, más lo que añade el FormData; Vercel admite
    // hasta 4,5 MB por petición (spec del Excel §3 y §10).
    serverActions: { bodySizeLimit: '4.5mb' },
  },
  outputFileTracingIncludes: {
    '/products': PROFORMA_FILES,
    '/proformas': PROFORMA_FILES,
    // «Descargar mi catálogo» de la carga masiva es el reporte completo, con su logotipo.
    '/products/import': ['./public/brand/ventronix-logo-proforma.jpg'],
  },
}

export default nextConfig
