import type { Metadata } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { AppProviders } from '@/components/app-providers'
import './globals.css'

const sans = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] })
const mono = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Catálogo', template: '%s · Catálogo' },
  description: 'Catálogo privado de productos y categorías.',
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
