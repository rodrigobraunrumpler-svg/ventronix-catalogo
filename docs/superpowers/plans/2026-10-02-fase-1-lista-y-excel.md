# Fase 1: indicadores, filtro de fecha, orden y Excel de salida — Implementation Plan

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:executing-plans (ejecución inline: el usuario pidió no usar subagentes). Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Goal:** Que la lista de productos tenga indicadores clicables, filtro por fecha de registro o de modificación, orden, «Copiar enlace» y dos Excel de salida (reporte completo y lista de precios), todo en días de Lima.

**Architecture:**
- **Base de datos.** Una función SQL, `filter_products`, concentra búsqueda, filtros y orden. De ella leen la lista (`search_products`) y los Excel (`export_products`), así que nunca dan resultados distintos. `catalog_stats` da las cifras de los indicadores.
- **Navegador.** El estado vive en la URL (nuqs). Los rangos de fecha se convierten en días concretos de Lima antes de pedir datos.
- **Excel.** Los libros se arman en el servidor con ExcelJS, dentro de una Server Action que carga los módulos con `import()` dinámico. Llegan en base64, como el PDF de la proforma.

**Tech Stack:** Next.js 16 (Server Actions), Supabase/Postgres (funciones SQL `security invoker`), nuqs 2, TanStack Query 5, Radix (`Popover`, `DropdownMenu`), ExcelJS 4.4.0 (nueva), Zod 4, Vitest + Testing Library, Playwright.

**Spec:** [Filtro de fecha, orden, Excel y carga masiva](../specs/2026-10-02-excel-reporte-y-carga-masiva-design.md), fase 1: §3, §4, §5, §9.1, §9.2 (fase 1), §10–§13.

## Global Constraints

- **Textos:** exactamente los de la spec (§4, §5.1, §12), en español.
- **Fechas:**
  - Días de **Lima** (`America/Lima`, UTC−5) en filtros, indicadores, filas, ficha y Excel.
  - En la base, un día empieza en `dia::timestamp at time zone 'America/Lima'`.
- **Dinero:**
  - Texto exacto (`"1180.00"`) o céntimos (`bigint`), con los módulos de la proforma (`parseCents`, `applyTax`, `TAX_CONFIG`).
  - En Excel se escribe como número, a partir del texto exacto.
- **ExcelJS:**
  - Solo en el servidor: los módulos que la usan llevan `import 'server-only'`.
  - La acción los carga con `await import(...)` y ExcelJS va en `serverExternalPackages`.
- **Base de datos:**
  - Sin tablas ni índices nuevos (spec §9.1).
  - La migración es compatible con el código publicado: la llamada antigua a `search_products` sigue funcionando.
  - Las funciones nuevas repiten los permisos de la actual: `revoke execute … from public, anon` y `grant execute … to authenticated`.
- **URL:** con nuqs.
  - Claves `dateBy`, `date`, `from`, `to` y `sort`.
  - Los valores por defecto (`created`, `name`) no se escriben.
  - Un valor inválido se ignora.
- **Altura en laptop:** el e2e «en un laptop de 1366×768 se ven al menos 6 productos sin bajar» sigue en verde después de las tareas 3, 5 y 10.
- **Pruebas:**
  - Solo contra el Supabase local.
  - Las e2e arrancan su propio `pnpm dev` en el puerto 4100.
- **Commits:**
  - En `main`, con una sola línea de asunto: sin cuerpo y sin `Co-Authored-By`.
  - Archivos añadidos por nombre.
- **Para publicar:**
  1. El usuario aplica la migración en la nube con `pnpm db:push`.
  2. Push.
  3. En Vercel, **Create Deployment**.

## Decisiones del plan

Decisiones tomadas al revisar el plan contra el código. La spec ya se actualizó con las tres primeras (§3, §5.1, §9.1).

1. **El orden va dentro de `filter_products`.** La función recibe `sort` y numera las filas (`sort_position`), así el orden se escribe una sola vez (spec §3: «una sola función SQL con filtros y orden»).
2. **Empates:** se resuelven por nombre y, al final, por `id`. Con el mismo precio se lee en orden alfabético, y la paginación sigue siendo estable.
3. **Botón «Excel».** Muestra «Excel» y tiene «Descargar Excel» como nombre accesible y título. El selector de orden usa `field-sizing: content` (Chrome y Edge): mide lo que mide la opción elegida. Con eso, la cabecera de la lista cabe en una línea en 1366 px, junto a la paginación. Con el texto largo no cabía, y se perdía una fila.
4. **`price-columns.ts` fuera de `excel/` y sin `server-only`.** La pantalla de carga masiva de la fase 2, que corre en el navegador, mostrará los mismos títulos de precio.
5. **Binarios de ExcelJS como `ArrayBuffer`.**
   - **Problema:** ExcelJS 4.4.0 tipa sus binarios como `ArrayBuffer`. Con TypeScript 5.9 y `lib: esnext`, un `Buffer` de Node no compila en `addImage` ni en `xlsx.load`.
   - **Solución:** se pasa `new Uint8Array(buffer).buffer`, una copia exacta.
   - **Comprobado** en una carpeta aparte: compila, y el logotipo se relee byte a byte igual.
   - **E2E:** leen con `xlsx.readFile(ruta)`.

## Review Focus

1. **Medianoche de Lima frente a UTC.** Un producto creado entre las 19:00 y las 23:59 de Lima (00:00–04:59 UTC del día siguiente) cae en su día de Lima en:
   - los filtros;
   - los indicadores;
   - la fecha de la fila;
   - el Excel.

   Pruebas en las tareas 1 (límites SQL), 2 (`limaDay` hasta las 23:59:59) y 8 (fecha en el Excel).
2. **Enlaces viejos o editados a mano**, como `?date=semana&sort=precio&from=2026-02-30`. Se ignoran y la lista muestra todo, sin errores. Pruebas en las tareas 2 (parsers) y 6 (e2e).
3. **Paginar con orden por precio o fecha cuando hay empates.** Ninguna página repite ni salta productos. Prueba en la tarea 1.
4. **Catálogo vacío o filtros sin resultados:**
   - los indicadores en 0 quedan desactivados;
   - «Descargar Excel» queda desactivado;
   - la acción responde con un mensaje claro.

   Pruebas en las tareas 3 y 10.
5. **Textos que Excel podría ejecutar** (`=`, `+`, `-`, `@`), tildes y nombres de archivo sin símbolos. Pruebas en las tareas 8 y 10.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
| --- | --- | --- |
| `supabase/migrations/202610020001_product_list_filters.sql` | `filter_products`, `search_products` con fecha y orden, `export_products`, `catalog_stats` y permisos | 1 |
| `src/lib/supabase/database.types.ts` | Tipos generados | 1 |
| `src/features/catalog/list-options.ts` | Días de Lima, rangos, textos, fecha de la fila, `toProductQuery` | 2 |
| `src/features/catalog/search-params.ts` | Parsers de la URL | 2 |
| `src/features/catalog/types.ts` | `ProductFilters`, `ProductQuery`, `CatalogStats` | 2, 3 |
| `src/features/catalog/products/queries.ts` | `listProducts` con fecha y orden, `getCatalogStats`, `exportProductRows` | 2, 3, 10 |
| `src/features/catalog/query-keys.ts` | Claves de la lista y de los indicadores | 2, 3 |
| `src/features/catalog/products/hooks.ts` | `useProducts` con `toProductQuery`, `useCatalogStats` | 2, 3 |
| `src/features/proforma/hooks.ts` | Enter en el buscador pide lo mismo que la lista | 2 |
| `src/features/catalog/products/components/catalog-stats.tsx` | Indicadores clicables | 3 |
| `src/features/catalog/components/catalog-screen.tsx` | Indicadores junto al título | 3 |
| `src/features/catalog/products/components/date-filter.tsx` | Control del filtro de fecha | 4 |
| `src/features/catalog/products/components/product-filters.tsx` | Filtro de fecha en la barra y «Limpiar filtros» | 4 |
| `src/features/catalog/products/components/product-list.tsx` | Cabecera (chip, enlace, orden, Excel), vacío por fecha y fecha en las filas | 4, 5, 10 |
| `src/features/catalog/products/components/sort-select.tsx` | Selector de orden | 5 |
| `src/features/catalog/products/components/product-detail.tsx` | Fechas en la ficha | 5 |
| `tests/setup.ts` | `ResizeObserver` para Radix en jsdom | 4 |
| `src/lib/files.ts` | `base64ToFile`, `downloadFile` y tipos MIME compartidos | 7 |
| `src/features/proforma/document/files.ts` | Reexporta desde `src/lib/files.ts` | 7 |
| `src/features/proforma/money.ts` | `centsToDecimal` | 7 |
| `src/features/catalog/price-columns.ts` | Títulos y valores de precio según el IGV | 7 |
| `src/features/catalog/excel/category-summary.ts` | Resumen por categoría en céntimos | 7 |
| `src/features/catalog/excel/theme.ts` | Colores, formatos, estilos de fila y logotipo | 7 |
| `src/features/catalog/excel/report.ts` | Reporte completo | 8 |
| `src/features/catalog/excel/price-list.ts` | Lista de precios | 9 |
| `src/features/catalog/excel/export-request.ts` | Validación, textos, nombre de archivo y URL de la vista | 10 |
| `src/features/catalog/products/excel-actions.ts` | Server Action `exportProducts` (spec §9.2) | 10 |
| `src/features/catalog/products/components/export-menu.tsx` | Botón «Excel» con su menú | 10 |
| `next.config.ts`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | ExcelJS y el `override` de `uuid` | 7 |
| `docs/deployment.md` | Migración y comprobaciones de la fase 1 | 11 |

---

### Task 1: Funciones SQL de la lista

**Files:**
- Create: `supabase/migrations/202610020001_product_list_filters.sql`
- Modify: `src/lib/supabase/database.types.ts` (generado)
- Test: `tests/integration/catalog-list-filters.test.ts`

**Interfaces:**
- Produces (SQL, todas `stable`, `security invoker` y solo para `authenticated`):
  - `filter_products(search text, category uuid, date_by text, date_from date, date_to date, sort text)` → tabla `(id, code, name, description, category_id, unit_price numeric, created_at, updated_at, category_name, sort_position bigint)`.
  - `search_products(search, category, page, page_size, date_by, date_from, date_to, sort)` → `json { total, items[] }`, con los ítems de hoy (`unit_price` en texto).
  - `export_products(search, category, date_by, date_from, date_to, sort, max_rows)` → `json`, un array de ítems.
  - `catalog_stats()` → `json { products, created_this_month, updated_last_7_days }`.

- [ ] **Step 1: Escribir las pruebas de integración**

`tests/integration/catalog-list-filters.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const password = 'filtros-clave-123'
const owner = { email: 'filtros-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'filtros-intruso@catalogo.test' }

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient
let laptops: string

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  await ensureUser({ password, ...intruder })
  supabase = await signedInClient(owner.email, password)
  outsider = await signedInClient(intruder.email, password)
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCatalog(db)
  const { rows } = await db.query<{ id: string }>(
    "insert into public.categories (name) values ('Laptops') returning id",
  )
  laptops = rows[0].id
})

// Fechas exactas: el disparador de updated_at solo actúa al actualizar, no al insertar.
async function insert(
  code: string,
  name: string,
  price: string,
  created: string,
  updated = created,
) {
  await db.query(
    `insert into public.products (code, name, category_id, unit_price, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [code, name, laptops, price, created, updated],
  )
}

type Item = { code: string; unit_price: string; category_name: string }
type Page = { total: number; items: Item[] }
type Stats = { products: number; created_this_month: number; updated_last_7_days: number }

async function call<T>(fn: string, args: Record<string, unknown> = {}, client = supabase) {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw error
  return data as T
}
const codes = (items: Item[]) => items.map((item) => item.code)
const secondBefore = (instant: string) => new Date(Date.parse(instant) - 1000).toISOString()

describe('search_products con fecha y orden', () => {
  it('filtra por días de Lima: el límite es la medianoche de Lima, no la de UTC', async () => {
    await insert('A', 'Antes', '10', '2026-09-30T23:59:59-05:00')
    await insert('B', 'Inicio', '10', '2026-10-01T00:00:00-05:00')
    await insert('C', 'Final', '10', '2026-10-01T23:59:59-05:00')
    await insert('D', 'Después', '10', '2026-10-02T00:00:00-05:00')
    const page = await call<Page>('search_products', {
      date_from: '2026-10-01',
      date_to: '2026-10-01',
    })
    expect(codes(page.items).sort()).toEqual(['B', 'C'])
  })

  it('con date_by = updated usa la fecha de modificación', async () => {
    await insert('A', 'Viejo editado', '10', '2026-01-10T10:00:00-05:00', '2026-10-01T10:00:00-05:00')
    await insert('B', 'Nuevo', '10', '2026-10-01T10:00:00-05:00')
    await insert('C', 'Viejo', '10', '2026-01-10T10:00:00-05:00')
    const day = { date_from: '2026-10-01', date_to: '2026-10-01' }
    expect(codes((await call<Page>('search_products', day)).items)).toEqual(['B'])
    const updated = await call<Page>('search_products', { ...day, date_by: 'updated' })
    expect(codes(updated.items).sort()).toEqual(['A', 'B'])
  })

  it('acepta rangos abiertos por un lado', async () => {
    await insert('A', 'Uno', '10', '2026-09-01T12:00:00-05:00')
    await insert('B', 'Dos', '10', '2026-10-01T12:00:00-05:00')
    const from = await call<Page>('search_products', { date_from: '2026-09-15' })
    expect(codes(from.items)).toEqual(['B'])
    const to = await call<Page>('search_products', { date_to: '2026-09-15' })
    expect(codes(to.items)).toEqual(['A'])
  })

  it.each([
    ['name', ['A', 'B', 'C']],
    ['newest', ['C', 'A', 'B']],
    ['updated', ['B', 'C', 'A']],
    ['price-asc', ['B', 'C', 'A']],
    ['price-desc', ['A', 'C', 'B']],
  ])('ordena por %s', async (sort, expected) => {
    await insert('A', 'Alfa', '300', '2026-10-01T10:00:00-05:00')
    await insert('B', 'Beta', '100', '2026-09-01T10:00:00-05:00', '2026-10-03T10:00:00-05:00')
    await insert('C', 'Gamma', '200', '2026-10-02T10:00:00-05:00')
    expect(codes((await call<Page>('search_products', { sort })).items)).toEqual(expected)
  })

  it('con empates, las páginas no repiten ni saltan productos', async () => {
    for (const code of ['P1', 'P2', 'P3', 'P4', 'P5']) {
      await insert(code, 'Igual', '50', '2026-10-01T10:00:00-05:00')
    }
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        call<Page>('search_products', { sort: 'price-asc', page, page_size: 2 }),
      ),
    )
    const all = pages.flatMap((page) => codes(page.items))
    expect(all).toHaveLength(5)
    expect(new Set(all).size).toBe(5)
    expect(pages[0].total).toBe(5)
  })

  it('la llamada de antes (sin fecha ni orden) sigue igual: por nombre', async () => {
    await insert('B', 'Beta', '10', '2026-10-01T10:00:00-05:00')
    await insert('A', 'Alfa', '25.50', '2026-10-01T10:00:00-05:00')
    const page = await call<Page>('search_products', { search: '', page: 1, page_size: 50 })
    expect(page.total).toBe(2)
    expect(codes(page.items)).toEqual(['A', 'B'])
    expect(page.items[0]).toMatchObject({ category_name: 'Laptops', unit_price: '25.50' })
  })
})

describe('export_products', () => {
  it('devuelve lo filtrado, en el orden pedido y hasta max_rows', async () => {
    await insert('A', 'Alfa', '300', '2026-10-01T10:00:00-05:00')
    await insert('B', 'Beta', '100', '2026-10-01T10:00:00-05:00')
    await insert('C', 'Gamma', '200', '2026-10-02T10:00:00-05:00')
    const rows = await call<Item[]>('export_products', { sort: 'price-asc' })
    expect(codes(rows)).toEqual(['B', 'C', 'A'])
    expect(rows[0]).toMatchObject({ category_name: 'Laptops', unit_price: '100' })
    const capped = await call<Item[]>('export_products', { sort: 'price-asc', max_rows: 2 })
    expect(codes(capped)).toEqual(['B', 'C'])
    const dated = await call<Item[]>('export_products', { date_from: '2026-10-02' })
    expect(codes(dated)).toEqual(['C'])
  })

  it('sin productos da una lista vacía, y una cuenta sin permiso no ve nada', async () => {
    expect(await call('export_products')).toEqual([])
    await insert('A', 'Alfa', '300', '2026-10-01T10:00:00-05:00')
    expect(await call('export_products', {}, outsider)).toEqual([])
  })
})

