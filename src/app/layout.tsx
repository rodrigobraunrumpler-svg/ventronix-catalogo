import type { Metadata } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { AppProviders } from '@/components/app-providers'
import './globals.css'

const sans = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] })
const mono = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] })

// Base de las URL absolutas (imagen al compartir): en Vercel, el dominio de producción.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Catálogo · Ventronix', template: '%s · Ventronix' },
  description: 'Catálogo privado de productos y precios de Ventronix.',
  applicationName: 'Ventronix Catálogo',
  // App privada: fuera de los buscadores. La vista previa al compartir el enlace sí funciona.
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    locale: 'es_PE',
    siteName: 'Ventronix',
    title: 'Ventronix · Catálogo comercial',
    description: 'Catálogo privado de productos y precios.',
  },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full text-sm">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
