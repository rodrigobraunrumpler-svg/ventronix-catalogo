import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // El PDF de la proforma lee sus fuentes y el logotipo del disco en el servidor: se incluyen en la
  // función de Vercel que atiende /products.
  outputFileTracingIncludes: {
    '/products': [
      './src/features/proforma/document/fonts/**',
      './public/brand/ventronix-wordmark.png',
    ],
  },
}

export default nextConfig