describe('catalog_stats', () => {
  // Inicio del mes y de los últimos 7 días en Lima, calculados por la base: no dependen del reloj
  // del equipo.
  async function limaStarts() {
    const { rows } = await db.query<{ month: string; week: string }>(
      `select to_char(date_trunc('month', now() at time zone 'America/Lima'), 'YYYY-MM-DD') as month,
              to_char((now() at time zone 'America/Lima')::date - 6, 'YYYY-MM-DD') as week`,
    )
    return {
      month: `${rows[0].month}T00:00:00-05:00`,
      week: `${rows[0].week}T00:00:00-05:00`,
    }
  }

  it('cuenta los registrados desde el día 1 del mes de Lima', async () => {
    const { month } = await limaStarts()
    await insert('A', 'Primer instante del mes', '10', month)
    await insert('B', 'Último instante del mes anterior', '10', secondBefore(month))
    expect(await call<Stats>('catalog_stats')).toMatchObject({
      products: 2,
      created_this_month: 1,
    })
  })

  it('cuenta los modificados en los últimos 7 días de Lima (hoy y los 6 anteriores)', async () => {
    const { week } = await limaStarts()
    await insert('A', 'Dentro', '10', '2020-01-01T10:00:00-05:00', week)
    await insert('B', 'Fuera', '10', '2020-01-01T10:00:00-05:00', secondBefore(week))
    expect((await call<Stats>('catalog_stats')).updated_last_7_days).toBe(1)
  })

  it('una cuenta sin permiso ve todo en cero', async () => {
    await insert('A', 'Alfa', '10', '2026-10-01T10:00:00-05:00')
    expect(await call<Stats>('catalog_stats', {}, outsider)).toEqual({
      products: 0,
      created_this_month: 0,
      updated_last_7_days: 0,
    })
  })
})

