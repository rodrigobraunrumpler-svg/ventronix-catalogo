'use client'

import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Cabecera compacta (spec §6.1 y §6.2): migas, título y «Volver a Productos». Lo principal de la
// pantalla es la zona de carga, justo debajo.
export function ImportHeader() {
  return (
    <header className="grid gap-3">
      <nav
        aria-label="Migas de pan"
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
      >
        <Link
          href="/products"
          prefetch
          className="font-semibold hover:text-foreground hover:underline"
        >
          Productos
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page" className="text-foreground">
          Carga masiva
        </span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
            Carga masiva de productos
          </h1>
          <p className="max-w-[70ch] text-sm text-muted-foreground">
            Crea y actualiza muchos productos a la vez con un Excel. Antes de guardar verás qué va a
            pasar con cada fila.
          </p>
        </div>
        {/* En el teléfono sobran: ya están las migas y el menú. Así la zona de carga sube. */}
        <Button asChild variant="outline" className="max-sm:hidden">
          <Link href="/products" prefetch>
            <ArrowLeft aria-hidden />
            Volver a Productos
          </Link>
        </Button>
      </div>
    </header>
  )
}

const FAQ = [
  [
    '¿Qué pasa si el código ya existe?',
    'Se actualiza ese producto con los datos del archivo. Antes de guardar verás qué cambia en cada uno.',
  ],
  [
    '¿Puedo actualizar solo los precios?',
    'Sí. Deja en el archivo las columnas Código y Precio con IGV y borra las demás: el resto de los datos se mantiene.',
  ],
  [
    '¿Se borran los productos que no estén en el archivo?',
    'No. La carga masiva nunca borra productos: solo los crea y los actualiza.',
  ],
  [
    '¿Qué formatos de precio acepta?',
    'En soles y con IGV incluido: 1250.50, 1250,50, 1,250.50 o S/ 1250.50. Si tus precios no incluyen IGV, al revisar el archivo puedes pedir que se sume el 18 %.',
  ],
  [
    '¿Cuántos productos puedo subir a la vez?',
    'Hasta 5 000 por archivo, de hasta 4 MB. Si tienes más, divídelos en varios archivos.',
  ],
  [
    '¿Puedo deshacer una importación?',
    'Sí: el comprobante trae la hoja «Para revertir» con los valores anteriores de los productos actualizados. Súbela aquí para dejarlos como estaban. Los productos creados no se borran solos.',
  ],
] as const

// Preguntas frecuentes plegables (spec §6.2), con <details>: accesibles sin JavaScript.
export function ImportFaq() {
  return (
    <section aria-labelledby="import-faq" className="grid gap-3">
      <h2 id="import-faq" className="text-lg font-bold">
        Preguntas frecuentes
      </h2>
      <div className="divide-y rounded-[14px] border bg-card">
        {FAQ.map(([question, answer]) => (
          <details key={question} role="group" className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-semibold [&::-webkit-details-marker]:hidden">
              {question}
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>
            <p className="max-w-[80ch] pb-4 text-sm text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
