import { Brand } from '@/components/brand'
import { CATEGORY_PALETTE } from '@/features/catalog/categories/theme'

// Ilustración: una hoja de precios como la que gestiona la app. Datos de ejemplo, no del catálogo.
const rows = [
  {
    name: 'Fotocopiadora A3 multifunción',
    code: 'FOT-001',
    category: 'Fotocopiadoras',
    color: CATEGORY_PALETTE[0],
    price: '6,850.00',
  },
  {
    name: 'Laptop de 14 pulgadas',
    code: 'LAP-001',
    category: 'Laptops',
    color: CATEGORY_PALETTE[3],
    price: '2,590.00',
  },
  {
    name: 'Impresora láser monocromática',
    code: 'IMP-001',
    category: 'Impresoras',
    color: CATEGORY_PALETTE[2],
    price: '890.00',
  },
]

export function LoginShowcase() {
  return (
    <div className="hidden bg-sidebar-primary text-white lg:flex lg:flex-col lg:p-12 xl:p-16">
      <div className="-ml-2">
        <Brand inverted />
      </div>

      <div className="my-auto grid gap-12 py-12">
        <div className="grid max-w-[460px] gap-4">
          <p className="text-[40px] leading-[1.08] font-extrabold tracking-[-0.03em] text-balance xl:text-[46px]">
            Tus productos y precios, siempre en orden.
          </p>
          <p className="max-w-[380px] text-base text-white/70">
            Consulta y actualiza tu catálogo desde la oficina o desde el celular.
          </p>
        </div>

        <div
          aria-hidden
          className="w-full max-w-[520px] overflow-hidden rounded-2xl bg-card text-foreground shadow-[0_28px_70px_-24px_rgba(0,0,0,0.6)]"
        >
          <div className="flex items-center gap-2.5 border-b px-5 py-3.5">
            <span className="text-sm font-bold">Lista de precios</span>
            <span className="rounded-full bg-muted px-2 font-mono text-xs font-medium text-muted-foreground">
              {rows.length}
            </span>
          </div>
          <ul>
            {rows.map((row) => (
              <li
                key={row.code}
                className="flex items-center justify-between gap-4 border-b px-5 py-3.5 last:border-b-0"
              >
                <div className="grid min-w-0 gap-1.5">
                  <span className="truncate text-sm font-semibold">{row.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-md border bg-background/60 px-1.5 font-mono text-[11px] font-medium text-secondary-foreground">
                      {row.code}
                    </span>
                    <span
                      className="inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[11px] font-semibold"
                      style={{ backgroundColor: row.color.bg, color: row.color.fg }}
                    >
                      <span className="size-1.5 rounded-full bg-current" />
                      {row.category}
                    </span>
                  </span>
                </div>
                <span className="shrink-0 text-sm whitespace-nowrap tabular-nums">
                  <span className="mr-1 text-xs font-medium text-muted-foreground">S/</span>
                  <span className="font-bold">{row.price}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