describe('permisos', () => {
  it('sin sesión no se puede llamar a ninguna de las funciones', async () => {
    const anonymous = publicClient()
    for (const fn of ['filter_products', 'search_products', 'export_products', 'catalog_stats']) {
      const { error } = await anonymous.rpc(fn)
      expect(error?.code).toBe('42501')
    }
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project integration tests/integration/catalog-list-filters.test.ts`
Expected: FAIL. PostgREST no encuentra `search_products` con `date_from`, ni `export_products`, ni `catalog_stats` («Could not find the function…», código `PGRST202`).

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/202610020001_product_list_filters.sql`:

```sql
-- Lista de productos con fecha y orden, Excel de salida e indicadores (spec del Excel §3, §4, §5.4
-- y §9.1). filter_products concentra búsqueda, filtros y orden: la lista y los Excel leen de ella,
-- así que nunca dan resultados distintos. Los empates se resuelven por nombre y, al final, por id:
-- la paginación es estable.
-- Los días son de Lima (UTC−5): un día empieza en dia::timestamp at time zone 'America/Lima'.
-- Sin índices nuevos: la búsqueda ya recorre la tabla y, con miles de productos, filtrar y ordenar
-- tarda milisegundos (spec §9.1).

create function public.filter_products(
  search text default '',
  category uuid default null,
  date_by text default 'created',
  date_from date default null,
  date_to date default null,
  sort text default 'name'
)
returns table (
  id uuid,
  code text,
  name text,
  description text,
  category_id uuid,
  unit_price numeric,
  created_at timestamptz,
  updated_at timestamptz,
  category_name text,
  sort_position bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      '%' || replace(replace(replace(
        extensions.unaccent('extensions.unaccent', coalesce(search, '')),
        '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
      date_from::timestamp at time zone 'America/Lima' as from_instant,
      (date_to + 1)::timestamp at time zone 'America/Lima' as to_instant
  ),
  matching as (
    select
      p.id, p.code, p.name, p.description, p.category_id, p.unit_price,
      p.created_at, p.updated_at, c.name as category_name,
      case when date_by = 'updated' then p.updated_at else p.created_at end as filter_date
    from public.products p
    join public.categories c on c.id = p.category_id
    cross join params
    where (category is null or p.category_id = category)
      and (
        extensions.unaccent('extensions.unaccent', p.name) ilike params.pattern
        or extensions.unaccent('extensions.unaccent', p.code) ilike params.pattern
      )
  )
  select
    m.id, m.code, m.name, m.description, m.category_id, m.unit_price,
    m.created_at, m.updated_at, m.category_name,
    row_number() over (
      order by
        case when sort = 'newest' then m.created_at end desc,
        case when sort = 'updated' then m.updated_at end desc,
        case when sort = 'price-asc' then m.unit_price end asc,
        case when sort = 'price-desc' then m.unit_price end desc,
        m.name, m.id
    ) as sort_position
  from matching m
  cross join params
  where (params.from_instant is null or m.filter_date >= params.from_instant)
    and (params.to_instant is null or m.filter_date < params.to_instant)
$$;

-- La versión anterior tenía cuatro parámetros. La nueva acepta los mismos y, además, fecha y orden
-- con valores por defecto: el código publicado la sigue llamando igual.
drop function public.search_products(text, uuid, integer, integer);

create function public.search_products(
  search text default '',
  category uuid default null,
  page integer default 1,
  page_size integer default 20,
  date_by text default 'created',
  date_from date default null,
  date_to date default null,
  sort text default 'name'
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    -- bigint: una página enorme pedida a mano no desborda la multiplicación.
    select
      least(greatest(page_size, 1), 100)::bigint as size,
      greatest(page, 1)::bigint as current_page
  ),
  filtered as (
    select * from public.filter_products(search, category, date_by, date_from, date_to, sort)
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce(
      (
        select json_agg(
          json_build_object(
            'id', f.id, 'code', f.code, 'name', f.name, 'description', f.description,
            'category_id', f.category_id, 'unit_price', f.unit_price::text,
            'created_at', f.created_at, 'updated_at', f.updated_at,
            'category_name', f.category_name
          )
          order by f.sort_position
        )
        from filtered f
        cross join params
        where f.sort_position > (params.current_page - 1) * params.size
          and f.sort_position <= params.current_page * params.size
      ),
      '[]'::json
    )
  )
$$;

-- Todas las filas filtradas para los Excel. Quien llama pide una de más para saber si hubo recorte.
create function public.export_products(
  search text default '',
  category uuid default null,
  date_by text default 'created',
  date_from date default null,
  date_to date default null,
  sort text default 'name',
  max_rows integer default 10001
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id', f.id, 'code', f.code, 'name', f.name, 'description', f.description,
        'category_id', f.category_id, 'unit_price', f.unit_price::text,
        'created_at', f.created_at, 'updated_at', f.updated_at,
        'category_name', f.category_name
      )
      order by f.sort_position
    ),
    '[]'::json
  )
  from public.filter_products(search, category, date_by, date_from, date_to, sort) f
  where f.sort_position <= least(greatest(max_rows, 1), 20001)
$$;

-- Indicadores de la cabecera (spec §4.1). «Modificados» incluye los creados: la cifra coincide con
-- la lista que abre el indicador (dateBy=updated&date=7d).
create function public.catalog_stats()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with lima as (
    select (now() at time zone 'America/Lima')::date as today
  )
  select json_build_object(
    'products', count(p.id),
    'created_this_month', count(p.id) filter (
      where p.created_at >=
        (lima.today - (extract(day from lima.today)::integer - 1))::timestamp
          at time zone 'America/Lima'
    ),
    'updated_last_7_days', count(p.id) filter (
      where p.updated_at >= (lima.today - 6)::timestamp at time zone 'America/Lima'
    )
  )
  from lima
  left join public.products p on true
  group by lima.today
$$;

-- Los mismos permisos que tenía search_products: solo cuentas con sesión. Las políticas RLS deciden
-- qué filas ve cada una.
revoke execute on function public.filter_products(text, uuid, text, date, date, text)
  from public, anon;
grant execute on function public.filter_products(text, uuid, text, date, date, text)
  to authenticated;
revoke execute on function
  public.search_products(text, uuid, integer, integer, text, date, date, text) from public, anon;
grant execute on function
  public.search_products(text, uuid, integer, integer, text, date, date, text) to authenticated;
revoke execute on function public.export_products(text, uuid, text, date, date, text, integer)
  from public, anon;
grant execute on function public.export_products(text, uuid, text, date, date, text, integer)
  to authenticated;
revoke execute on function public.catalog_stats() from public, anon;
grant execute on function public.catalog_stats() to authenticated;
```

- [ ] **Step 4: Aplicarla en el Supabase local y regenerar los tipos**

Run: `pnpm exec supabase migration up && pnpm db:types && pnpm exec prettier --write src/lib/supabase/database.types.ts`
Expected:
- «Applying migration 202610020001_product_list_filters.sql…» sin errores.
- `database.types.ts` incluye `catalog_stats`, `export_products`, `filter_products` y `search_products` con `date_by`, `date_from`, `date_to` y `sort`.

- [ ] **Step 5: Ejecutar las pruebas y ver que pasan**

Run: `pnpm exec vitest run --project integration tests/integration/catalog-list-filters.test.ts tests/integration/catalog-search.test.ts tests/integration/catalog-access.test.ts`
Expected: PASS en las tres. `catalog-search` demuestra que la llamada antigua sigue igual.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202610020001_product_list_filters.sql src/lib/supabase/database.types.ts tests/integration/catalog-list-filters.test.ts
git commit -m "feat: filter and sort products by Lima dates and price in the database"
```

---

### Task 2: Opciones de la lista, URL y consulta de la lista

**Files:**
- Create: `src/features/catalog/list-options.ts`
- Modify:
  - `src/features/catalog/search-params.ts`
  - `src/features/catalog/types.ts`
  - `src/features/catalog/products/queries.ts`
  - `src/features/catalog/query-keys.ts`
  - `src/features/catalog/products/hooks.ts`
  - `src/features/proforma/hooks.ts`
  - `tests/components/proforma-hooks.test.tsx`
  - `tests/integration/catalog-search.test.ts`
- Test: `tests/unit/catalog-list-options.test.ts`

**Interfaces:**
- Consumes: `search_products` de la tarea 1.
- Produces:
  - Constantes y tipos: `DATE_FIELDS`, `DateField`, `DATE_PRESETS`, `DatePreset`, `PRODUCT_SORTS`, `ProductSort`, `DateFilter`, `DayRange`.
  - Días: `limaDay(instant: Date): string`, `isIsoDay(value: string): boolean`, `addDays(day: string, days: number): string`.
  - Rango: `resolveDateRange(filter, now?): DayRange | null`.
  - Textos: `DATE_FIELD_LABELS`, `DATE_PRESET_LABELS`, `formatDay(day)`, `describeDateFilter(filter): string | null`, `SORT_LABELS`.
  - Fecha de la fila: `rowDateField(filters): DateField | null`, `relativeDay(instant: string, now?)`, `formatInstant(instant: string)`.
  - Consulta: `toProductQuery(filters: ProductFilters, now?): ProductQuery`.
  - URL: `searchParsers.dateBy | date | from | to | sort`.
  - Tipos: `ProductFilters` (estado de la URL) y `ProductQuery` (lo que se pide a la base: días ya resueltos; lo nuevo es opcional).
  - Consultas:
    - `listProducts(supabase, query: ProductQuery, signal?)`.
    - Internos de `queries.ts`: `itemSchema`, `toListItem`, `searchArgs(query: Omit<ProductQuery, 'page'>)`.
    - `catalogKeys.productList(query: ProductQuery)`.

- [ ] **Step 1: Escribir las pruebas unitarias**

`tests/unit/catalog-list-options.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  addDays,
  describeDateFilter,
  isIsoDay,
  limaDay,
  relativeDay,
  resolveDateRange,
  rowDateField,
  toProductQuery,
  type DatePreset,
} from '@/features/catalog/list-options'
import { searchParsers } from '@/features/catalog/search-params'

// 04:30 UTC del 2 de octubre = 23:30 del 1 de octubre en Lima.
const LATE_NIGHT = new Date('2026-10-02T04:30:00Z')
const range = (date: DatePreset | null, now: Date, custom = {}) =>
  resolveDateRange({ date, from: null, to: null, ...custom }, now)

describe('días de Lima', () => {
  it('toma el día de Lima, no el de UTC, hasta las 23:59:59', () => {
    expect(limaDay(LATE_NIGHT)).toBe('2026-10-01')
    expect(limaDay(new Date('2026-10-02T04:59:59Z'))).toBe('2026-10-01')
    expect(limaDay(new Date('2026-10-02T05:00:00Z'))).toBe('2026-10-02')
  })

  it('suma días cruzando meses, años bisiestos y años', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('solo acepta días reales en AAAA-MM-DD', () => {
    expect(isIsoDay('2026-02-28')).toBe(true)
    expect(isIsoDay('2026-02-30')).toBe(false)
    expect(isIsoDay('2026-2-3')).toBe(false)
    expect(isIsoDay('hoy')).toBe(false)
  })
})

describe('resolveDateRange', () => {
  it.each([
    ['today', { from: '2026-10-01', to: '2026-10-01' }],
    ['7d', { from: '2026-09-25', to: '2026-10-01' }],
    ['30d', { from: '2026-09-02', to: '2026-10-01' }],
    ['month', { from: '2026-10-01', to: '2026-10-01' }],
    ['last-month', { from: '2026-09-01', to: '2026-09-30' }],
  ] as const)('%s usa el día de Lima', (date, expected) => {
    expect(range(date, LATE_NIGHT)).toEqual(expected)
  })

  it.each([
    ['2026-01-15T12:00:00Z', { from: '2025-12-01', to: '2025-12-31' }],
    ['2026-03-10T12:00:00Z', { from: '2026-02-01', to: '2026-02-28' }],
    ['2028-03-10T12:00:00Z', { from: '2028-02-01', to: '2028-02-29' }],
  ])('mes anterior visto el %s', (now, expected) => {
    expect(range('last-month', new Date(now))).toEqual(expected)
  })

  it('personalizado: abierto por un lado; al revés o vacío no filtra', () => {
    expect(range('custom', LATE_NIGHT, { from: '2026-09-01' })).toEqual({
      from: '2026-09-01',
      to: null,
    })
    expect(range('custom', LATE_NIGHT, { from: '2026-09-10', to: '2026-09-01' })).toBeNull()
    expect(range('custom', LATE_NIGHT)).toBeNull()
  })

  it('sin filtro de fecha devuelve null', () => {
    expect(range(null, LATE_NIGHT)).toBeNull()
  })
})

describe('textos', () => {
  const base = { dateBy: 'created', date: null, from: null, to: null } as const

  it('describe el filtro como en la spec', () => {
    expect(describeDateFilter({ ...base, date: '7d' })).toBe('Registro: últimos 7 días')
    expect(describeDateFilter({ ...base, dateBy: 'updated', date: 'today' })).toBe(
      'Modificación: hoy',
    )
    expect(
      describeDateFilter({ ...base, date: 'custom', from: '2026-09-01', to: '2026-09-15' }),
    ).toBe('Registro: 01/09/2026 – 15/09/2026')
    expect(describeDateFilter({ ...base, date: 'custom', from: '2026-09-01' })).toBe(
      'Registro: desde el 01/09/2026',
    )
    expect(describeDateFilter({ ...base, date: 'custom', to: '2026-09-15' })).toBe(
      'Registro: hasta el 15/09/2026',
    )
    expect(describeDateFilter(base)).toBeNull()
  })

  it('fecha relativa en días de Lima', () => {
    expect(relativeDay('2026-10-01T15:00:00Z', LATE_NIGHT)).toBe('hoy')
    expect(relativeDay('2026-09-30T15:00:00Z', LATE_NIGHT)).toBe('ayer')
    expect(relativeDay('2026-09-01T15:00:00Z', LATE_NIGHT)).toBe('el 01/09/2026')
  })

  it('la fecha de cada fila sale del orden o del filtro', () => {
    expect(rowDateField({ dateBy: 'created', date: null, sort: 'name' })).toBeNull()
    expect(rowDateField({ dateBy: 'updated', date: '7d', sort: 'price-desc' })).toBe('updated')
    expect(rowDateField({ dateBy: 'created', date: null, sort: 'updated' })).toBe('updated')
    expect(rowDateField({ dateBy: 'updated', date: null, sort: 'newest' })).toBe('created')
  })
})

describe('URL', () => {
  it('lee los valores válidos e ignora los demás', () => {
    expect(searchParsers.date.parse('7d')).toBe('7d')
    expect(searchParsers.date.parse('semana')).toBeNull()
    expect(searchParsers.from.parse('2026-02-30')).toBeNull()
    expect(searchParsers.to.parse('2026-09-15')).toBe('2026-09-15')
    expect(searchParsers.sort.parse('price-desc')).toBe('price-desc')
    expect(searchParsers.sort.parse('precio')).toBeNull()
    expect(searchParsers.dateBy.parse('otro')).toBeNull()
  })
})

describe('toProductQuery', () => {
  it('convierte el rango en días concretos y conserva lo demás', () => {
    const filters = {
      search: 'hp',
      category: null,
      page: 2,
      dateBy: 'updated',
      date: 'today',
      from: null,
      to: null,
      sort: 'newest',
    } as const
    expect(toProductQuery(filters, LATE_NIGHT)).toEqual({
      search: 'hp',
      category: null,
      page: 2,
      dateBy: 'updated',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-01',
      sort: 'newest',
    })
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-list-options.test.ts`
Expected: FAIL. No existe `@/features/catalog/list-options`.

- [ ] **Step 3: Escribir el módulo, los tipos y los parsers**

`src/features/catalog/list-options.ts`:

```ts
import type { ProductFilters, ProductQuery } from './types'

// Filtro de fecha, orden y textos de la lista de productos (spec del Excel §4). Sirve en el
// navegador y en el servidor. Los días son de Lima, como en la base.

export const DATE_FIELDS = ['created', 'updated'] as const
export type DateField = (typeof DATE_FIELDS)[number]

export const DATE_PRESETS = ['today', '7d', '30d', 'month', 'last-month', 'custom'] as const
export type DatePreset = (typeof DATE_PRESETS)[number]

export const PRODUCT_SORTS = ['name', 'newest', 'updated', 'price-asc', 'price-desc'] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

export type DateFilter = {
  dateBy: DateField
  date: DatePreset | null
  from: string | null
  to: string | null
}

export type DayRange = { from: string | null; to: string | null }

const limaFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Día de Lima (AAAA-MM-DD) de un instante.
export function limaDay(instant: Date) {
  return limaFormat.format(instant)
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDay(value: string) {
  const match = ISO_DAY.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

// Calendario sobre AAAA-MM-DD en UTC: sin husos horarios de por medio.
export function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`

// Días incluidos del filtro, o null si no filtra (spec §4.6). Un rango personalizado al revés se
// ignora, como cualquier valor inválido de la URL.
export function resolveDateRange(
  filter: Pick<DateFilter, 'date' | 'from' | 'to'>,
  now = new Date(),
): DayRange | null {
  const today = limaDay(now)
  switch (filter.date) {
    case null:
      return null
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '30d':
      return { from: addDays(today, -29), to: today }
    case 'month':
      return { from: firstOfMonth(today), to: today }
    case 'last-month': {
      const lastDay = addDays(firstOfMonth(today), -1)
      return { from: firstOfMonth(lastDay), to: lastDay }
    }
    case 'custom':
      if (!filter.from && !filter.to) return null
      if (filter.from && filter.to && filter.from > filter.to) return null
      return { from: filter.from, to: filter.to }
  }
}

export const DATE_FIELD_LABELS: Record<DateField, string> = {
  created: 'Registro',
  updated: 'Modificación',
}

export const DATE_PRESET_LABELS: Record<Exclude<DatePreset, 'custom'>, string> = {
  today: 'Hoy',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  month: 'Este mes',
  'last-month': 'Mes anterior',
}

export function formatDay(day: string) {
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year}`
}

// «Registro: últimos 7 días», «Modificación: 01/09/2026 – 15/09/2026»; null si no filtra.
export function describeDateFilter(filter: DateFilter): string | null {
  if (filter.date === null) return null
  const field = DATE_FIELD_LABELS[filter.dateBy]
  if (filter.date !== 'custom') return `${field}: ${DATE_PRESET_LABELS[filter.date].toLowerCase()}`
  if (filter.from && filter.to) return `${field}: ${formatDay(filter.from)} – ${formatDay(filter.to)}`
  if (filter.from) return `${field}: desde el ${formatDay(filter.from)}`
  if (filter.to) return `${field}: hasta el ${formatDay(filter.to)}`
  return null
}

export const SORT_LABELS: Record<ProductSort, string> = {
  name: 'Nombre A–Z',
  newest: 'Más recientes (registro)',
  updated: 'Modificados recientemente',
  'price-asc': 'Precio: menor a mayor',
  'price-desc': 'Precio: mayor a menor',
}

// Qué fecha muestra cada fila: la del orden o la del filtro (spec §4.3); null sin fechas en juego.
export function rowDateField({
  dateBy,
  date,
  sort,
}: Pick<ProductFilters, 'dateBy' | 'date' | 'sort'>): DateField | null {
  if (sort === 'newest') return 'created'
  if (sort === 'updated') return 'updated'
  return date === null ? null : dateBy
}

// «hoy», «ayer» o «el 02/10/2026», en días de Lima.
export function relativeDay(instant: string, now = new Date()) {
  const day = limaDay(new Date(instant))
  const today = limaDay(now)
  if (day === today) return 'hoy'
  if (day === addDays(today, -1)) return 'ayer'
  return `el ${formatDay(day)}`
}

// «02/10/2026» de un instante, en Lima.
export function formatInstant(instant: string) {
  return formatDay(limaDay(new Date(instant)))
}

// Lo que se pide a la base: el rango ya convertido en días concretos. La clave de la caché cambia
// con el día, así que «Hoy» se recalcula solo (spec §4.6).
export function toProductQuery(filters: ProductFilters, now = new Date()): ProductQuery {
  const range = resolveDateRange(filters, now)
  return {
    search: filters.search,
    category: filters.category,
    page: filters.page,
    dateBy: filters.dateBy,
    dateFrom: range?.from ?? null,
    dateTo: range?.to ?? null,
    sort: filters.sort,
  }
}
```

En `src/features/catalog/types.ts`:
- Añade al principio `import type { DateField, DatePreset, ProductSort } from './list-options'`.
- Sustituye `ProductFilters` por esto y añade `ProductQuery`:

```ts
// Estado de la lista en la URL (spec del Excel §4.5).
export type ProductFilters = {
  search: string
  category: string | null
  page: number
  dateBy: DateField
  date: DatePreset | null
  from: string | null
  to: string | null
  sort: ProductSort
}

// Lo que se pide a la base: la fecha ya resuelta en días de Lima. Lo nuevo es opcional para que la
// búsqueda de la proforma, que solo busca por texto, siga igual.
export type ProductQuery = {
  search: string
  category: string | null
  page: number
  dateBy?: DateField
  dateFrom?: string | null
  dateTo?: string | null
  sort?: ProductSort
}
```

En `src/features/catalog/search-params.ts`, cambia los imports y amplía `searchParsers`:

```ts
import { createParser, parseAsStringLiteral } from 'nuqs'
import { DATE_FIELDS, DATE_PRESETS, isIsoDay, PRODUCT_SORTS } from './list-options'
import { idSchema } from './schemas'
import { SEARCH_MAX_LENGTH } from './search-pattern'
```

```ts
// Un día mal escrito o que no existe (2026-02-30) se ignora, como cualquier valor inválido.
const dayParser = createParser({
  parse: (value: string) => (isIsoDay(value) ? value : null),
  serialize: (value: string) => value,
})

export const searchParsers = {
  search: searchParser,
  category: categoryParser,
  page: pageParser,
  dateBy: parseAsStringLiteral(DATE_FIELDS).withDefault('created'),
  date: parseAsStringLiteral(DATE_PRESETS),
  from: dayParser,
  to: dayParser,
  sort: parseAsStringLiteral(PRODUCT_SORTS).withDefault('name'),
}
```

- [ ] **Step 4: Ejecutar las pruebas unitarias**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-list-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Escribir la prueba de integración de la lista**

En `tests/integration/catalog-search.test.ts`, al final:

```ts
describe('fecha y orden desde el código', () => {
  async function dated(code: string, name: string, price: string, created: string) {
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $5)`,
      [code, name, laptops, price, created],
    )
  }

  it('listProducts envía la fecha y el orden a la base', async () => {
    await dated('VIEJO', 'Viejo', '100.00', '2026-09-01T10:00:00-05:00')
    await dated('BARATO', 'Barato', '100.00', '2026-10-01T10:00:00-05:00')
    await dated('CARO', 'Caro', '900.00', '2026-10-01T11:00:00-05:00')
    const result = await listProducts(
      supabase,
      filters({ dateFrom: '2026-10-01', dateTo: '2026-10-01', sort: 'price-desc' }),
    )
    expect(codes(result)).toEqual(['CARO', 'BARATO'])
  })
})
```

Run: `pnpm exec vitest run --project integration tests/integration/catalog-search.test.ts`
Expected: FAIL en la prueba nueva. `listProducts` todavía ignora la fecha y el orden, y devuelve `['BARATO', 'CARO', 'VIEJO']`.

- [ ] **Step 6: Conectar la consulta de la lista**

En `src/features/catalog/products/queries.ts`:
- Cambia el import de tipos por `import type { Product, ProductListItem, ProductPage, ProductQuery } from '../types'`.
- Sustituye desde `const pageSchema` hasta el final del archivo por:

```ts
const itemSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category_id: z.string(),
  unit_price: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  category_name: z.string(),
})

const pageSchema = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(itemSchema),
})

const toListItem = ({ category_name, ...row }: z.infer<typeof itemSchema>): ProductListItem => ({
  ...toProduct(row),
  category_name,
})

// Búsqueda, filtros y orden: los mismos para la lista y para los Excel (spec del Excel §9.1).
function searchArgs(query: Omit<ProductQuery, 'page'>) {
  return {
    search: normalizeSearch(query.search),
    category: query.category ?? undefined,
    date_by: query.dateBy,
    date_from: query.dateFrom ?? undefined,
    date_to: query.dateTo ?? undefined,
    sort: query.sort,
  }
}

// Búsqueda, filtros, orden y página se resuelven en la base de datos: nunca se descarga todo el
// catálogo.
export async function listProducts(
  supabase: Client,
  query: ProductQuery,
  signal?: AbortSignal,
): Promise<ProductPage> {
  let request = supabase.rpc('search_products', {
    ...searchArgs(query),
    page: query.page,
    page_size: PAGE_SIZE,
  })
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  const parsed = pageSchema.parse(data)
  return {
    total: parsed.total,
    page: query.page,
    pageSize: PAGE_SIZE,
    items: parsed.items.map(toListItem),
  }
}
```

En `src/features/catalog/query-keys.ts`, cambia el tipo de la lista:

```ts
import type { ProductQuery } from './types'
```

```ts
  productList: (query: ProductQuery) => ['catalog', 'products', 'list', query] as const,
```

En `src/features/catalog/products/hooks.ts`:
- Importa `toProductQuery` desde `'../list-options'`.
- Sustituye `useProducts` por:

```ts
// La búsqueda espera 300 ms; claves distintas por filtro y la señal de cancelación evitan que una
// respuesta antigua sustituya a la actual. La fecha viaja ya resuelta en días de Lima.
export function useProducts() {
  const [filters] = useCatalogFilters()
  const search = useDebouncedValue(filters.search, 300)
  const current = toProductQuery({ ...filters, search })
  return {
    filters,
    query: useQuery({
      queryKey: catalogKeys.productList(current),
      queryFn: ({ signal }) => listProducts(createClient(), current, signal),
      placeholderData: keepPreviousData,
    }),
  }
}
```

En `src/features/proforma/hooks.ts`:
- Importa `toProductQuery` desde `'@/features/catalog/list-options'`.
- `useAddSingleResult` pide lo mismo que la lista:

```ts
  return async (filters: ProductFilters) => {
    if (normalizeSearch(filters.search) === '') return
    const query = toProductQuery(filters)
    const page = await queryClient
      .fetchQuery({
        queryKey: catalogKeys.productList(query),
        queryFn: ({ signal }) => listProducts(createClient(), query, signal),
      })
      .catch(() => null)
```

En `tests/components/proforma-hooks.test.tsx`, los filtros pasan a tener todos los campos y la caché se llena con la misma clave que usa el hook:

```ts
import { toProductQuery } from '@/features/catalog/list-options'
import type { ProductFilters, ProductListItem, ProductPage } from '@/features/catalog/types'
```

```ts
const filters: ProductFilters = {
  search: 'lap-001',
  category: null,
  page: 1,
  dateBy: 'created',
  date: null,
  from: null,
  to: null,
  sort: 'name',
}
```

```ts
    queryClient.setQueryData(catalogKeys.productList(toProductQuery(filters)), page)
```

- [ ] **Step 7: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project integration tests/integration/catalog-search.test.ts && pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS en todo.

- [ ] **Step 8: Commit**

```bash
git add src/features/catalog/list-options.ts src/features/catalog/search-params.ts src/features/catalog/types.ts src/features/catalog/products/queries.ts src/features/catalog/query-keys.ts src/features/catalog/products/hooks.ts src/features/proforma/hooks.ts tests/unit/catalog-list-options.test.ts tests/integration/catalog-search.test.ts tests/components/proforma-hooks.test.tsx
git commit -m "feat: read product date filters and sort from the URL in Lima days"
```

---

### Task 3: Indicadores clicables junto al título

**Files:**
- Create: `src/features/catalog/products/components/catalog-stats.tsx`
- Modify:
  - `src/features/catalog/types.ts`
  - `src/features/catalog/products/queries.ts`
  - `src/features/catalog/query-keys.ts`
  - `src/features/catalog/products/hooks.ts`
  - `src/features/catalog/components/catalog-screen.tsx`
- Test: `tests/components/catalog-stats.test.tsx`, `tests/integration/catalog-search.test.ts`

**Interfaces:**
- Consumes:
  - `catalog_stats` (tarea 1).
  - `useCatalogFilters` y `ProductFilters` (tarea 2).
- Produces:
  - `CatalogStats = { products; createdThisMonth; updatedLast7Days }`.
  - `getCatalogStats(supabase)`.
  - `catalogKeys.stats`, bajo `catalogKeys.products`, así que se refresca con cada cambio de productos.
  - `useCatalogStats()`.
  - `StatsShortcut = 'all' | 'created-this-month' | 'updated-7-days'`.
  - `CatalogStatsChips({ stats, active, onSelect })`, `activeShortcut(filters)` y `CatalogSummary()`.

- [ ] **Step 1: Escribir las pruebas**

`tests/components/catalog-stats.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  activeShortcut,
  CatalogStatsChips,
} from '@/features/catalog/products/components/catalog-stats'

describe('CatalogStatsChips', () => {
  it('muestra las cifras, marca la activa y desactiva las que están en cero', () => {
    render(
      <CatalogStatsChips
        stats={{ products: 123, createdThisMonth: 15, updatedLast7Days: 0 }}
        active="created-this-month"
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '123 productos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: '15 nuevos este mes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '0 modificados en 7 días' })).toBeDisabled()
  })

  it('usa el singular y avisa qué cifra se eligió', async () => {
    const onSelect = vi.fn()
    render(
      <CatalogStatsChips
        stats={{ products: 1, createdThisMonth: 1, updatedLast7Days: 1 }}
        active={null}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: '1 producto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 nuevo este mes' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '1 modificado en 7 días' }))
    expect(onSelect).toHaveBeenCalledWith('updated-7-days')
  })
})

describe('activeShortcut', () => {
  const base = { search: '', category: null, dateBy: 'created', date: null } as const

  it('reconoce la cifra de la vista actual', () => {
    expect(activeShortcut(base)).toBe('all')
    expect(activeShortcut({ ...base, date: 'month' })).toBe('created-this-month')
    expect(activeShortcut({ ...base, dateBy: 'updated', date: '7d' })).toBe('updated-7-days')
  })

  it('con búsqueda, categoría u otro rango no marca ninguna', () => {
    expect(activeShortcut({ ...base, search: 'hp' })).toBeNull()
    expect(activeShortcut({ ...base, date: 'month', category: 'c1' })).toBeNull()
    expect(activeShortcut({ ...base, date: '30d' })).toBeNull()
  })
})
```

En `tests/integration/catalog-search.test.ts`:
- Añade `getCatalogStats` al import de `@/features/catalog/products/queries`.
- Al final, añade:

```ts
describe('indicadores desde el código', () => {
  it('getCatalogStats traduce las cifras de la base', async () => {
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, created_at, updated_at)
       values ('VIEJO', 'Viejo', $1, 10, '2020-01-01T10:00:00-05:00', '2020-01-01T10:00:00-05:00'),
              ('NUEVO', 'Nuevo', $1, 10, now(), now())`,
      [laptops],
    )
    expect(await getCatalogStats(supabase)).toEqual({
      products: 2,
      createdThisMonth: 1,
      updatedLast7Days: 1,
    })
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run:
- `pnpm exec vitest run --project components tests/components/catalog-stats.test.tsx`
- `pnpm exec vitest run --project integration tests/integration/catalog-search.test.ts`

Expected: FAIL. No existen `catalog-stats.tsx` ni `getCatalogStats`.

- [ ] **Step 3: Implementar consulta, clave, hook y componente**

En `src/features/catalog/types.ts`, al final:

```ts
// Cifras de los indicadores de la cabecera (spec del Excel §4.1).
export type CatalogStats = { products: number; createdThisMonth: number; updatedLast7Days: number }
```

En `src/features/catalog/products/queries.ts`:
- Añade `CatalogStats` al import de tipos.
- Añade al final:

```ts
const statsSchema = z.object({
  products: z.number().int().nonnegative(),
  created_this_month: z.number().int().nonnegative(),
  updated_last_7_days: z.number().int().nonnegative(),
})

export async function getCatalogStats(supabase: Client): Promise<CatalogStats> {
  const { data, error } = await supabase.rpc('catalog_stats')
  if (error) throw error
  const stats = statsSchema.parse(data)
  return {
    products: stats.products,
    createdThisMonth: stats.created_this_month,
    updatedLast7Days: stats.updated_last_7_days,
  }
}
```

En `src/features/catalog/query-keys.ts`, dentro de `catalogKeys`:

```ts
  // Bajo «products»: lo que refresca la lista refresca también los indicadores.
  stats: ['catalog', 'products', 'stats'] as const,
```

En `src/features/catalog/products/hooks.ts`:
- Añade `getCatalogStats` al import de `'./queries'`.
- Añade al final:

```ts
export function useCatalogStats() {
  return useQuery({
    queryKey: catalogKeys.stats,
    queryFn: () => getCatalogStats(createClient()),
  })
}
```

`src/features/catalog/products/components/catalog-stats.tsx`:

```tsx
'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { CatalogStats, ProductFilters } from '../../types'
import { useCatalogFilters, useCatalogStats } from '../hooks'

export type StatsShortcut = 'all' | 'created-this-month' | 'updated-7-days'

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

// Cifras clave junto al título (spec del Excel §4.1). Cada una aplica su filtro con un clic. Van en
// la misma fila que «Productos»: no quitan altura a la lista.
export function CatalogStatsChips({
  stats,
  active,
  onSelect,
}: {
  stats: CatalogStats
  active: StatsShortcut | null
  onSelect: (shortcut: StatsShortcut) => void
}) {
  const items: { key: StatsShortcut; count: number; text: string; title: string }[] = [
    {
      key: 'all',
      count: stats.products,
      text: plural(stats.products, 'producto', 'productos'),
      title: 'Todo el catálogo, sin filtros',
    },
    {
      key: 'created-this-month',
      count: stats.createdThisMonth,
      text: `${plural(stats.createdThisMonth, 'nuevo', 'nuevos')} este mes`,
      title: 'Productos registrados desde el día 1 de este mes',
    },
    {
      key: 'updated-7-days',
      count: stats.updatedLast7Days,
      text: `${plural(stats.updatedLast7Days, 'modificado', 'modificados')} en 7 días`,
      title: 'Productos creados o modificados en los últimos 7 días',
    },
  ]
  return (
    <div
      role="group"
      aria-label="Resumen del catálogo"
      className="flex flex-wrap items-center gap-2"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={active === item.key}
          disabled={item.count === 0}
          title={item.title}
          onClick={() => onSelect(item.key)}
          className="inline-flex h-7 cursor-pointer items-center rounded-full border bg-card px-3 text-[13px] text-secondary-foreground transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-55 aria-pressed:border-ring aria-pressed:bg-accent aria-pressed:text-foreground"
        >
          <span className="font-bold text-foreground tabular-nums">{item.count}</span>{' '}
          {item.text}
        </button>
      ))}
    </div>
  )
}

// Las cifras cuentan todo el catálogo: con búsqueda o categoría ninguna coincide con la lista.
export function activeShortcut(
  filters: Pick<ProductFilters, 'search' | 'category' | 'dateBy' | 'date'>,
): StatsShortcut | null {
  if (filters.search !== '' || filters.category !== null) return null
  if (filters.date === null) return 'all'
  if (filters.dateBy === 'created' && filters.date === 'month') return 'created-this-month'
  if (filters.dateBy === 'updated' && filters.date === '7d') return 'updated-7-days'
  return null
}

// Al pulsar una cifra se quitan la búsqueda y la categoría: la lista muestra justo lo que cuenta.
export function CatalogSummary() {
  const stats = useCatalogStats()
  const [filters, setFilters] = useCatalogFilters()

  function select(shortcut: StatsShortcut) {
    const clean = { search: null, category: null, page: null, from: null, to: null }
    if (shortcut === 'all') void setFilters({ ...clean, dateBy: null, date: null, sort: null })
    else if (shortcut === 'created-this-month') {
      void setFilters({ ...clean, dateBy: null, date: 'month', sort: 'newest' })
    } else void setFilters({ ...clean, dateBy: 'updated', date: '7d', sort: 'updated' })
  }

  if (stats.isPending) {
    return (
      <div className="flex gap-2" aria-hidden>
        {[104, 136, 168].map((width) => (
          <Skeleton key={width} className="h-7 rounded-full" style={{ width }} />
        ))}
      </div>
    )
  }
  // ponytail: si fallan, no se muestran; la lista sigue funcionando y tiene su propio error.
  if (!stats.data) return null
  return <CatalogStatsChips stats={stats.data} active={activeShortcut(filters)} onSelect={select} />
}
```

En `src/features/catalog/components/catalog-screen.tsx`:
- Importa `CatalogSummary` desde `'../products/components/catalog-stats'`.
- Sustituye el `<div className="grid gap-1.5">` del título por:

```tsx
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
                Productos
              </h1>
              <CatalogSummary />
            </div>
            {/* En una pantalla baja se omite: ese alto es mejor para la lista. */}
            <p className="text-sm text-muted-foreground lg:short:hidden">
              Tu catálogo y sus categorías, en un mismo lugar.
            </p>
          </div>
```

- [ ] **Step 4: Ejecutar las pruebas y comprobar la altura en laptop**

Run:
- `pnpm exec vitest run --project components tests/components/catalog-stats.test.tsx`
- `pnpm exec vitest run --project integration tests/integration/catalog-search.test.ts`
- `pnpm exec playwright test tests/e2e/catalog.spec.ts --project desktop -g "al menos 6 productos"`
- `pnpm typecheck && pnpm lint`

Expected: PASS en todo.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/products/components/catalog-stats.tsx src/features/catalog/types.ts src/features/catalog/products/queries.ts src/features/catalog/query-keys.ts src/features/catalog/products/hooks.ts src/features/catalog/components/catalog-screen.tsx tests/components/catalog-stats.test.tsx tests/integration/catalog-search.test.ts
git commit -m "feat: show clickable catalog stats beside the products title"
```

---

### Task 4: Filtro de fecha

**Files:**
- Create: `src/features/catalog/products/components/date-filter.tsx`
- Modify:
  - `src/features/catalog/products/components/product-filters.tsx`
  - `src/features/catalog/products/components/product-list.tsx`
  - `tests/setup.ts`
- Test: `tests/components/date-filter.test.tsx`

**Interfaces:**
- Consumes: `describeDateFilter`, `DATE_PRESET_LABELS`, `limaDay` y los tipos de la tarea 2.
- Produces:
  - `DateFilterChange = { date, from, to, dateBy? }`.
  - `DateFilterControl({ value, today, onChange })`.
  - `ProductDateFilter()`, el contenedor.
  - En `product-list.tsx`: cabecera con un grupo izquierdo (título, contador y chip de fecha), `DateChip`, `clearDate` y `onlyDate`.

- [ ] **Step 1: Escribir la prueba del control**

`tests/components/date-filter.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DateFilterControl } from '@/features/catalog/products/components/date-filter'

const none = { dateBy: 'created', date: null, from: null, to: null } as const
const today = '2026-10-02'

describe('DateFilterControl', () => {
  it('sin filtro dice «Fecha»; un rango rápido se aplica al pulsarlo y cierra el panel', async () => {
    const onChange = vi.fn()
    render(<DateFilterControl value={none} today={today} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Filtrar por fecha' }))
    await user.click(screen.getByRole('radio', { name: 'Últimos 7 días' }))
    expect(onChange).toHaveBeenCalledWith({ date: '7d', from: null, to: null })
    expect(screen.queryByRole('radio', { name: 'Hoy' })).not.toBeInTheDocument()
  })

  it('con filtro muestra la selección y permite quitarlo', async () => {
    const onChange = vi.fn()
    render(
      <DateFilterControl
        value={{ ...none, dateBy: 'updated', date: 'today' }}
        today={today}
        onChange={onChange}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Fecha: Modificación: hoy' }))
    await user.click(screen.getByRole('button', { name: 'Quitar filtro' }))
    expect(onChange).toHaveBeenCalledWith({ date: null, from: null, to: null })
  })

  it('cambia qué fecha se usa sin perder el rango', async () => {
    const onChange = vi.fn()
    render(<DateFilterControl value={{ ...none, date: '7d' }} today={today} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Fecha: Registro: últimos 7 días' }))
    await user.click(screen.getByRole('radio', { name: 'Última modificación' }))
    expect(onChange).toHaveBeenCalledWith({ dateBy: 'updated', date: '7d', from: null, to: null })
  })

  it('el personalizado avisa si «Desde» va después de «Hasta» y aplica cuando está bien', async () => {
    const onChange = vi.fn()
    render(<DateFilterControl value={none} today={today} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Filtrar por fecha' }))
    await user.click(screen.getByRole('radio', { name: 'Personalizado' }))
    expect(screen.getByLabelText('Desde')).toHaveAttribute('max', today)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-10' } })
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La fecha "Desde" no puede ser posterior a "Hasta".',
    )
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-09-25' } })
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(onChange).toHaveBeenCalledWith({ date: 'custom', from: '2026-09-20', to: '2026-09-25' })
  })

  it('el personalizado sin fechas pide al menos una', async () => {
    const onChange = vi.fn()
    render(<DateFilterControl value={none} today={today} onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Filtrar por fecha' }))
    await user.click(screen.getByRole('radio', { name: 'Personalizado' }))
    await user.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elige al menos una fecha.')
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `pnpm exec vitest run --project components tests/components/date-filter.test.tsx`
Expected: FAIL. El módulo no existe.

- [ ] **Step 3: Preparar jsdom e implementar el control**

En `tests/setup.ts`, después de los polyfills del puntero:

```ts
// Radix (Popover, DropdownMenu) mide el contenido con ResizeObserver, que jsdom no trae.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
```

`src/features/catalog/products/components/date-filter.tsx`:

```tsx
'use client'

import { CalendarDays, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DATE_PRESET_LABELS,
  describeDateFilter,
  limaDay,
  type DateField,
  type DateFilter,
  type DatePreset,
} from '../../list-options'
import { useCatalogFilters } from '../hooks'

export type DateFilterChange = Pick<DateFilter, 'date' | 'from' | 'to'> & { dateBy?: DateField }

const FIELDS: { key: DateField; text: string; help: string }[] = [
  { key: 'created', text: 'Fecha de registro', help: 'Cuándo se creó el producto' },
  {
    key: 'updated',
    text: 'Última modificación',
    help: 'Cuándo cambió por última vez: precio, nombre, categoría…',
  },
]

const QUICK = ['today', '7d', '30d', 'month', 'last-month'] as const
const RANGES: { key: 'any' | DatePreset; text: string }[] = [
  { key: 'any', text: 'Cualquier fecha' },
  ...QUICK.map((key) => ({ key, text: DATE_PRESET_LABELS[key] })),
  { key: 'custom', text: 'Personalizado' },
]

const dateInput = 'h-9 rounded-md border border-input bg-card px-2 text-sm'

// Filtro de fecha de la lista (spec del Excel §4.2): qué fecha y qué rango. Los rangos rápidos se
// aplican al pulsarlos; el personalizado, con «Aplicar».
export function DateFilterControl({
  value,
  today,
  onChange,
}: {
  value: DateFilter
  today: string
  onChange: (change: DateFilterChange) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(value.date === 'custom')
  const [from, setFrom] = useState(value.from ?? '')
  const [to, setTo] = useState(value.to ?? '')
  const [error, setError] = useState<string | null>(null)
  const label = describeDateFilter(value)
  const selected = custom ? 'custom' : (value.date ?? 'any')
  const help = FIELDS.find((field) => field.key === value.dateBy)?.help

  function choose(change: DateFilterChange) {
    onChange(change)
    setOpen(false)
  }

  function applyCustom() {
    if (!from && !to) return setError('Elige al menos una fecha.')
    if (from && to && from > to) return setError('La fecha "Desde" no puede ser posterior a "Hasta".')
    setError(null)
    choose({ date: 'custom', from: from || null, to: to || null })
  }

  // Al abrir, el panel parte de lo que hay en la URL.
  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    setCustom(value.date === 'custom')
    setFrom(value.from ?? '')
    setTo(value.to ?? '')
    setError(null)
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          aria-label={label ? `Fecha: ${label}` : 'Filtrar por fecha'}
          className={cn('h-11 shrink-0 gap-2 px-3.5', label && 'border-ring bg-accent')}
        >
          <CalendarDays aria-hidden />
          {/* En el celular solo el icono, con un punto verde si hay filtro (spec §4.3). */}
          <span className="max-sm:hidden">{label ?? 'Fecha'}</span>
          {label ? <span className="size-2 rounded-full bg-primary sm:hidden" aria-hidden /> : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 grid w-[min(22rem,calc(100vw-2rem))] gap-4 rounded-xl border bg-popover p-4 text-sm shadow-lg"
        >
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-semibold">¿Qué fecha?</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {FIELDS.map((field) => (
                <label
                  key={field.key}
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-1.5 text-center text-[13px] font-medium has-focus-visible:ring-2 has-focus-visible:ring-ring',
                    value.dateBy === field.key
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-field`}
                    checked={value.dateBy === field.key}
                    onChange={() =>
                      onChange({ dateBy: field.key, date: value.date, from: value.from, to: value.to })
                    }
                    className="sr-only"
                  />
                  {field.text}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{help}</p>
          </fieldset>

          <fieldset className="grid gap-0.5">
            <legend className="mb-1 font-semibold">Rango</legend>
            {RANGES.map((range) => (
              <label
                key={range.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <input
                  type="radio"
                  name={`${id}-range`}
                  checked={selected === range.key}
                  onChange={() => {
                    if (range.key === 'custom') return setCustom(true)
                    setCustom(false)
                    choose({ date: range.key === 'any' ? null : range.key, from: null, to: null })
                  }}
                  className="size-4 accent-ring"
                />
                {range.text}
              </label>
            ))}
          </fieldset>

          {custom ? (
            <div className="grid gap-3 rounded-lg border bg-background/60 p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-medium">
                  Desde
                  <input
                    type="date"
                    max={today}
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    className={dateInput}
                  />
                </label>
                <label className="grid gap-1 text-xs font-medium">
                  Hasta
                  <input
                    type="date"
                    max={today}
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    className={dateInput}
                  />
                </label>
              </div>
              {error ? (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {error}
                </p>
              ) : null}
              <Button size="sm" onClick={applyCustom}>
                Aplicar
              </Button>
            </div>
          ) : null}

          {value.date ? (
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => choose({ date: null, from: null, to: null })}
            >
              <X aria-hidden />
              Quitar filtro
            </Button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function ProductDateFilter() {
  const [filters, setFilters] = useCatalogFilters()
  // Como «hoy» en la proforma: se fija al montar (solo limita los calendarios).
  const [today] = useState(() => limaDay(new Date()))
  return (
    <DateFilterControl
      value={filters}
      today={today}
      onChange={(change) => void setFilters({ ...change, page: null })}
    />
  )
}
```

En `src/features/catalog/products/components/product-filters.tsx`:
- Importa `ProductDateFilter` desde `'./date-filter'`.
- Cambia `hasFilters`:

```tsx
  const hasFilters = filters.search !== '' || filters.category !== null || filters.date !== null
```

- Dentro de `<div className="flex items-center gap-3">`, justo después del `div` del buscador, añade `<ProductDateFilter />`.
- «Limpiar filtros» también quita la fecha:

```tsx
            onClick={() =>
              setFilters({ search: null, category: null, date: null, from: null, to: null, page: null })
            }
```

En `src/features/catalog/products/components/product-list.tsx`:

1. **Imports.** Añade `X` al import de `lucide-react` y `import { describeDateFilter } from '../../list-options'`.
2. **Estado de los filtros.** Sustituye las líneas de `hasFilters` y `clearFilters` por:

```tsx
  const dateLabel = describeDateFilter(filters)
  const hasFilters = filters.search !== '' || filters.category !== null || filters.date !== null
  const onlyDate = filters.date !== null && filters.search === '' && filters.category === null
  const clearFilters = () =>
    setFilters({ search: null, category: null, date: null, from: null, to: null, page: null })
  const clearDate = () => setFilters({ date: null, from: null, to: null, page: null })
```

3. **Cabecera.** El `div` de la cabecera pasa a `flex-wrap`. El título y el chip van en un grupo propio, y el chip queda fuera del `<h2>`, para no ensuciar el título. Sustituye la apertura del `div` y el `<h2>` por:

```tsx
      <div className="flex min-h-15 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5 lg:short:min-h-12 lg:short:py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 className="flex items-center gap-2.5 text-[15px] font-bold">
            {title}
            {data ? (
              <span className="rounded-full bg-muted px-2 font-mono text-xs font-medium text-muted-foreground">
                {data.total}
              </span>
            ) : null}
          </h2>
          {dateLabel ? <DateChip label={dateLabel} onClear={clearDate} /> : null}
        </div>
```

4. **Vacío por fecha.** Antes de la rama `) : data && data.total === 0 ? (` («No encontramos productos»), añade:

```tsx
      ) : data && data.total === 0 && onlyDate ? (
        <EmptyState
          icon={<Search className="size-6" aria-hidden />}
          title="No hay productos en esas fechas"
          text="Prueba con otro rango o quita el filtro de fecha."
          action={
            <Button variant="outline" onClick={clearDate}>
              Quitar filtro de fecha
            </Button>
          }
        />
```

5. **`DateChip`.** Añade este componente local, junto a `CodeChip`:

```tsx
// El filtro de fecha activo, para quitarlo con un clic (spec §4.3).
function DateChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full bg-accent pr-1 pl-3 text-[13px] font-medium">
      {label}
      <button
        type="button"
        aria-label="Quitar filtro de fecha"
        onClick={onClear}
        className="grid size-5 cursor-pointer place-items-center rounded-full hover:bg-background"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  )
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/products/components/date-filter.tsx src/features/catalog/products/components/product-filters.tsx src/features/catalog/products/components/product-list.tsx tests/setup.ts tests/components/date-filter.test.tsx
git commit -m "feat: filter products by registration or modification date"
```

---

### Task 5: Orden, «Copiar enlace», fecha en las filas y en la ficha

**Files:**
- Create: `src/features/catalog/products/components/sort-select.tsx`
- Modify:
  - `src/features/catalog/products/components/product-list.tsx`
  - `src/features/catalog/products/components/product-detail.tsx`
  - `tests/e2e/catalog.spec.ts`
- Test: `tests/components/sort-select.test.tsx`

**Interfaces:**
- Consumes: `PRODUCT_SORTS`, `SORT_LABELS`, `rowDateField`, `relativeDay`, `formatInstant` y `DateField` (tarea 2); la cabecera de la tarea 4.
- Produces:
  - `SortSelect({ value, onChange })`.
  - En `product-list.tsx`: `CopyLinkButton`, `RowDate` y el grupo derecho de la cabecera (orden y paginación).

- [ ] **Step 1: Escribir la prueba del selector y ampliar la de la ficha**

`tests/components/sort-select.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SortSelect } from '@/features/catalog/products/components/sort-select'

describe('SortSelect', () => {
  it('muestra el orden actual y avisa del nuevo', async () => {
    const onChange = vi.fn()
    render(<SortSelect value="name" onChange={onChange} />)
    const select = screen.getByLabelText('Ordenar por')
    expect(select).toHaveDisplayValue('Nombre A–Z')
    await userEvent.setup().selectOptions(select, 'Precio: mayor a menor')
    expect(onChange).toHaveBeenCalledWith('price-desc')
  })
})
```

En `tests/e2e/catalog.spec.ts`, en «el nombre abre la ficha con el producto completo…», después de `await expect(ficha).toContainText('Garantía de 3 años con atención en sitio.')`:

```ts
  await expect(ficha).toContainText('Registrado el')
  await expect(ficha).toContainText('Modificado el')
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run:
- `pnpm exec vitest run --project components tests/components/sort-select.test.tsx`
- `pnpm exec playwright test tests/e2e/catalog.spec.ts --project desktop -g "abre la ficha"`

Expected: FAIL en las dos. No existe el selector y la ficha no muestra fechas.

- [ ] **Step 3: Implementar**

`src/features/catalog/products/components/sort-select.tsx`:

```tsx
'use client'

import { ArrowDownUp, ChevronDown } from 'lucide-react'
import { PRODUCT_SORTS, SORT_LABELS, type ProductSort } from '../../list-options'

// Orden de la lista (spec del Excel §4.4). Un <select> nativo: accesible y cómodo en el celular.
// field-sizing-content lo deja del ancho de la opción elegida (Chrome y Edge): la cabecera cabe en
// una línea en un laptop. Donde no se admite, mide lo que la opción más larga.
export function SortSelect({
  value,
  onChange,
}: {
  value: ProductSort
  onChange: (sort: ProductSort) => void
}) {
  return (
    <div className="relative flex items-center">
      <ArrowDownUp
        className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground"
        aria-hidden
      />
      <label htmlFor="product-sort" className="sr-only">
        Ordenar por
      </label>
      <select
        id="product-sort"
        value={value}
        onChange={(event) => onChange(event.target.value as ProductSort)}
        className="h-8 cursor-pointer appearance-none rounded-lg border border-input bg-background/60 pr-7 pl-8 text-[13px] text-secondary-foreground outline-none field-sizing-content focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {PRODUCT_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
        aria-hidden
      />
    </div>
  )
}
```

En `src/features/catalog/products/components/product-list.tsx`:

1. **Imports:**
   - Quita `ArrowDownAZ` y añade `Link2` al import de `lucide-react`.
   - Añade `import { toast } from 'sonner'` y `import { SortSelect } from './sort-select'`.
   - Amplía el import de `'../../list-options'` a `describeDateFilter, relativeDay, rowDateField, type DateField`.
2. **Fecha de las filas.** En `ProductList`, después de `dateLabel`:

```tsx
  const dateField = rowDateField(filters)
```

3. **Grupo izquierdo de la cabecera.** Después del `DateChip`, añade el enlace (spec §4.3: junto a los filtros activos y solo si hay alguno):

```tsx
          {hasFilters || filters.sort !== 'name' ? <CopyLinkButton /> : null}
```

4. **Grupo derecho de la cabecera.** Sustituye el `<div className="flex items-center gap-4">` (el que tiene «Nombre A–Z» y el `PageStepper`) por:

```tsx
        <div className="flex flex-wrap items-center gap-2">
          <SortSelect value={filters.sort} onChange={(sort) => setFilters({ sort, page: null })} />
          {data && totalPages > 1 ? (
            <PageStepper
              page={Math.min(filters.page, totalPages)}
              totalPages={totalPages}
              onPage={goToPage}
            />
          ) : null}
        </div>
```

5. **Tabla y tarjetas.**
   - En el JSX, pasa `dateField={dateField}` a `ProductTable` y a `ProductCards`.
   - Sus props pasan a `RowsProps & { dateField: DateField | null }`. `RowsProps` no se toca: `RowActions` usa `Omit<RowsProps, …>`.

```tsx
function ProductTable({
  items,
  dateField,
  onView,
  onEdit,
  onDelete,
}: RowsProps & { dateField: DateField | null }) {
```

```tsx
function ProductCards({
  items,
  dateField,
  onView,
  onEdit,
  onDelete,
}: RowsProps & { dateField: DateField | null }) {
```

   - En `ProductTable`, después del `<span>` de la descripción, dentro de su `div`:

```tsx
                {dateField ? <RowDate product={product} field={dateField} /> : null}
```

   - En `ProductCards`, al final del `div` con `CodeChip` y `CategoryBadge`:

```tsx
            {dateField ? <RowDate product={product} field={dateField} /> : null}
```

6. **Componentes locales**, junto a `CodeChip`:

```tsx
// Con un filtro o un orden por fecha, cada fila dice cuándo se registró o modificó (spec §4.3).
function RowDate({ product, field }: { product: ProductListItem; field: DateField }) {
  const instant = field === 'created' ? product.created_at : product.updated_at
  return (
    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
      {field === 'created' ? 'Registrado' : 'Modificado'} {relativeDay(instant)}
    </span>
  )
}

// Los filtros viven en la URL: copiarla guarda la vista para volver a ella o compartirla.
function CopyLinkButton() {
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(
        'Enlace copiado: guárdalo en favoritos o compártelo para volver a esta misma vista.',
      )
    } catch {
      toast.error('No se pudo copiar el enlace. Cópialo desde la barra de direcciones.')
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Copiar enlace de esta vista"
      title="Copiar enlace de esta vista"
      onClick={() => void copy()}
    >
      <Link2 aria-hidden />
    </Button>
  )
}
```

En `src/features/catalog/products/components/product-detail.tsx`:
- Importa `formatInstant` desde `'../../list-options'`.
- Al final del `div` con `overflow-y-auto`, después del bloque de la descripción:

```tsx
              <p className="text-[13px] text-muted-foreground">
                Registrado el {formatInstant(data.created_at)} · Modificado el{' '}
                {formatInstant(data.updated_at)}
              </p>
```

- [ ] **Step 4: Ejecutar las pruebas**

Run:
- `pnpm exec vitest run --project components`
- `pnpm exec playwright test tests/e2e/catalog.spec.ts`
- `pnpm typecheck && pnpm lint`

Expected: PASS en todo, en desktop y en mobile. Eso incluye «abre la ficha», «al menos 6 productos» y «cambia de página desde arriba».

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/products/components/sort-select.tsx src/features/catalog/products/components/product-list.tsx src/features/catalog/products/components/product-detail.tsx tests/components/sort-select.test.tsx tests/e2e/catalog.spec.ts
git commit -m "feat: sort products, show their dates and copy the current view link"
```

---

### Task 6: E2E de la lista

**Files:**
- Test: `tests/e2e/catalog-list.spec.ts`

**Interfaces:** consume los textos y roles de las tareas 3 a 5.

- [ ] **Step 1: Escribir las e2e**

`tests/e2e/catalog-list.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { connect, resetCatalog } from '../integration/db'
import { login } from './session'

// «Hoy» de Lima lo calcula la base, para no depender del reloj del equipo.
async function seed() {
  const db = await connect()
  try {
    await resetCatalog(db)
    const {
      rows: [lima],
    } = await db.query<{ today: string }>(
      "select to_char((now() at time zone 'America/Lima')::date, 'YYYY-MM-DD') as today",
    )
    const {
      rows: [category],
    } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    const today = `${lima.today}T10:00:00-05:00`
    const old = '2025-01-15T10:00:00-05:00'
    const insert = (code: string, name: string, price: number, created: string, updated: string) =>
      db.query(
        `insert into public.products (code, name, category_id, unit_price, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [code, name, category.id, price, created, updated],
      )
    await insert('NEW-1', 'Laptop nueva A', 2500, today, today)
    await insert('NEW-2', 'Laptop nueva B', 3500, today, today)
    await insert('OLD-1', 'Laptop antigua editada', 1500, old, today)
    await insert('OLD-2', 'Laptop antigua', 900, old, old)
  } finally {
    await db.end()
  }
}

const list = (page: Page) => page.getByRole('region', { name: 'Lista de productos' })
const names = (page: Page) =>
  list(page)
    .getByRole('button', { name: /^Ver ficha de / })
    .filter({ visible: true })
    .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()))

test('los indicadores muestran las cifras y aplican su filtro', async ({ page }) => {
  await seed()
  await login(page)
  const stats = page.getByRole('group', { name: 'Resumen del catálogo' })
  await expect(stats.getByRole('button', { name: '4 productos' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await stats.getByRole('button', { name: '2 nuevos este mes' }).click()
  await expect(page).toHaveURL(/date=month/)
  await expect(page).toHaveURL(/sort=newest/)
  await expect.poll(() => names(page)).toEqual(['Laptop nueva A', 'Laptop nueva B'])

  await stats.getByRole('button', { name: '3 modificados en 7 días' }).click()
  await expect(page).toHaveURL(/dateBy=updated/)
  await expect
    .poll(() => names(page))
    .toEqual(['Laptop antigua editada', 'Laptop nueva A', 'Laptop nueva B'])

  await stats.getByRole('button', { name: '4 productos' }).click()
  await expect(page).not.toHaveURL(/date=/)
  await expect.poll(() => names(page)).toHaveLength(4)
})

test('el filtro de fecha y el orden quedan en la URL y sobreviven a recargar', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('button', { name: 'Filtrar por fecha' }).click()
  await page.getByRole('radio', { name: 'Hoy' }).click()
  await expect(page).toHaveURL(/date=today/)
  await expect(page.getByRole('button', { name: 'Fecha: Registro: hoy' })).toBeVisible()
  await expect.poll(() => names(page)).toEqual(['Laptop nueva A', 'Laptop nueva B'])

  await page.getByLabel('Ordenar por').selectOption({ label: 'Precio: mayor a menor' })
  await expect(page).toHaveURL(/sort=price-desc/)
  await expect.poll(() => names(page)).toEqual(['Laptop nueva B', 'Laptop nueva A'])
  await expect(list(page).getByText('Registrado hoy').filter({ visible: true })).toHaveCount(2)

  await page.reload()
  await expect.poll(() => names(page)).toEqual(['Laptop nueva B', 'Laptop nueva A'])
  await list(page).getByRole('button', { name: 'Quitar filtro de fecha' }).click()
  await expect.poll(() => names(page)).toHaveLength(4)
})

test('los valores raros en la URL se ignoran', async ({ page }) => {
  await seed()
  await login(page)
  await page.goto('/products?date=semana&sort=precio&from=2026-02-30&dateBy=otro')
  await expect.poll(() => names(page)).toHaveLength(4)
  await expect(page.getByLabel('Ordenar por')).toHaveDisplayValue('Nombre A–Z')
})

test('«Copiar enlace» copia la vista actual', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await seed()
  await login(page)
  await page.goto('/products?sort=price-asc')
  await list(page).getByRole('button', { name: 'Copiar enlace de esta vista' }).click()
  await expect(page.getByText(/Enlace copiado/)).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url())
})
```

- [ ] **Step 2: Ejecutarlas**

Run: `pnpm exec playwright test tests/e2e/catalog-list.spec.ts`
Expected:
- PASS en desktop y en mobile: las tareas 3 a 5 ya están hechas.
- Si alguna falla, es un defecto de esas tareas. Se corrige con `superpowers:systematic-debugging`, con su prueba que falla primero.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/catalog-list.spec.ts
git commit -m "test: cover catalog stats, date filter, sort and copy link end to end"
```

---

### Task 7: Base de los Excel

**Files:**
- Modify:
  - `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `next.config.ts`
  - `src/features/proforma/money.ts`
  - `src/features/proforma/document/files.ts`
- Create:
  - `src/lib/files.ts`
  - `src/features/catalog/price-columns.ts`
  - `src/features/catalog/excel/category-summary.ts`
  - `src/features/catalog/excel/theme.ts`
- Test: `tests/unit/catalog-price-columns.test.ts`, `tests/unit/catalog-category-summary.test.ts`, `tests/unit/proforma-money.test.ts`

**Interfaces:**
- Produces:
  - **Dinero:** `centsToDecimal(cents: bigint): string`, por ejemplo `"1000.00"`.
  - **Precios:** `priceColumns(config?)` → `{ catalog: string; derived: { label; from(price: string): string } | null; note: string }`.
  - **Resumen:** `summarizeByCategory(rows)` → `{ categories: CategorySummary[]; total: CategorySummary | null }`.
  - **Tema:** `COLORS`, `FONT`, `MONEY_FORMAT`, `DATE_FORMAT`, `styleHeaderRow(row)`, `styleBodyRow(row, index)`, `excelDay(day)` y `addLogo(workbook, sheet, logo)`.
  - **Archivos:** `base64ToFile(base64, fileName, type?)`, `downloadFile(file)`, `releaseObjectUrl(url)`, `PDF_MIME`, `XLSX_MIME`.

- [ ] **Step 1: Escribir las pruebas unitarias**

`tests/unit/catalog-price-columns.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { priceColumns } from '@/features/catalog/price-columns'

describe('priceColumns', () => {
  it('con IGV incluido: precio con IGV y valor sin IGV, redondeado como la «Op. gravada»', () => {
    const columns = priceColumns({ mode: 'included', ratePercent: 18 })
    expect(columns.catalog).toBe('Precio con IGV (S/)')
    expect(columns.derived?.label).toBe('Valor sin IGV (S/)')
    expect(columns.derived?.from('1180.00')).toBe('1000.00')
    expect(columns.derived?.from('1.00')).toBe('0.85')
    expect(columns.note).toBe('Precios en soles (S/), con IGV incluido.')
  })

  it('con IGV aparte: el catálogo es sin IGV y se calcula el precio con IGV', () => {
    const columns = priceColumns({ mode: 'added', ratePercent: 18 })
    expect(columns.catalog).toBe('Precio sin IGV (S/)')
    expect(columns.derived?.label).toBe('Precio con IGV (S/)')
    expect(columns.derived?.from('1000.00')).toBe('1180.00')
  })

  it('sin IGV: una sola columna de precio', () => {
    expect(priceColumns({ mode: 'none', ratePercent: 18 })).toEqual({
      catalog: 'Precio (S/)',
      derived: null,
      note: 'Precios en soles (S/).',
    })
  })
})
```

`tests/unit/catalog-category-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { summarizeByCategory } from '@/features/catalog/excel/category-summary'

describe('summarizeByCategory', () => {
  it('cuenta y calcula mínimo, máximo y promedio por categoría, en céntimos', () => {
    const summary = summarizeByCategory([
      { category_name: 'Laptops', unit_price: '100.00' },
      { category_name: 'Impresoras', unit_price: '99.99' },
      { category_name: 'Laptops', unit_price: '300.00' },
      { category_name: 'Laptops', unit_price: '250.50' },
    ])
    expect(summary.categories).toEqual([
      { category: 'Impresoras', count: 1, min: '99.99', max: '99.99', average: '99.99' },
      { category: 'Laptops', count: 3, min: '100.00', max: '300.00', average: '216.83' },
    ])
    expect(summary.total).toEqual({
      category: 'Total',
      count: 4,
      min: '99.99',
      max: '300.00',
      average: '187.62',
    })
  })

  it('sin filas no hay total', () => {
    expect(summarizeByCategory([])).toEqual({ categories: [], total: null })
  })
})
```

En `tests/unit/proforma-money.test.ts`:
- Añade `centsToDecimal` al import de `@/features/proforma/money`.
- Añade:

```ts
describe('centsToDecimal', () => {
  it('escribe céntimos como decimal, sin separador de miles', () => {
    expect(centsToDecimal(BigInt(118000))).toBe('1180.00')
    expect(centsToDecimal(BigInt(123456789))).toBe('1234567.89')
    expect(centsToDecimal(BigInt(5))).toBe('0.05')
    expect(centsToDecimal(BigInt(0))).toBe('0.00')
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-price-columns.test.ts tests/unit/catalog-category-summary.test.ts tests/unit/proforma-money.test.ts`
Expected: FAIL. Faltan los módulos y `centsToDecimal`.

- [ ] **Step 3: Instalar ExcelJS y fijar `uuid`**

Run: `pnpm add --save-exact exceljs@4.4.0`

Añade a `pnpm-workspace.yaml`:

```yaml
# ExcelJS trae uuid 8, con un aviso moderado que aquí no aplica: solo usa v4() sin búfer. Se fuerza
# la versión corregida para que la auditoría quede limpia (spec del Excel §3).
overrides:
  exceljs>uuid: ^11.1.1
```

Run: `pnpm install && pnpm audit --prod`
Expected: la auditoría ya no menciona `uuid`.

En `next.config.ts`:

```ts
  // Baileys (WhatsApp) es ESM con WebAssembly y ExcelJS es CommonJS con dependencias opcionales: los
  // dos se cargan tal cual en el servidor, sin empaquetar.
  serverExternalPackages: ['baileys', 'exceljs'],
```

- [ ] **Step 4: Implementar los módulos**

En `src/features/proforma/money.ts`, después de `formatCents`:

```ts
// Para escribir importes en Excel: decimal exacto, sin separador de miles.
export function centsToDecimal(cents: bigint) {
  return `${cents / HUNDRED}.${(cents % HUNDRED).toString().padStart(2, '0')}`
}
```

`src/lib/files.ts`:

```ts
export const PDF_MIME = 'application/pdf'
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Los archivos llegan en base64 desde las Server Actions: el PDF de la proforma y los Excel.
export function base64ToFile(base64: string, fileName: string, type = PDF_MIME) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new File([bytes], fileName, { type })
}

// La dirección temporal se libera después, para no cortar la descarga ni la pestaña.
export const releaseObjectUrl = (url: string) =>
  setTimeout(() => URL.revokeObjectURL(url), 60_000)

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  releaseObjectUrl(url)
}
```

En `src/features/proforma/document/files.ts`:
- Borra `base64ToFile`, `release` y `downloadFile`.
- El principio del archivo queda así:

```ts
import { downloadFile, releaseObjectUrl } from '@/lib/files'
import { whatsappLink } from './format'

export { base64ToFile, downloadFile } from '@/lib/files'
```

- En `openFile`, cambia `release(url)` por `releaseObjectUrl(url)`.

`src/features/catalog/price-columns.ts`:

```ts
import { centsToDecimal, parseCents } from '@/features/proforma/money'
import { applyTax, TAX_CONFIG, type TaxConfig } from '@/features/proforma/tax'

export type PriceColumns = {
  catalog: string
  derived: { label: string; from: (price: string) => string } | null
  note: string
}

const cents = (price: string) => parseCents(price) ?? BigInt(0)

// Títulos y nota del precio según el IGV (spec del Excel §3). El catálogo guarda el precio tal como
// se vende; la otra columna se calcula con el mismo módulo que la proforma. Fuera de excel/: la
// carga masiva (fase 2) muestra estos títulos en el navegador.
export function priceColumns(config: TaxConfig = TAX_CONFIG): PriceColumns {
  if (config.mode === 'none') {
    return { catalog: 'Precio (S/)', derived: null, note: 'Precios en soles (S/).' }
  }
  if (config.mode === 'added') {
    return {
      catalog: 'Precio sin IGV (S/)',
      derived: {
        label: 'Precio con IGV (S/)',
        from: (price) => centsToDecimal(applyTax(cents(price), config).total),
      },
      note: `Precios en soles (S/), sin IGV (${config.ratePercent} %).`,
    }
  }
  return {
    catalog: 'Precio con IGV (S/)',
    derived: {
      label: 'Valor sin IGV (S/)',
      from: (price) => centsToDecimal(applyTax(cents(price), config).base),
    },
    note: 'Precios en soles (S/), con IGV incluido.',
  }
}
```

`src/features/catalog/excel/category-summary.ts`:

```ts
import { centsToDecimal, divideRoundingHalfUp, parseCents } from '@/features/proforma/money'

export type CategorySummary = {
  category: string
  count: number
  min: string
  max: string
  average: string
}

type PricedRow = { category_name: string; unit_price: string }

function summarize(category: string, prices: bigint[]): CategorySummary {
  const total = prices.reduce((sum, price) => sum + price, BigInt(0))
  return {
    category,
    count: prices.length,
    min: centsToDecimal(prices.reduce((a, b) => (b < a ? b : a))),
    max: centsToDecimal(prices.reduce((a, b) => (b > a ? b : a))),
    average: centsToDecimal(divideRoundingHalfUp(total, BigInt(prices.length))),
  }
}

// Resumen del reporte por categoría (spec del Excel §5.2), en céntimos: sin errores de redondeo.
export function summarizeByCategory(rows: PricedRow[]) {
  const byCategory = new Map<string, bigint[]>()
  for (const row of rows) {
    const price = parseCents(row.unit_price)
    if (price === null) continue
    const prices = byCategory.get(row.category_name)
    if (prices) prices.push(price)
    else byCategory.set(row.category_name, [price])
  }
  const categories = [...byCategory]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([category, prices]) => summarize(category, prices))
  const all = [...byCategory.values()].flat()
  return { categories, total: all.length > 0 ? summarize('Total', all) : null }
}
```

`src/features/catalog/excel/theme.ts`:

```ts
import 'server-only'
import type { Row, Workbook, Worksheet } from 'exceljs'

// Colores de la app (globals.css) en ARGB, para que los Excel se vean de la marca.
export const COLORS = {
  ink: 'FF121511',
  primary: 'FF72CE0B',
  zebra: 'FFF6FBEF',
  border: 'FFE3E7DE',
  muted: 'FF5D6559',
  group: 'FFEEF7E2',
  link: 'FF3F7D0A',
  warning: 'FFB54708',
  white: 'FFFFFFFF',
} as const

// Plus Jakarta Sans no viene con Excel: Calibri se ve igual en todos los equipos.
export const FONT = 'Calibri'
export const MONEY_FORMAT = '"S/" #,##0.00'
export const DATE_FORMAT = 'dd/mm/yyyy'

const hairline = { style: 'thin' as const, color: { argb: COLORS.border } }

export function styleHeaderRow(row: Row) {
  row.height = 22
  row.eachCell((cell) => {
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: COLORS.white } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ink } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: COLORS.primary } } }
  })
}

// Filas alternas en verde muy claro y bordes finos.
export function styleBodyRow(row: Row, index: number) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: FONT, size: 11, color: { argb: COLORS.ink } }
    cell.border = { top: hairline, bottom: hairline, left: hairline, right: hairline }
    cell.alignment = { vertical: 'top' }
    if (index % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebra } }
    }
  })
}

// Un día de Lima como medianoche UTC: Excel muestra justo ese día, sin desfases de huso.
export const excelDay = (day: string) => new Date(`${day}T00:00:00.000Z`)

// El logotipo arriba a la izquierda, con su proporción (900 × 510). ExcelJS tipa los binarios como
// ArrayBuffer: se le pasa una copia exacta del Buffer de Node.
export function addLogo(workbook: Workbook, sheet: Worksheet, logo: Buffer | null) {
  if (!logo) return
  const image = workbook.addImage({ buffer: new Uint8Array(logo).buffer, extension: 'jpeg' })
  sheet.addImage(image, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 85 } })
}
```

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit && pnpm typecheck && pnpm lint`
Expected: PASS. La proforma sigue usando las funciones movidas a través de la reexportación: sus importaciones no cambian.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml next.config.ts src/lib/files.ts src/features/proforma/money.ts src/features/proforma/document/files.ts src/features/catalog/price-columns.ts src/features/catalog/excel/category-summary.ts src/features/catalog/excel/theme.ts tests/unit/catalog-price-columns.test.ts tests/unit/catalog-category-summary.test.ts tests/unit/proforma-money.test.ts
git commit -m "feat: add ExcelJS with shared price columns, category summary and Excel theme"
```

---

### Task 8: Reporte completo

**Files:**
- Create: `src/features/catalog/excel/report.ts`
- Test: `tests/unit/catalog-excel-report.test.ts`

**Interfaces:**
- Consumes:
  - De la tarea 7: `priceColumns`, `summarizeByCategory` y el tema (`addLogo`, estilos, formatos y `excelDay`).
  - De la tarea 2: `limaDay` y `formatDay`.
- Produces:
  - `REPORT_TABLE_ROW = 8`.
  - `ReportInput = { rows: ProductListItem[]; companyName: string | null; logo: Buffer | null; generatedAt: Date; filtersText: string; viewUrl: string | null; truncatedAt: number | null }`.
  - `buildProductsReport(input): Promise<Buffer>`.

- [ ] **Step 1: Escribir la prueba, que lee el archivo de vuelta con ExcelJS**

Las lecturas de esta prueba se comprobaron con ExcelJS 4.4.0 en una carpeta aparte:
- el hipervínculo vuelve como `{ text, hyperlink }`;
- las fechas vuelven como `Date`;
- `views` incluye `state` e `ySplit`;
- `autoFilter` vuelve como texto `A8:I8`;
- las barras de datos vuelven en `conditionalFormattings`.

`tests/unit/catalog-excel-report.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildProductsReport, REPORT_TABLE_ROW } from '@/features/catalog/excel/report'
import type { ProductListItem } from '@/features/catalog/types'

const product = (overrides: Partial<ProductListItem>): ProductListItem => ({
  id: 'p1',
  code: 'LAP-001',
  name: 'Laptop básica',
  description: 'Core i3 · 8 GB',
  category_id: 'c1',
  category_name: 'Laptops',
  unit_price: '1180.00',
  // 03:00 UTC del 2 de octubre = 1 de octubre en Lima.
  created_at: '2026-10-02T03:00:00Z',
  updated_at: '2026-10-05T15:00:00Z',
  ...overrides,
})

const input = {
  rows: [
    product({}),
    product({
      id: 'p2',
      code: 'IMP-001',
      name: '=HIPERVINCULO("x")',
      description: null,
      category_name: 'Impresoras',
      unit_price: '590.00',
    }),
  ],
  companyName: 'Ventronix',
  logo: null,
  generatedAt: new Date('2026-10-02T19:35:00Z'),
  filtersText: 'Categoría: Laptops',
  viewUrl: 'https://ventronix-catalogo.vercel.app/products?category=c1',
  truncatedAt: null,
}

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer).buffer)
  return workbook
}

describe('buildProductsReport', () => {
  it('arma la cabecera con empresa, fecha de Lima, filtros, total y enlace', async () => {
    const sheet = (await load(await buildProductsReport(input))).getWorksheet('Productos')!
    expect(sheet.getCell('C1').value).toBe('Ventronix')
    expect(sheet.getCell('C2').value).toBe('Reporte de productos')
    expect(sheet.getCell('C3').value).toBe('Generado el 02/10/2026 a las 14:35 (hora de Lima)')
    expect(sheet.getCell('C4').value).toBe('Categoría: Laptops')
    expect(sheet.getCell('C5').value).toBe('2 productos')
    expect(sheet.getCell('C6').value).toMatchObject({
      text: 'Abrir esta vista en la app',
      hyperlink: 'https://ventronix-catalogo.vercel.app/products?category=c1',
    })
  })

  it('escribe la tabla con formatos, panel fijo, filtros y textos que no se ejecutan', async () => {
    const sheet = (await load(await buildProductsReport(input))).getWorksheet('Productos')!
    expect((sheet.getRow(REPORT_TABLE_ROW).values as unknown[]).slice(1)).toEqual([
      'N°',
      'Código',
      'Nombre',
      'Descripción',
      'Categoría',
      'Precio con IGV (S/)',
      'Valor sin IGV (S/)',
      'Fecha de registro',
      'Última modificación',
    ])
    const first = sheet.getRow(REPORT_TABLE_ROW + 1)
    expect(first.getCell(6).value).toBe(1180)
    expect(first.getCell(6).numFmt).toBe('"S/" #,##0.00')
    expect(first.getCell(7).value).toBe(1000)
    expect(first.getCell(8).value).toEqual(new Date('2026-10-01T00:00:00Z'))
    expect(first.getCell(8).numFmt).toBe('dd/mm/yyyy')
    const second = sheet.getRow(REPORT_TABLE_ROW + 2)
    expect(second.getCell(3).value).toBe('=HIPERVINCULO("x")')
    expect(second.getCell(3).type).toBe(ExcelJS.ValueType.String)
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: REPORT_TABLE_ROW })
    expect(sheet.autoFilter).toBe('A8:I8')
  })

  it('añade el resumen por categoría con barras de datos', async () => {
    const summary = (await load(await buildProductsReport(input))).getWorksheet(
      'Resumen por categoría',
    )!
    expect((summary.getRow(2).values as unknown[]).slice(1)).toEqual([
      'Impresoras',
      1,
      590,
      590,
      590,
    ])
    expect((summary.getRow(4).values as unknown[]).slice(1, 3)).toEqual(['Total', 2])
    expect(JSON.stringify(summary.conditionalFormattings)).toContain('dataBar')
  })

  it('avisa del recorte y pone el logotipo', async () => {
    const logo = readFileSync('public/brand/ventronix-logo-proforma.jpg')
    const report = await buildProductsReport({ ...input, logo, truncatedAt: 10000 })
    const sheet = (await load(report)).getWorksheet('Productos')!
    expect(sheet.getCell('C7').value).toBe('Este reporte muestra los primeros 10 000 productos.')
    expect(sheet.getImages()).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-excel-report.test.ts`
Expected: FAIL. No existe `@/features/catalog/excel/report`.

- [ ] **Step 3: Implementar el reporte**

`src/features/catalog/excel/report.ts`:

```ts
import 'server-only'
import ExcelJS from 'exceljs'
import { formatDay, limaDay } from '../list-options'
import { priceColumns } from '../price-columns'
import type { ProductListItem } from '../types'
import { summarizeByCategory } from './category-summary'
import {
  addLogo,
  COLORS,
  DATE_FORMAT,
  excelDay,
  FONT,
  MONEY_FORMAT,
  styleBodyRow,
  styleHeaderRow,
} from './theme'

export type ReportInput = {
  rows: ProductListItem[]
  companyName: string | null
  logo: Buffer | null
  generatedAt: Date
  filtersText: string
  viewUrl: string | null
  truncatedAt: number | null
}

// La tabla empieza aquí: arriba van el logotipo y la cabecera (spec del Excel §5.2).
export const REPORT_TABLE_ROW = 8

const limaTime = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// 10000 → «10 000», como en los textos de la spec.
const spaced = (count: number) => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

function writeHeader(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, input: ReportInput) {
  addLogo(workbook, sheet, input.logo)
  const put = (address: string, value: ExcelJS.CellValue, font: Partial<ExcelJS.Font>) => {
    const cell = sheet.getCell(address)
    cell.value = value
    cell.font = { name: FONT, ...font }
  }
  const total = input.rows.length
  const muted = { size: 10, color: { argb: COLORS.muted } }
  put('C1', input.companyName ?? 'Catálogo de productos', {
    size: 16,
    bold: true,
    color: { argb: COLORS.ink },
  })
  put('C2', 'Reporte de productos', { size: 13, bold: true, color: { argb: COLORS.link } })
  put(
    'C3',
    `Generado el ${formatDay(limaDay(input.generatedAt))} a las ${limaTime.format(input.generatedAt)} (hora de Lima)`,
    muted,
  )
  put('C4', input.filtersText, muted)
  put('C5', `${spaced(total)} ${total === 1 ? 'producto' : 'productos'}`, {
    size: 11,
    bold: true,
    color: { argb: COLORS.ink },
  })
  if (input.viewUrl) {
    put(
      'C6',
      { text: 'Abrir esta vista en la app', hyperlink: input.viewUrl },
      { size: 10, underline: true, color: { argb: COLORS.link } },
    )
  }
  if (input.truncatedAt !== null) {
    put('C7', `Este reporte muestra los primeros ${spaced(input.truncatedAt)} productos.`, {
      size: 10,
      bold: true,
      color: { argb: COLORS.warning },
    })
  }
}

function writeSummary(workbook: ExcelJS.Workbook, rows: ProductListItem[]) {
  const summary = summarizeByCategory(rows)
  const sheet = workbook.addWorksheet('Resumen por categoría', {
    properties: { tabColor: { argb: COLORS.ink } },
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = [{ width: 28 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 }]
  const header = sheet.getRow(1)
  header.values = ['Categoría', 'Productos', 'Precio mínimo', 'Precio máximo', 'Precio promedio']
  styleHeaderRow(header)
  const lines = summary.total ? [...summary.categories, summary.total] : []
  lines.forEach((line, index) => {
    const row = sheet.getRow(2 + index)
    row.values = [line.category, line.count, Number(line.min), Number(line.max), Number(line.average)]
    styleBodyRow(row, index)
    for (const column of [3, 4, 5]) row.getCell(column).numFmt = MONEY_FORMAT
    if (line === summary.total) row.font = { name: FONT, bold: true }
  })
  if (summary.categories.length > 0) {
    sheet.addConditionalFormatting({
      ref: `B2:B${1 + summary.categories.length}`,
      rules: [
        {
          type: 'dataBar',
          priority: 1,
          cfvo: [{ type: 'num', value: 0 }, { type: 'max' }],
          color: { argb: COLORS.primary },
          gradient: false,
        },
      ],
    })
  }
}

// Reporte completo (spec del Excel §5.2): para uso interno; se puede volver a subir en la carga
// masiva. Los textos van siempre como texto, nunca como fórmula.
export async function buildProductsReport(input: ReportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  workbook.created = input.generatedAt
  const prices = priceColumns()
  const headers = [
    'N°',
    'Código',
    'Nombre',
    'Descripción',
    'Categoría',
    prices.catalog,
    ...(prices.derived ? [prices.derived.label] : []),
    'Fecha de registro',
    'Última modificación',
  ]
  const widths = [6, 16, 40, 60, 20, 18, ...(prices.derived ? [16] : []), 14, 16]
  const sheet = workbook.addWorksheet('Productos', {
    properties: { tabColor: { argb: COLORS.primary } },
    views: [{ state: 'frozen', ySplit: REPORT_TABLE_ROW }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${REPORT_TABLE_ROW}:${REPORT_TABLE_ROW}`,
    },
  })
  sheet.columns = widths.map((width) => ({ width }))
  writeHeader(workbook, sheet, input)

  const header = sheet.getRow(REPORT_TABLE_ROW)
  header.values = headers
  styleHeaderRow(header)
  const priceColumn = 6
  input.rows.forEach((product, index) => {
    const row = sheet.getRow(REPORT_TABLE_ROW + 1 + index)
    row.values = [
      index + 1,
      product.code,
      product.name,
      product.description ?? '',
      product.category_name,
      Number(product.unit_price),
      ...(prices.derived ? [Number(prices.derived.from(product.unit_price))] : []),
      excelDay(limaDay(new Date(product.created_at))),
      excelDay(limaDay(new Date(product.updated_at))),
    ]
    styleBodyRow(row, index)
    row.getCell(4).alignment = { vertical: 'top', wrapText: true }
    row.getCell(priceColumn).numFmt = MONEY_FORMAT
    if (prices.derived) row.getCell(priceColumn + 1).numFmt = MONEY_FORMAT
    row.getCell(headers.length - 1).numFmt = DATE_FORMAT
    row.getCell(headers.length).numFmt = DATE_FORMAT
  })
  sheet.autoFilter = {
    from: { row: REPORT_TABLE_ROW, column: 1 },
    to: { row: REPORT_TABLE_ROW, column: headers.length },
  }

  writeSummary(workbook, input.rows)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
```

- [ ] **Step 4: Ejecutar la prueba**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-excel-report.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/excel/report.ts tests/unit/catalog-excel-report.test.ts
git commit -m "feat: build the full products report in Excel"
```

---

### Task 9: Lista de precios

**Files:**
- Create: `src/features/catalog/excel/price-list.ts`
- Test: `tests/unit/catalog-excel-price-list.test.ts`

**Interfaces:**
- Consumes:
  - De la tarea 7: el tema (`addLogo` y estilos) y `priceColumns`.
  - `CompanyProfile`, de `@/features/company/schemas`.
  - `completeCompany`, de `tests/support/company.ts` (ya existe).
- Produces:
  - `PRICE_LIST_TABLE_ROW = 7`.
  - `PriceListInput = { rows: ProductListItem[]; company: CompanyProfile | null; logo: Buffer | null; generatedAt: Date }`.
  - `buildPriceList(input): Promise<Buffer>`.

- [ ] **Step 1: Escribir la prueba**

`tests/unit/catalog-excel-price-list.test.ts`:

```ts
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildPriceList, PRICE_LIST_TABLE_ROW } from '@/features/catalog/excel/price-list'
import type { ProductListItem } from '@/features/catalog/types'
import { completeCompany } from '../support/company'

const product = (code: string, name: string, category: string, price: string): ProductListItem => ({
  id: code,
  code,
  name,
  description: `Descripción de ${name}`,
  category_id: category,
  category_name: category,
  unit_price: price,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
})

async function sheetOf(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer).buffer)
  return workbook.getWorksheet('Lista de precios')!
}

describe('buildPriceList', () => {
  it('pone los datos de la empresa, la vigencia y la nota del IGV', async () => {
    const sheet = await sheetOf(
      await buildPriceList({
        rows: [product('LAP-1', 'Laptop', 'Laptops', '1180.00')],
        company: { ...completeCompany, trade_name: 'Ventronix', email: 'ventas@ventronix.pe' },
        logo: null,
        generatedAt: new Date('2026-10-02T15:00:00Z'),
      }),
    )
    expect(sheet.getCell('C1').value).toBe('Ventronix')
    expect(sheet.getCell('C2').value).toBe(
      'RUC 20000000001 · Av. Prueba 123, Huamanga · Tel. 066 312345 · ventas@ventronix.pe',
    )
    expect(sheet.getCell('C3').value).toBe('Lista de precios')
    expect(sheet.getCell('C4').value).toBe('Vigente al 02/10/2026')
    expect(sheet.getCell('C5').value).toBe('Precios en soles (S/), con IGV incluido.')
  })

  it('agrupa por categoría de la A a la Z, respeta el orden y no trae datos internos', async () => {
    const sheet = await sheetOf(
      await buildPriceList({
        rows: [
          product('LAP-2', 'Zeta', 'Laptops', '900.00'),
          product('IMP-1', 'Láser', 'Impresoras', '590.00'),
          product('LAP-1', 'Alfa', 'Laptops', '1180.00'),
        ],
        company: null,
        logo: null,
        generatedAt: new Date('2026-10-02T15:00:00Z'),
      }),
    )
    const header = PRICE_LIST_TABLE_ROW
    expect((sheet.getRow(header).values as unknown[]).slice(1)).toEqual([
      'Código',
      'Producto',
      'Descripción',
      'Precio con IGV (S/)',
    ])
    const firstColumn = [1, 2, 3, 4, 5].map((offset) => sheet.getCell(header + offset, 1).value)
    expect(firstColumn).toEqual(['Impresoras', 'IMP-1', 'Laptops', 'LAP-2', 'LAP-1'])
    expect(sheet.getCell(header + 1, 1).isMerged).toBe(true)
    expect(sheet.getCell(header + 2, 4).value).toBe(590)
    expect(sheet.getCell('C1').value).toBe('Catálogo de productos')
    expect(sheet.getCell('C2').value).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-excel-price-list.test.ts`
Expected: FAIL. El módulo no existe.

- [ ] **Step 3: Implementar la lista de precios**

`src/features/catalog/excel/price-list.ts`:

```ts
import 'server-only'
import ExcelJS from 'exceljs'
import type { CompanyProfile } from '@/features/company/schemas'
import { formatDay, limaDay } from '../list-options'
import { priceColumns } from '../price-columns'
import type { ProductListItem } from '../types'
import { addLogo, COLORS, FONT, MONEY_FORMAT, styleBodyRow, styleHeaderRow } from './theme'

export type PriceListInput = {
  rows: ProductListItem[]
  company: CompanyProfile | null
  logo: Buffer | null
  generatedAt: Date
}

export const PRICE_LIST_TABLE_ROW = 7

// Lista de precios para clientes (spec del Excel §5.3): agrupada por categoría, con los datos de
// contacto de «Empresa» que estén completos y sin datos internos (fechas, N°, resumen).
export async function buildPriceList(input: PriceListInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  workbook.created = input.generatedAt
  const prices = priceColumns()
  const sheet = workbook.addWorksheet('Lista de precios', {
    properties: { tabColor: { argb: COLORS.primary } },
    views: [{ state: 'frozen', ySplit: PRICE_LIST_TABLE_ROW }],
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${PRICE_LIST_TABLE_ROW}:${PRICE_LIST_TABLE_ROW}`,
    },
  })
  sheet.columns = [{ width: 16 }, { width: 38 }, { width: 50 }, { width: 18 }]
  addLogo(workbook, sheet, input.logo)

  const company = input.company
  const contact = [
    company?.ruc ? `RUC ${company.ruc}` : null,
    company?.address ?? null,
    company && company.phones.length > 0 ? `Tel. ${company.phones.join(' / ')}` : null,
    company?.email ?? null,
  ]
    .filter(Boolean)
    .join(' · ')
  const put = (address: string, value: string, font: Partial<ExcelJS.Font>) => {
    const cell = sheet.getCell(address)
    cell.value = value
    cell.font = { name: FONT, ...font }
  }
  const muted = { size: 10, color: { argb: COLORS.muted } }
  put('C1', company?.trade_name ?? company?.legal_name ?? 'Catálogo de productos', {
    size: 16,
    bold: true,
    color: { argb: COLORS.ink },
  })
  if (contact) put('C2', contact, muted)
  put('C3', 'Lista de precios', { size: 14, bold: true, color: { argb: COLORS.link } })
  put('C4', `Vigente al ${formatDay(limaDay(input.generatedAt))}`, muted)
  put('C5', prices.note, { ...muted, italic: true })

  const header = sheet.getRow(PRICE_LIST_TABLE_ROW)
  header.values = ['Código', 'Producto', 'Descripción', prices.catalog]
  styleHeaderRow(header)

  const groups = new Map<string, ProductListItem[]>()
  for (const product of input.rows) {
    const list = groups.get(product.category_name)
    if (list) list.push(product)
    else groups.set(product.category_name, [product])
  }
  let current = PRICE_LIST_TABLE_ROW + 1
  for (const category of [...groups.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
    sheet.mergeCells(current, 1, current, 4)
    const title = sheet.getCell(current, 1)
    title.value = category
    title.font = { name: FONT, size: 12, bold: true, color: { argb: COLORS.ink } }
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.group } }
    current += 1
    groups.get(category)!.forEach((product, index) => {
      const row = sheet.getRow(current)
      row.values = [product.code, product.name, product.description ?? '', Number(product.unit_price)]
      styleBodyRow(row, index)
      row.getCell(3).alignment = { vertical: 'top', wrapText: true }
      row.getCell(4).numFmt = MONEY_FORMAT
      current += 1
    })
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
```

- [ ] **Step 4: Ejecutar la prueba**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-excel-price-list.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/excel/price-list.ts tests/unit/catalog-excel-price-list.test.ts
git commit -m "feat: build a customer price list in Excel grouped by category"
```

---

### Task 10: Botón «Excel» y descarga

**Files:**
- Create:
  - `src/features/catalog/excel/export-request.ts`
  - `src/features/catalog/products/excel-actions.ts`
  - `src/features/catalog/products/components/export-menu.tsx`
- Modify:
  - `src/features/catalog/products/queries.ts`
  - `src/features/catalog/products/components/product-list.tsx`
- Test: `tests/unit/catalog-export-request.test.ts`, `tests/integration/catalog-search.test.ts`, `tests/e2e/catalog-excel.spec.ts`

**Interfaces:**
- Consumes:
  - `buildProductsReport` (tarea 8) y `buildPriceList` (tarea 9), cargados con `import()` dinámico.
  - De la tarea 2: `resolveDateRange`, `describeDateFilter`, `isIsoDay`, `limaDay` y las constantes; también `searchArgs`, `itemSchema` y `toListItem`, internos de `queries.ts`.
  - `getCompanyProfile`, `withOwner`, `invalid`, `failure` y `settle`, que ya existen.
- Produces:
  - Datos: `exportProductRows(supabase, query: Omit<ProductQuery, 'page'>, maxRows): Promise<ProductListItem[]>`.
  - Constantes: `EXPORT_MAX_ROWS = 10_000`, `EXPORT_FORMATS`, `ExportFormat`.
  - Validación: `exportFiltersSchema` y `ExportFilters`.
  - Textos y rutas: `describeExportFilters(filters, categoryName)`, `fileSlug(text)`, `exportFileName(format, categoryName, now)`, `exportViewPath(filters)`.
  - Server Action: `exportProducts(filters: ExportFilters, format: ExportFormat): Promise<ActionResult<ExcelFile>>`.
  - Componente: `ExportMenu({ filters, disabled })`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/catalog-export-request.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  describeExportFilters,
  exportFileName,
  exportFiltersSchema,
  exportViewPath,
  fileSlug,
} from '@/features/catalog/excel/export-request'

const base = {
  search: '',
  category: null,
  dateBy: 'created',
  date: null,
  from: null,
  to: null,
  sort: 'name',
} as const
const LATE_NIGHT = new Date('2026-10-02T04:30:00Z')

describe('export-request', () => {
  it('describe filtros y orden como en la spec', () => {
    expect(describeExportFilters(base, null)).toBe('Sin filtros')
    expect(
      describeExportFilters({ ...base, search: 'hp', date: '7d', sort: 'price-desc' }, 'Laptops'),
    ).toBe(
      'Categoría: Laptops · Búsqueda: hp · Registro: últimos 7 días · Orden: Precio de mayor a menor',
    )
    expect(describeExportFilters({ ...base, sort: 'newest' }, null)).toBe(
      'Orden: Más recientes (registro)',
    )
  })

  it('nombra el archivo con el día de Lima y la categoría sin símbolos', () => {
    expect(exportFileName('report', 'Impresión & Copias', LATE_NIGHT)).toBe(
      'productos-impresion-copias-2026-10-01.xlsx',
    )
    expect(exportFileName('report', null, LATE_NIGHT)).toBe('productos-2026-10-01.xlsx')
    expect(exportFileName('price-list', 'Laptops', LATE_NIGHT)).toBe(
      'lista-de-precios-2026-10-01.xlsx',
    )
    expect(fileSlug('  Ñandú Ópticos  ')).toBe('nandu-opticos')
    expect(exportFileName('report', '%%%', LATE_NIGHT)).toBe('productos-2026-10-01.xlsx')
  })

  it('arma la URL de la vista sin los valores por defecto', () => {
    expect(exportViewPath(base)).toBe('/products')
    expect(
      exportViewPath({
        ...base,
        dateBy: 'updated',
        date: 'custom',
        from: '2026-09-01',
        to: null,
        sort: 'newest',
      }),
    ).toBe('/products?dateBy=updated&date=custom&from=2026-09-01&sort=newest')
  })

  it('valida lo que llega del navegador', () => {
    const parsed = exportFiltersSchema.safeParse({ ...base, search: '  hp   laser ', page: 3 })
    expect(parsed.data).toEqual({ ...base, search: 'hp laser' })
    expect(exportFiltersSchema.safeParse({ ...base, category: 'no-es-un-id' }).success).toBe(false)
    expect(exportFiltersSchema.safeParse({ ...base, from: '2026-02-30' }).success).toBe(false)
    expect(exportFiltersSchema.safeParse({ ...base, sort: 'precio' }).success).toBe(false)
  })
})
```

En `tests/integration/catalog-search.test.ts`:
- Añade `exportProductRows` al import de `@/features/catalog/products/queries`.
- Añade al final:

```ts
describe('exportación desde el código', () => {
  it('exportProductRows devuelve todas las filas como productos de la lista', async () => {
    await insertProduct('B-1', 'Beta', laptops, '20.00')
    await insertProduct('A-1', 'Alfa', laptops, '10.50')
    const rows = await exportProductRows(supabase, { search: '', category: null }, 10)
    expect(rows.map((row) => row.code)).toEqual(['A-1', 'B-1'])
    expect(rows[0]).toMatchObject({ unit_price: '10.50', category_name: 'Laptops' })
    expect(await exportProductRows(outsider, { search: '', category: null }, 10)).toEqual([])
  })
})
```

`tests/e2e/catalog-excel.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { connect, fillCompanyProfile, resetCatalog, resetCompanyProfile } from '../integration/db'
import { login } from './session'

async function seed() {
  const db = await connect()
  try {
    await resetCatalog(db)
    await resetCompanyProfile(db)
    await fillCompanyProfile(db)
    const { rows } = await db.query<{ id: string; name: string }>(
      "insert into public.categories (name) values ('Laptops'), ('Impresoras') returning id, name",
    )
    const id = (name: string) => rows.find((row) => row.name === name)!.id
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, description) values
         ('LAP-001', 'Laptop básica', $1, 1180.00, 'Core i3'),
         ('LAP-002', 'Laptop pro', $1, 3540.00, null),
         ('IMP-001', 'Impresora láser', $2, 590.00, 'Monocromática')`,
      [id('Laptops'), id('Impresoras')],
    )
    return { laptops: id('Laptops') }
  } finally {
    await db.end()
  }
}

async function downloadExcel(page: Page, option: RegExp) {
  await page.getByRole('button', { name: 'Descargar Excel' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: option }).click(),
  ])
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile((await download.path())!)
  return { workbook, fileName: download.suggestedFilename() }
}

test('el reporte completo trae lo filtrado, en el orden de la lista', async ({ page }) => {
  const { laptops } = await seed()
  await login(page)
  await page.goto(`/products?category=${laptops}&sort=price-desc`)
  await expect(
    page
      .getByRole('region', { name: 'Lista de productos' })
      .getByText('Laptop pro')
      .filter({ visible: true }),
  ).toBeVisible()
  const { workbook, fileName } = await downloadExcel(page, /Reporte completo/)
  expect(fileName).toMatch(/^productos-laptops-\d{4}-\d{2}-\d{2}\.xlsx$/)
  const sheet = workbook.getWorksheet('Productos')!
  expect(sheet.getCell('C4').value).toBe('Categoría: Laptops · Orden: Precio de mayor a menor')
  expect([sheet.getCell('B9').value, sheet.getCell('B10').value]).toEqual(['LAP-002', 'LAP-001'])
  expect(sheet.getCell('F9').value).toBe(3540)
  await expect(page.getByText('Excel descargado · 2 productos')).toBeVisible()
})

test('la lista de precios agrupa por categoría y trae los datos de la empresa', async ({
  page,
}) => {
  await seed()
  await login(page)
  const { workbook, fileName } = await downloadExcel(page, /Lista de precios/)
  expect(fileName).toMatch(/^lista-de-precios-\d{4}-\d{2}-\d{2}\.xlsx$/)
  const sheet = workbook.getWorksheet('Lista de precios')!
  expect(sheet.getCell('C1').value).toBe('Empresa de Pruebas S.A.C.')
  expect(String(sheet.getCell('C2').value)).toContain('RUC 20000000001')
  expect(['A8', 'A9', 'A10'].map((cell) => sheet.getCell(cell).value)).toEqual([
    'Impresoras',
    'IMP-001',
    'Laptops',
  ])
})

test('sin productos que descargar, el botón queda desactivado', async ({ page }) => {
  await seed()
  await login(page)
  await page.goto('/products?search=nada-que-coincida')
  await expect(page.getByText('No encontramos productos')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled()
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run:
- `pnpm exec vitest run --project unit tests/unit/catalog-export-request.test.ts`
- `pnpm exec vitest run --project integration tests/integration/catalog-search.test.ts`
- `pnpm exec playwright test tests/e2e/catalog-excel.spec.ts --project desktop`

Expected: FAIL en las tres. No existen el módulo, `exportProductRows` ni el botón.

- [ ] **Step 3: Implementar consulta, petición, acción y menú**

En `src/features/catalog/products/queries.ts`, al final:

```ts
// Todas las filas filtradas para los Excel (spec §5.4). Quien llama pide una de más para saber si
// hubo recorte.
export async function exportProductRows(
  supabase: Client,
  query: Omit<ProductQuery, 'page'>,
  maxRows: number,
): Promise<ProductListItem[]> {
  const { data, error } = await supabase.rpc('export_products', {
    ...searchArgs(query),
    max_rows: maxRows,
  })
  if (error) throw error
  return z.array(itemSchema).parse(data).map(toListItem)
}
```

`src/features/catalog/excel/export-request.ts`:

```ts
import { z } from 'zod'
import {
  DATE_FIELDS,
  DATE_PRESETS,
  describeDateFilter,
  isIsoDay,
  limaDay,
  PRODUCT_SORTS,
  type ProductSort,
} from '../list-options'
import { idSchema } from '../schemas'
import { normalizeSearch, SEARCH_MAX_LENGTH } from '../search-pattern'

// Tope del Excel de salida (spec del Excel §5.1 y §10).
export const EXPORT_MAX_ROWS = 10_000
export const EXPORT_FORMATS = ['report', 'price-list'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

const day = z.string().refine(isIsoDay, 'Fecha no válida').nullable()

// Los filtros de la URL, sin la página. Llegan del navegador: el servidor los valida.
export const exportFiltersSchema = z.object({
  search: z.string().max(SEARCH_MAX_LENGTH * 4).transform(normalizeSearch),
  category: idSchema.nullable(),
  dateBy: z.enum(DATE_FIELDS),
  date: z.enum(DATE_PRESETS).nullable(),
  from: day,
  to: day,
  sort: z.enum(PRODUCT_SORTS),
})
export type ExportFilters = z.input<typeof exportFiltersSchema>
type ParsedFilters = z.output<typeof exportFiltersSchema>

// Cómo se nombra el orden en la cabecera del reporte (spec §5.2: «Orden: Precio de mayor a menor»).
const SORT_PHRASES: Record<Exclude<ProductSort, 'name'>, string> = {
  newest: 'Más recientes (registro)',
  updated: 'Modificados recientemente',
  'price-asc': 'Precio de menor a mayor',
  'price-desc': 'Precio de mayor a menor',
}

// «Categoría: Laptops · Búsqueda: hp · Registro: últimos 7 días · Orden: Precio de mayor a menor».
export function describeExportFilters(filters: ParsedFilters, categoryName: string | null) {
  const parts = [
    categoryName ? `Categoría: ${categoryName}` : null,
    filters.search ? `Búsqueda: ${filters.search}` : null,
    describeDateFilter(filters),
    filters.sort === 'name' ? null : `Orden: ${SORT_PHRASES[filters.sort]}`,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Sin filtros'
}

// «Impresión & Copias» → «impresion-copias»: sin tildes ni símbolos, válido en cualquier sistema.
export function fileSlug(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export function exportFileName(format: ExportFormat, categoryName: string | null, now: Date) {
  const today = limaDay(now)
  if (format === 'price-list') return `lista-de-precios-${today}.xlsx`
  const slug = categoryName ? fileSlug(categoryName) : ''
  return slug ? `productos-${slug}-${today}.xlsx` : `productos-${today}.xlsx`
}

// La misma vista en la app, sin los valores por defecto (spec §5.2, «Abrir esta vista en la app»).
export function exportViewPath(filters: ParsedFilters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.category) params.set('category', filters.category)
  if (filters.dateBy !== 'created') params.set('dateBy', filters.dateBy)
  if (filters.date) params.set('date', filters.date)
  if (filters.date === 'custom' && filters.from) params.set('from', filters.from)
  if (filters.date === 'custom' && filters.to) params.set('to', filters.to)
  if (filters.sort !== 'name') params.set('sort', filters.sort)
  const query = params.toString()
  return query ? `/products?${query}` : '/products'
}
```

`src/features/catalog/products/excel-actions.ts`:

```ts
'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { headers } from 'next/headers'
import { z } from 'zod'
import { getCompanyProfile } from '@/features/company/queries'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { failure, invalid } from '../action-errors'
import {
  describeExportFilters,
  EXPORT_FORMATS,
  EXPORT_MAX_ROWS,
  exportFileName,
  exportFiltersSchema,
  exportViewPath,
  type ExportFilters,
  type ExportFormat,
} from '../excel/export-request'
import { resolveDateRange } from '../list-options'
import { exportProductRows } from './queries'

export type ExcelFile = { base64: string; fileName: string; count: number; truncated: boolean }

// Ya se incluye en la función de /products (next.config.ts, outputFileTracingIncludes).
const LOGO = path.join(process.cwd(), 'public/brand/ventronix-logo-proforma.jpg')

// Dirección de la app para «Abrir esta vista en la app», tomada de la petición (spec §5.2).
async function viewUrl(pathAndQuery: string) {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host')
  if (!host) return null
  const protocol =
    list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}${pathAndQuery}`
}

// «Descargar Excel» (spec del Excel §5): lo filtrado, en el orden de la lista. ExcelJS se carga
// solo aquí, con import(), para no frenar el arranque de la página.
export async function exportProducts(
  filters: ExportFilters,
  format: ExportFormat,
): Promise<ActionResult<ExcelFile>> {
  return withOwner(async ({ supabase }) => {
    const parsed = exportFiltersSchema.safeParse(filters)
    if (!parsed.success) {
      return failure(
        'VALIDATION',
        'Los filtros de la lista no son válidos. Recarga la página e inténtalo de nuevo.',
      )
    }
    const kind = z.enum(EXPORT_FORMATS).safeParse(format)
    if (!kind.success) return invalid(kind.error)

    const now = new Date()
    const range = resolveDateRange(parsed.data, now)
    const rows = await exportProductRows(
      supabase,
      {
        search: parsed.data.search,
        category: parsed.data.category,
        dateBy: parsed.data.dateBy,
        dateFrom: range?.from ?? null,
        dateTo: range?.to ?? null,
        sort: parsed.data.sort,
      },
      EXPORT_MAX_ROWS + 1,
    )
    if (rows.length === 0) {
      return failure('VALIDATION', 'No hay productos para descargar con estos filtros.')
    }
    const truncated = rows.length > EXPORT_MAX_ROWS
    const included = truncated ? rows.slice(0, EXPORT_MAX_ROWS) : rows

    const category = parsed.data.category
      ? await supabase.from('categories').select('name').eq('id', parsed.data.category).maybeSingle()
      : null
    const categoryName = category?.data?.name ?? null
    const [company, logo] = await Promise.all([
      getCompanyProfile(supabase),
      readFile(LOGO).catch(() => null),
    ])

    const buffer =
      kind.data === 'report'
        ? await (
            await import('../excel/report')
          ).buildProductsReport({
            rows: included,
            companyName: company?.trade_name ?? company?.legal_name ?? null,
            logo,
            generatedAt: now,
            filtersText: describeExportFilters(parsed.data, categoryName),
            viewUrl: await viewUrl(exportViewPath(parsed.data)),
            truncatedAt: truncated ? EXPORT_MAX_ROWS : null,
          })
        : await (
            await import('../excel/price-list')
          ).buildPriceList({ rows: included, company, logo, generatedAt: now })

    return {
      ok: true,
      data: {
        base64: buffer.toString('base64'),
        fileName: exportFileName(kind.data, categoryName, now),
        count: included.length,
        truncated,
      },
    }
  })
}
```

`src/features/catalog/products/components/export-menu.tsx`:

```tsx
'use client'

import { ChevronDown, FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { settle } from '@/lib/action-result'
import { base64ToFile, downloadFile, XLSX_MIME } from '@/lib/files'
import type { ExportFilters, ExportFormat } from '../../excel/export-request'
import { exportProducts } from '../excel-actions'

const OPTIONS: { format: ExportFormat; title: string; help: string }[] = [
  {
    format: 'report',
    title: 'Reporte completo',
    help: 'Todos los datos, para ti. Se puede volver a subir en Carga masiva.',
  },
  {
    format: 'price-list',
    title: 'Lista de precios',
    help: 'Para enviar a tus clientes: con tus datos de contacto y agrupada por categoría.',
  },
]

// «Descargar Excel» (spec del Excel §5.1): lo filtrado y en el orden de la lista. Muestra «Excel»
// para que la cabecera quepa en una línea en un laptop; el nombre completo va en aria-label y title.
export function ExportMenu({ filters, disabled }: { filters: ExportFilters; disabled: boolean }) {
  const [pending, setPending] = useState(false)
  const name = pending ? 'Preparando Excel…' : 'Descargar Excel'

  async function download(format: ExportFormat) {
    setPending(true)
    const result = await settle(exportProducts(filters, format))
    setPending(false)
    if (!result.ok) {
      toast.error(
        result.error.code === 'UNEXPECTED'
          ? 'No se pudo preparar el Excel. Revisa tu conexión e inténtalo de nuevo.'
          : result.error.message,
      )
      return
    }
    const { base64, fileName, count, truncated } = result.data
    downloadFile(base64ToFile(base64, fileName, XLSX_MIME))
    if (truncated) {
      toast.warning(
        'Se descargaron los primeros 10 000 productos. Usa los filtros para descargar el resto.',
      )
    } else {
      toast.success(`Excel descargado · ${count} ${count === 1 ? 'producto' : 'productos'}`)
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled || pending}>
        <Button
          variant="outline"
          size="sm"
          aria-label={name}
          title={disabled ? 'No hay productos para descargar con estos filtros.' : name}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : (
            <FileSpreadsheet aria-hidden />
          )}
          <span className="max-sm:hidden">{pending ? 'Preparando…' : 'Excel'}</span>
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 grid w-72 gap-1 rounded-xl border bg-popover p-1.5 shadow-lg"
        >
          {OPTIONS.map((option) => (
            <DropdownMenu.Item
              key={option.format}
              onSelect={() => void download(option.format)}
              className="grid cursor-pointer gap-0.5 rounded-lg px-3 py-2.5 outline-none data-highlighted:bg-accent"
            >
              <span className="text-sm font-semibold">{option.title}</span>
              <span className="text-xs text-muted-foreground">{option.help}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

En `src/features/catalog/products/components/product-list.tsx`:
- Importa `ExportMenu` desde `'./export-menu'`.
- En el grupo derecho de la cabecera, entre `SortSelect` y el `PageStepper`, añade el menú. `filters` lleva también `page`, que el esquema descarta:

```tsx
          <ExportMenu filters={filters} disabled={!data || data.total === 0} />
```

- [ ] **Step 4: Ejecutar las pruebas**

Run:
- `pnpm exec vitest run --project unit tests/unit/catalog-export-request.test.ts`
- `pnpm exec vitest run --project integration tests/integration/catalog-search.test.ts`
- `pnpm exec playwright test tests/e2e/catalog-excel.spec.ts tests/e2e/catalog.spec.ts`
- `pnpm typecheck && pnpm lint`

Expected: PASS en todo, en desktop y en mobile. Eso incluye «al menos 6 productos».

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/products/queries.ts src/features/catalog/excel/export-request.ts src/features/catalog/products/excel-actions.ts src/features/catalog/products/components/export-menu.tsx src/features/catalog/products/components/product-list.tsx tests/unit/catalog-export-request.test.ts tests/integration/catalog-search.test.ts tests/e2e/catalog-excel.spec.ts
git commit -m "feat: download the filtered products as a report or a price list"
```

---

### Task 11: Documentación y verificación completa

**Files:**
- Modify: `docs/deployment.md`

- [ ] **Step 1: Actualizar la guía de despliegue**

En `docs/deployment.md`, sección «3. Comprobación después de publicar»:

1. Sustituye la primera frase por:

   > Antes de publicar esta versión, haz una copia de seguridad (sección 4) y aplica las migraciones nuevas con `pnpm db:push`. La más reciente es `202610020001_product_list_filters.sql`: fecha y orden de la lista, Excel e indicadores.

2. Añade estas casillas a la lista:

```markdown
- [ ] Los indicadores junto a «Productos» muestran cifras y cada uno aplica su filtro.
- [ ] El filtro de fecha (registro o modificación) y el orden cambian la lista y se conservan al recargar.
- [ ] El botón «Excel» descarga el reporte completo y la lista de precios con lo filtrado.
```

- [ ] **Step 2: Verificación completa**

Run: `pnpm validate && pnpm test:integration && pnpm test:e2e`
Expected:
- Todo en verde.
- `validate` incluye lint, tipos, formato, pruebas unitarias y de componentes, y build.
- Las e2e corren en desktop y en mobile.

- [ ] **Step 3: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: list the phase 1 migration and checks in the deployment guide"
```

- [ ] **Step 4: Revisión final y entrega**

1. Revisión final de toda la rama, según `superpowers:executing-plans`. Sin subagentes, la hace quien implementa, en una pasada aparte, y queda anotada en el ledger.
2. Aviso al usuario, con lo que le toca hacer:
   1. Aplicar la migración en la nube con `pnpm db:push`.
   2. Hacer push.
   3. En Vercel, **Deployments → Create Deployment → `main`**.
   4. Reiniciar su `pnpm start` si lo usa, porque hubo `pnpm build`.
