# Fase 2: carga masiva de productos desde Excel — Implementation Plan

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:executing-plans (ejecución inline: el usuario pidió no usar subagentes). Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Goal:** Que quien gestiona el catálogo pueda crear y actualizar muchos productos a la vez con un Excel. Lo hace en `/products/import`, una pantalla guiada que muestra antes de guardar qué pasará con cada fila, avisa de lo sospechoso, importa todo o nada y deja un comprobante para revertir.

**Architecture:**
- **Base de datos.** `product_import_plan` decide, con la misma lógica para la vista previa y para la importación, qué pasa con cada fila: se crea, se actualiza (solo en las columnas presentes) o no cambia.
  - `preview_product_import` lo devuelve.
  - `import_products` lo ejecuta en una sola transacción.
- **Servidor.** Un servicio (`import-service.ts`):
  1. lee el `.xlsx` con ExcelJS;
  2. limpia cada celda;
  3. valida con las reglas del formulario;
  4. compara las categorías;
  5. pide el plan a la base y arma la vista previa.

  Las Server Actions son envoltorios finos con `withOwner`. Cada petición vuelve a leer y validar el archivo: nunca se confía en el navegador.
- **Pantalla.** `/products/import` con dos intenciones, tres pasos, la vista previa (opciones, resumen, decisiones de categorías, filas paginadas), la importación y el resultado con su comprobante. El archivo sigue elegido en el navegador y se reenvía en cada petición.

**Tech Stack:** Next.js 16 (App Router, Server Actions con `FormData`), Supabase/Postgres (funciones `security invoker`, `jsonb_to_recordset`), ExcelJS 4.4.0, Zod 4, TanStack Query 5, Radix (`Tabs`, `AlertDialog`), date-fns con `@date-fns/tz`, Vitest + Testing Library, Playwright.

**Spec:** [Filtro de fecha, orden, Excel y carga masiva](../specs/2026-10-02-excel-reporte-y-carga-masiva-design.md), fase 2: §0 (mejoras 7–17), §3, §6, §8, §9.1 (fase 2), §9.2–§9.4, §10–§13, §15.

## Global Constraints

- **Textos:** los de la spec (§6, §8, §12.1), en español, que dicen qué pasó y qué hacer, sin disculpas.
- **Límites** (`src/features/catalog/import/options.ts`), comprobados en el navegador y otra vez en el servidor:
  - `IMPORT_MAX_ROWS = 5000`;
  - `IMPORT_MAX_BYTES = 4 MB`;
  - `PRICE_CHANGE_WARNING = 0.5`;
  - `CATEGORY_SIMILARITY_DISTANCE = 2`, con nombres de 5 o más letras.
- **El navegador no decide nada.** Cada acción vuelve a leer el archivo, validarlo y calcular el plan. La importación es todo o nada y nunca borra productos.
- **Mismas reglas que el formulario:** `productSchema`, `categorySchema` y `unitPriceSchema`.
- **Dinero:** texto exacto o céntimos (`bigint`). Sumar IGV usa `applyTax` y `TAX_CONFIG.ratePercent`; nunca coma flotante.
- **Fechas:** date-fns con `{ in: lima }` (`src/lib/dates.ts`). Las fechas de Excel se leen en UTC.
- **ExcelJS:**
  - solo en el servidor (`import 'server-only'`);
  - las acciones cargan los módulos con `await import(...)`;
  - los binarios se pasan como `ArrayBuffer` (tipos de ExcelJS 4.4.0).
- **Base de datos:**
  - una migración nueva que solo añade funciones;
  - permisos solo para `authenticated`;
  - sin tablas ni índices nuevos (spec §9.1 y §10).
- **Rendimiento:**
  - una llamada SQL por vista previa y una por importación, por conjuntos;
  - la tabla de la vista previa dibuja 50 filas por página.
- **Accesibilidad:**
  - contraste AA y foco visible;
  - ningún estado solo con color;
  - la tabla con `caption`;
  - regiones `aria-live` para las esperas;
  - foco en el título de la vista previa y del resultado.
- **Movimiento:** solo como respuesta a una acción, y respetando `prefers-reduced-motion`.
- **Pruebas:**
  - TDD;
  - Vitest en UTC;
  - integración solo contra el Supabase local;
  - e2e en PC y en móvil.
- **Commits:**
  - en `main`, con una sola línea de asunto: sin cuerpo y sin `Co-Authored-By`;
  - archivos añadidos por nombre.
- **Para publicar:**
  1. copia de seguridad;
  2. `pnpm db:push`;
  3. push;
  4. en Vercel, **Create Deployment → `main`**.

## Decisiones del plan

1. **Un solo plan SQL** (`product_import_plan`) para la vista previa y la importación. Así coinciden (spec §3), y la importación lo recalcula en su transacción si otra pestaña cambió el catálogo (spec §11).
2. **`import_products(rows, columns, mode)` recibe el modo.** La spec lista `(rows, columns)`. Con el modo en la base, «Solo actualizar» no crea un producto que otra pestaña haya borrado entre la vista previa y la importación.
3. **Las decisiones de categorías vuelven a pedir la vista previa,** como las opciones. Así el estado de cada fila (se actualiza o sin cambios) lo calcula siempre el servidor.
4. **Una fila omitida por el modo no muestra los errores de sus otras columnas:** no se va a importar. Solo un código vacío o repetido sigue siendo error.
5. **Los avisos solo van en filas que crean o actualizan.** Una fila sin cambios no se marca «Para revisar».
6. **«Descargar mi catálogo» reutiliza `exportProducts` sin filtros** (spec §6.3: «es el reporte completo sin filtros»).
7. **La simulación lleva «Resumen» y «Cambios», sin «Para revertir»,** porque todavía no hay nada que revertir.
8. **El primer «Leyendo tu Excel…» no muestra la cifra de filas,** porque llega con la respuesta. Al cambiar una opción ya se conoce: «Revisando 1 234 filas…».
9. **Porcentajes con punto decimal** («+12.5 %»), como los precios («S/ 1,350.00»): una línea de detalle no mezcla separadores. Las cifras llevan un espacio de miles que no se parte («1 234»), como en la spec.
10. **La tabla se abre en lo que más conviene mirar:** Con errores, Para revisar, Se actualizan, Nuevos y por último Todas. La spec decía «Con errores, Para revisar, Todas»; con el catálogo completo, «Todas» escondería unos pocos cambios entre miles de filas sin cambios.
11. **Cada archivo nuevo empieza con las opciones por defecto.** Así la hoja «Para revertir» nunca se sube con «No incluyen IGV» de la carga anterior.
12. **Un corte de red durante la importación no dice «No se importó nada»:** sin respuesta no se sabe si la base guardó. Se revisa el archivo otra vez y la vista previa muestra cómo quedó el catálogo. «No se importó nada» queda para cuando la base revirtió.
13. **Límite de la petición: 4.5 MB.** La spec decía 4 MB, pero el límite de Next también cuenta lo que añade el FormData; el archivo sigue limitado a 4 MB y Vercel admite 4.5 MB.
14. **Pasos en masculino:** «Descarga el archivo», «Complétalo» (o «Cambia lo que necesites» si actualiza) y «Súbelo», de acuerdo con «el archivo» del paso 1, que puede ser la plantilla o tu catálogo.
15. **En la vista previa, otro archivo se elige solo desde la barra** («Elegir otro archivo»). «Cambiar archivo» queda en el chip del paso 3, que abre el selector.
16. **Aviso de «Valor sin IGV (S/)»:** si el archivo trae esa columna del reporte, la vista previa avisa que no se importa.

## Review Focus

1. **Celdas raras de Excel:** texto enriquecido, fórmulas sin calcular, `#N/A`, fechas en el código, `1299.8999999`, «1.299,90», «S/ 1,250.50», códigos `00123` o numéricos largos, y caracteres invisibles copiados de una web. Tareas 2 y 3.
2. **Actualización parcial:**
   - un archivo con solo Código y Precio no toca nombres ni categorías;
   - un producto nuevo sin esas columnas da su error;
   - una descripción vacía la borra.

   Tareas 1, 4 y 7.
3. **Categorías:** «laptops» frente a «Laptops» (la misma), «Impresora» frente a «Impresoras» (casi igual, ya decidida), «Laptps» frente a «Laptops» (parecida, decisión obligatoria) y una categoría de destino borrada antes de importar. Tareas 4, 7 y 13.
4. **Todo o nada:** si una fila rompe una restricción no se guarda nada; el mismo archivo dos veces no cambia nada; la hoja «Para revertir» devuelve los valores anteriores. Tareas 1, 6 y 14.
5. **Archivos que no sirven:** `.csv` renombrado, `.xls`, con contraseña, dañado, más de 4 MB, más de 5 000 filas, la lista de precios, sin columna Código o sin productos. Cada uno con su mensaje y la zona de carga disponible otra vez. Tareas 3, 8 y 11.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
| --- | --- | --- |
| `supabase/migrations/202610030001_product_import.sql` | `product_import_plan`, `preview_product_import`, `import_products` y permisos | 1 |
| `src/lib/supabase/database.types.ts` | Tipos generados | 1 |
| `src/features/catalog/import/types.ts` | Tipos compartidos por servidor y pantalla | 2 |
| `src/features/catalog/import/options.ts` | Límites, opciones, mensajes de archivo, títulos de la plantilla y clave de categoría | 2 |
| `src/features/catalog/excel/normalize.ts` | Celdas de ExcelJS a texto, número o error; precios en texto | 2 |
| `src/features/catalog/excel/read.ts` | Hoja, fila de títulos, alias y límites del archivo | 3 |
| `src/features/catalog/excel/validate.ts` | Reglas de cada fila, columnas presentes y códigos repetidos | 4 |
| `src/features/catalog/excel/similar.ts` | Categorías casi iguales y parecidas | 4 |
| `src/features/catalog/excel/template.ts` | Plantilla con desplegable, ayudas e instrucciones | 5 |
| `src/features/catalog/excel/errors-file.ts` | Excel de filas con errores | 6 |
| `src/features/catalog/excel/receipt.ts` | Comprobante y simulación | 6 |
| `src/features/catalog/excel/import-service.ts` | Análisis, importación, simulación y archivo de errores | 7 |
| `src/features/catalog/excel/import-request.ts` | Archivo y opciones del `FormData` | 8 |
| `src/features/catalog/products/excel-actions.ts` | Cinco acciones nuevas | 8 |
| `next.config.ts` | Límite de 4 MB por petición y logotipo en `/products/import` | 8 |
| `src/app/(private)/products/import/page.tsx` | Ruta de la carga masiva | 9 |
| `src/features/catalog/import/components/import-intro.tsx` | Cabecera, intenciones y preguntas frecuentes | 9 |
| `src/features/catalog/import/components/import-screen.tsx` | Etapas de la pantalla | 9 y 13 |
| `src/features/catalog/components/catalog-screen.tsx` | Botón «Carga masiva» | 9 |
| `src/features/catalog/products/components/product-list.tsx` | Enlace en el catálogo vacío | 9 |
| `src/features/catalog/import/format.ts` | Cifras, textos de estado, detalle y porcentajes | 10 |
| `src/features/catalog/import/components/import-preview.tsx` | Opciones, resumen, barras y categorías | 10 |
| `src/features/catalog/import/use-download.ts` | Descargar un Excel que prepara una acción | 11 |
| `src/features/catalog/import/components/import-steps.tsx` | Pasos 1, 2 y 3 | 11 |
| `src/features/catalog/import/components/preview-rows.tsx` | Pestañas, búsqueda, tabla y páginas | 12 |
| `src/features/catalog/import/components/import-action-bar.tsx` | Barra fija y confirmación | 12 |
| `src/features/catalog/import/components/import-result.tsx` | Resultado y comprobante | 13 |
| `docs/setup.md`, `docs/deployment.md` | Migración y comprobaciones | 15 |

---

### Task 1: Funciones SQL de la importación

**Files:**
- Create: `supabase/migrations/202610030001_product_import.sql`
- Modify: `src/lib/supabase/database.types.ts` (generado)
- Test: `tests/integration/catalog-import-sql.test.ts`

**Interfaces:**
- Produces (SQL, `security invoker`, solo `authenticated`):
  - `product_import_plan(rows jsonb, columns text[])` → tabla por fila: `line`, `code`, `product_id` (null si es nuevo), los valores del archivo, la categoría resuelta, los valores actuales, `*_changed` por columna presente y `name_taken_by`.
  - `preview_product_import(rows jsonb, columns text[])` → `json`. Es un array con, por fila: `line`, `exists`, `category_exists`, los valores actuales (precio en texto), `name_changed`, `description_changed`, `category_changed`, `price_changed` y `name_taken_by`.
  - `import_products(rows jsonb, columns text[], mode text default 'all')` → `json` con `created`, `updated`, `unchanged`, `skipped`, `categories_created`, `changes[]` y `previous[]`.
- Filas: `{ line, code, name?, description?, category?, price? }` (precio en texto con dos decimales). `columns` ⊆ `{name, description, category, price}`.

- [ ] **Step 1: Escribir las pruebas de integración**

`tests/integration/catalog-import-sql.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const password = 'importar-clave-123'
const owner = { email: 'importar-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'importar-intruso@catalogo.test' }
const ALL = ['name', 'description', 'category', 'price']
const OLD = '2026-01-01T10:00:00-05:00'

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
  await db.query(
    `insert into public.products (code, name, description, category_id, unit_price, created_at, updated_at)
     values ('LAP-1', 'Laptop uno', 'Vieja', $1, 1000, $2, $2),
            ('LAP-2', 'Laptop dos', null, $1, 2000, $2, $2),
            ('LAP-3', 'Laptop tres', null, $1, 3000, $2, $2)`,
    [laptops, OLD],
  )
})

type Row = {
  line: number
  code: string
  name?: string
  description?: string | null
  category?: string
  price?: string
}
type Plan = {
  line: number
  exists: boolean
  category_exists: boolean
  current_name: string | null
  current_price: string | null
  name_changed: boolean
  description_changed: boolean
  category_changed: boolean
  price_changed: boolean
  name_taken_by: string | null
}
type Change = {
  code: string
  product: string
  action: string
  field: string | null
  before: string | null
  after: string | null
}
type Result = {
  created: number
  updated: number
  unchanged: number
  skipped: number
  categories_created: string[]
  changes: Change[]
  previous: { code: string; name: string; description: string | null; price: string }[]
}

async function preview(rows: Row[], columns = ALL) {
  const { data, error } = await supabase.rpc('preview_product_import', { rows, columns })
  if (error) throw error
  return data as Plan[]
}

async function importRows(rows: Row[], columns = ALL, mode = 'all', client = supabase) {
  const { data, error } = await client.rpc('import_products', { rows, columns, mode })
  if (error) throw error
  return data as Result
}

async function catalog() {
  const { rows } = await db.query<{
    code: string
    name: string
    description: string | null
    price: string
    category: string
    touched: boolean
  }>(
    `select p.code, p.name, p.description, p.unit_price::text as price, c.name as category,
            p.updated_at > $1::timestamptz as touched
     from public.products p join public.categories c on c.id = p.category_id order by p.code`,
    [OLD],
  )
  return rows
}

const mixed: Row[] = [
  { line: 2, code: 'LAP-1', name: 'Laptop uno', description: 'Nueva', category: 'laptops', price: '1100.00' },
  { line: 3, code: 'LAP-2', name: 'Laptop dos', description: null, category: 'Laptops', price: '2000.00' },
  { line: 4, code: 'MON-1', name: 'Monitor 24', description: null, category: 'Monitores', price: '500.50' },
  { line: 5, code: 'MON-2', name: 'Laptop TRES', description: null, category: 'monitores', price: '600.00' },
]

describe('preview_product_import', () => {
  it('dice qué existe, qué cambia y qué nombre ya usa otro código', async () => {
    const plan = await preview(mixed)
    expect(plan.map((row) => [row.line, row.exists, row.category_exists])).toEqual([
      [2, true, true],
      [3, true, true],
      [4, false, false],
      [5, false, false],
    ])
    expect(plan[0]).toMatchObject({
      current_name: 'Laptop uno',
      current_price: '1000',
      name_changed: false,
      description_changed: true,
      category_changed: false,
      price_changed: true,
    })
    expect(plan[1]).toMatchObject({ description_changed: false, price_changed: false })
    expect(plan[3].name_taken_by).toBe('LAP-3')
  })

  it('con solo Código y Precio no compara las demás columnas', async () => {
    const [row] = await preview([{ line: 2, code: 'LAP-1', price: '1000.00' }], ['price'])
    expect(row).toMatchObject({
      exists: true,
      name_changed: false,
      description_changed: false,
      category_changed: false,
      price_changed: false,
    })
  })
})

describe('import_products', () => {
  it('crea, actualiza solo lo que cambia y crea cada categoría una vez', async () => {
    const result = await importRows(mixed)
    expect(result).toMatchObject({
      created: 2,
      updated: 1,
      unchanged: 1,
      skipped: 0,
      categories_created: ['Monitores'],
    })
    expect(result.previous).toEqual([
      { code: 'LAP-1', name: 'Laptop uno', description: 'Vieja', category: 'Laptops', price: '1000' },
    ])
    expect(result.changes).toEqual([
      expect.objectContaining({ code: 'LAP-1', action: 'updated', field: 'description', before: 'Vieja', after: 'Nueva' }),
      expect.objectContaining({ code: 'LAP-1', action: 'updated', field: 'price', before: '1000', after: '1100.00' }),
      expect.objectContaining({ code: 'MON-1', action: 'created', field: null }),
      expect.objectContaining({ code: 'MON-2', action: 'created', field: null }),
    ])
    const rows = await catalog()
    expect(rows.find((row) => row.code === 'LAP-2')).toMatchObject({ touched: false })
    expect(rows.find((row) => row.code === 'LAP-1')).toMatchObject({ touched: true, description: 'Nueva' })
    expect(rows.filter((row) => row.category === 'Monitores')).toHaveLength(2)
  })

  it('el mismo archivo dos veces no cambia nada la segunda', async () => {
    await importRows(mixed)
    const again = await importRows(mixed)
    expect(again).toMatchObject({ created: 0, updated: 0, unchanged: 4, categories_created: [] })
  })

  it('con solo Código y Precio actualiza precios y respeta lo demás', async () => {
    const result = await importRows([{ line: 2, code: 'LAP-3', price: '3500.00' }], ['price'])
    expect(result).toMatchObject({ updated: 1 })
    expect((await catalog()).find((row) => row.code === 'LAP-3')).toMatchObject({
      name: 'Laptop tres',
      category: 'Laptops',
      price: '3500.00',
    })
  })

  it('una descripción vacía en la columna presente la borra', async () => {
    await importRows([{ line: 2, code: 'LAP-1', description: null }], ['description'])
    expect((await catalog()).find((row) => row.code === 'LAP-1')?.description).toBeNull()
  })

  it.each([
    ['create', { created: 1, updated: 0, skipped: 1 }],
    ['update', { created: 0, updated: 1, skipped: 1 }],
  ])('el modo %s deja fuera las otras filas', async (mode, expected) => {
    const rows: Row[] = [
      { line: 2, code: 'LAP-1', price: '999.00' },
      { line: 3, code: 'NEW-1', name: 'Nuevo', category: 'Laptops', price: '10.00' },
    ]
    expect(await importRows(rows, ALL, mode)).toMatchObject(expected)
  })

  it('si una fila rompe una restricción no se guarda nada', async () => {
    const rows: Row[] = [
      { line: 2, code: 'NEW-1', name: 'Bien', category: 'Teclados', price: '10.00' },
      { line: 3, code: 'NEW-2', name: 'Mal', category: 'Teclados', price: '0' },
    ]
    await expect(importRows(rows)).rejects.toMatchObject({ code: '23514' })
    const { rows: left } = await db.query(
      "select (select count(*)::int from public.products) as products, (select count(*)::int from public.categories where name = 'Teclados') as categories",
    )
    expect(left[0]).toEqual({ products: 3, categories: 0 })
  })

  it('no crea las categorías de las filas que el modo deja fuera', async () => {
    const rows: Row[] = [{ line: 2, code: 'NEW-1', name: 'X', category: 'Monitores', price: '1.00' }]
    expect(await importRows(rows, ALL, 'update')).toMatchObject({ skipped: 1, categories_created: [] })
  })

  it('rechaza más de 5 000 filas y a quien no es la dueña', async () => {
    const many = Array.from({ length: 5001 }, (_, index) => ({ line: index + 2, code: `X-${index}` }))
    await expect(importRows(many, ['price'])).rejects.toMatchObject({ code: '22023' })
    await expect(importRows(mixed, ALL, 'all', outsider)).rejects.toMatchObject({ code: '42501' })
    const anonymous = publicClient()
    for (const fn of ['product_import_plan', 'preview_product_import', 'import_products']) {
      const { error } = await anonymous.rpc(fn)
      expect(error?.code).toBe('42501')
    }
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project integration tests/integration/catalog-import-sql.test.ts`
Expected: FAIL. PostgREST no encuentra `preview_product_import` ni `import_products` («Could not find the function…»).

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/202610030001_product_import.sql`:

```sql
-- Carga masiva (spec del Excel §6 y §9.1, fase 2). Las filas llegan ya leídas y validadas por el
-- servidor. product_import_plan decide, con la misma lógica para la vista previa y para la
-- importación, qué pasa con cada una: se crea, se actualiza (solo en las columnas presentes) o no
-- cambia. Todo por conjuntos: una consulta por paso, también con 5 000 filas. Sin índices nuevos.

create function public.product_import_plan(rows jsonb, columns text[])
returns table (
  line integer,
  code text,
  product_id uuid,
  name text,
  description text,
  category text,
  category_id uuid,
  category_name text,
  price numeric,
  current_name text,
  current_description text,
  current_category text,
  current_price numeric,
  name_changed boolean,
  description_changed boolean,
  category_changed boolean,
  price_changed boolean,
  name_taken_by text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select r.line, r.code, r.name, r.description, r.category, r.price
    from jsonb_to_recordset(rows) as r(
      line integer, code text, name text, description text, category text, price numeric
    )
  ),
  -- Nombres del catálogo sin mayúsculas ni espacios, para avisar de un nombre que ya usa otro
  -- código sin recorrer la tabla por cada fila.
  names as (
    select lower(btrim(p.name)) as key, array_agg(p.code order by p.code) as codes
    from public.products p
    group by 1
  )
  select
    i.line,
    i.code,
    p.id,
    i.name,
    i.description,
    i.category,
    c.id,
    coalesce(c.name, btrim(i.category)),
    i.price,
    p.name,
    p.description,
    pc.name,
    p.unit_price,
    p.id is not null and 'name' = any(columns) and p.name is distinct from i.name,
    p.id is not null and 'description' = any(columns) and p.description is distinct from i.description,
    p.id is not null and 'category' = any(columns) and p.category_id is distinct from c.id,
    p.id is not null and 'price' = any(columns) and p.unit_price is distinct from i.price,
    (select other from unnest(n.codes) as other where other <> i.code limit 1)
  from input i
  left join public.products p on p.code = i.code
  left join public.categories pc on pc.id = p.category_id
  -- Misma regla que el índice único de categorías: sin mayúsculas ni espacios en los extremos.
  left join public.categories c on lower(btrim(c.name)) = lower(btrim(i.category))
  left join names n on n.key = lower(btrim(i.name))
$$;

-- Vista previa: el plan de cada fila, con los precios en texto (nunca pasan por coma flotante).
create function public.preview_product_import(rows jsonb, columns text[])
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'line', plan.line,
        'exists', plan.product_id is not null,
        'category_exists', plan.category_id is not null,
        'current_name', plan.current_name,
        'current_description', plan.current_description,
        'current_category', plan.current_category,
        'current_price', plan.current_price::text,
        'name_changed', plan.name_changed,
        'description_changed', plan.description_changed,
        'category_changed', plan.category_changed,
        'price_changed', plan.price_changed,
        'name_taken_by', plan.name_taken_by
      )
      order by plan.line
    ),
    '[]'::json
  )
  from public.product_import_plan(rows, columns) plan
$$;

-- Importación en una sola transacción: o se guarda todo o nada. Crea solo las categorías que usan
-- las filas que de verdad se crean o actualizan, inserta los nuevos, actualiza solo las columnas
-- presentes de los que cambian (los demás no se tocan: su updated_at sigue igual) y devuelve los
-- valores anteriores para el comprobante. El modo se aplica aquí, con el catálogo de este momento.
create function public.import_products(rows jsonb, columns text[], mode text default 'all')
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_categories text[];
  result json;
begin
  if coalesce((select auth.jwt() -> 'app_metadata' ->> 'catalog_access'), '') <> 'owner' then
    raise exception 'Solo la cuenta dueña puede importar productos.' using errcode = '42501';
  end if;
  if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) > 5000 then
    raise exception 'Como máximo 5000 filas por importación.' using errcode = '22023';
  end if;
  if mode is null or mode not in ('all', 'create', 'update') then
    raise exception 'Modo de importación no válido.' using errcode = '22023';
  end if;

  with plan as (
    select * from public.product_import_plan(rows, columns)
  ),
  acting as (
    select * from plan
    where (plan.product_id is null and mode in ('all', 'create'))
      or (
        plan.product_id is not null and mode in ('all', 'update')
        and (plan.name_changed or plan.description_changed or plan.category_changed or plan.price_changed)
      )
  ),
  wanted as (
    select distinct on (lower(btrim(acting.category))) btrim(acting.category) as name
    from acting
    where 'category' = any(columns) and acting.category_id is null
      and nullif(btrim(acting.category), '') is not null
    order by lower(btrim(acting.category)), acting.line
  ),
  inserted as (
    insert into public.categories (name)
    select wanted.name from wanted
    on conflict ((lower(btrim(name)))) do nothing
    returning categories.name
  )
  select coalesce(array_agg(inserted.name order by inserted.name), '{}') into created_categories
  from inserted;

  -- El plan otra vez, ya con todas las categorías: lo leen todas las partes de esta consulta con la
  -- misma foto del catálogo, así que guarda los valores de antes para el comprobante.
  with plan as materialized (
    select * from public.product_import_plan(rows, columns)
  ),
  to_create as (
    select * from plan where plan.product_id is null and mode in ('all', 'create')
  ),
  to_update as (
    select * from plan
    where plan.product_id is not null and mode in ('all', 'update')
      and (plan.name_changed or plan.description_changed or plan.category_changed or plan.price_changed)
  ),
  created as (
    insert into public.products (code, name, description, category_id, unit_price)
    select to_create.code, to_create.name, to_create.description, to_create.category_id, to_create.price
    from to_create
    returning products.code
  ),
  updated as (
    update public.products p set
      name = case when 'name' = any(columns) then u.name else p.name end,
      description = case when 'description' = any(columns) then u.description else p.description end,
      category_id = case when 'category' = any(columns) then u.category_id else p.category_id end,
      unit_price = case when 'price' = any(columns) then u.price else p.unit_price end
    from to_update u
    where p.id = u.product_id
    returning p.code
  ),
  changes as (
    select to_create.code, to_create.name as product, 'created' as action, null::text as field,
      null::text as before, null::text as after, 0 as position
    from to_create
    union all
    select u.code, coalesce(u.name, u.current_name), 'updated', 'name', u.current_name, u.name, 1
    from to_update u where u.name_changed
    union all
    select u.code, coalesce(u.name, u.current_name), 'updated', 'description',
      u.current_description, u.description, 2
    from to_update u where u.description_changed
    union all
    select u.code, coalesce(u.name, u.current_name), 'updated', 'category',
      u.current_category, u.category_name, 3
    from to_update u where u.category_changed
    union all
    select u.code, coalesce(u.name, u.current_name), 'updated', 'price',
      u.current_price::text, u.price::text, 4
    from to_update u where u.price_changed
  )
  select json_build_object(
    'created', (select count(*) from created),
    'updated', (select count(*) from updated),
    'unchanged', (
      select count(*) from plan
      where plan.product_id is not null and mode in ('all', 'update')
    ) - (select count(*) from to_update),
    'skipped', (
      select count(*) from plan
      where (plan.product_id is null and mode = 'update')
        or (plan.product_id is not null and mode = 'create')
    ),
    'categories_created', to_json(created_categories),
    'changes', coalesce(
      (
        select json_agg(
          json_build_object(
            'code', changes.code, 'product', changes.product, 'action', changes.action,
            'field', changes.field, 'before', changes.before, 'after', changes.after
          )
          order by changes.code, changes.position
        )
        from changes
      ),
      '[]'::json
    ),
    'previous', coalesce(
      (
        select json_agg(
          json_build_object(
            'code', u.code, 'name', u.current_name, 'description', u.current_description,
            'category', u.current_category, 'price', u.current_price::text
          )
          order by u.code
        )
        from to_update u
      ),
      '[]'::json
    )
  ) into result;

  return result;
end;
$$;

-- Como las demás funciones del catálogo: solo cuentas con sesión; RLS decide qué ve cada una.
revoke execute on function public.product_import_plan(jsonb, text[]) from public, anon;
grant execute on function public.product_import_plan(jsonb, text[]) to authenticated;
revoke execute on function public.preview_product_import(jsonb, text[]) from public, anon;
grant execute on function public.preview_product_import(jsonb, text[]) to authenticated;
revoke execute on function public.import_products(jsonb, text[], text) from public, anon;
grant execute on function public.import_products(jsonb, text[], text) to authenticated;
```

- [ ] **Step 4: Aplicarla en el Supabase local y regenerar los tipos**

Run: `pnpm exec supabase migration up && pnpm db:types && pnpm exec prettier --write src/lib/supabase/database.types.ts`
Expected:
- «Applying migration 202610030001_product_import.sql…» sin errores.
- `database.types.ts` incluye `import_products` (con `mode?: string`), `preview_product_import` y `product_import_plan`.

- [ ] **Step 5: Ejecutar las pruebas y ver que pasan**

Run: `pnpm exec vitest run --project integration tests/integration/catalog-import-sql.test.ts tests/integration/catalog-access.test.ts`
Expected: PASS en las dos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202610030001_product_import.sql src/lib/supabase/database.types.ts tests/integration/catalog-import-sql.test.ts
git commit -m "feat: plan and import products from Excel in one database transaction"
```

---

### Task 2: Tipos, opciones y lectura de celdas

**Files:**
- Create:
  - `src/features/catalog/import/types.ts`
  - `src/features/catalog/import/options.ts`
  - `src/features/catalog/excel/normalize.ts`
- Test: `tests/unit/import-normalize.test.ts`, `tests/unit/import-options.test.ts`

**Interfaces:**
- Produces:
  - **`types.ts`:**
    - columnas: `IMPORT_COLUMNS`, `ImportColumn`, `DataColumn`, `DATA_COLUMNS`;
    - opciones: `IMPORT_MODES`, `ImportMode`, `CategoryDecision`, `ImportOptions`;
    - filas: `RowStatus`, `RowAction`, `FieldChange`, `PreviewRow`, `PreviewCounts`;
    - resumen: `PriceTrend`, `CategoryKind`, `CategoryChoice`, `CategoryBar`, `ImportPreview`;
    - resultado: `DownloadedFile`, `ImportOutcome`.
  - **`options.ts`:**
    - límites: `IMPORT_MAX_ROWS`, `IMPORT_MAX_BYTES`, `PRICE_CHANGE_WARNING`, `CATEGORY_SIMILARITY_DISTANCE`, `CATEGORY_SIMILARITY_MIN_LENGTH`;
    - opciones: `DEFAULT_IMPORT_OPTIONS`, `MODE_LABELS`, `importOptionsSchema`;
    - archivo: `FILE_MESSAGES`, `checkFile(file)`;
    - columnas: `templateTitles(): Record<ImportColumn, string>`, con los mismos títulos que el reporte, para la plantilla, los Excel de la importación y la guía de la pantalla;
    - categorías: `categoryKey(name)`.
  - **`normalize.ts`:**
    - tipos: `Cell`, `ReadRow`, `Parsed`;
    - lectura: `EMPTY_CELL`, `readCell(value)`;
    - limpieza: `cleanLine`, `cleanText`, `cellText(cell, { multiline?, integerOnly? })`;
    - precios: `priceText(text)`, `checkPrice(text)`, `cellPrice(cell)`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/import-normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  cellPrice,
  cellText,
  cleanText,
  priceText,
  readCell,
  type Cell,
} from '@/features/catalog/excel/normalize'

const text = (value: string): Cell => ({ kind: 'text', value })
const number = (value: number): Cell => ({ kind: 'number', value })

describe('readCell', () => {
  it('reconoce cada tipo de celda de ExcelJS', () => {
    expect(readCell(null)).toEqual({ kind: 'empty' })
    expect(readCell('   ')).toEqual({ kind: 'empty' })
    expect(readCell('\u200b')).toEqual({ kind: 'empty' })
    expect(readCell('LAP-001')).toEqual(text('LAP-001'))
    expect(readCell(12)).toEqual(number(12))
    expect(readCell(true)).toEqual({ kind: 'boolean', value: true })
    expect(readCell(new Date('2026-10-01T00:00:00Z'))).toEqual({
      kind: 'date',
      value: new Date('2026-10-01T00:00:00Z'),
    })
    expect(readCell({ richText: [{ text: 'LAP-' }, { text: '001' }] })).toEqual(text('LAP-001'))
    expect(readCell({ text: 'HP 14', hyperlink: 'https://x.test' })).toEqual(text('HP 14'))
    expect(readCell({ formula: 'A1*2', result: 1299.9, date1904: false })).toEqual(number(1299.9))
  })

  it('una fórmula sin calcular y un error de Excel son errores con su motivo', () => {
    expect(readCell({ formula: 'B9', date1904: false })).toMatchObject({
      kind: 'error',
      message: 'Fórmula sin calcular. Abre el archivo en Excel y guárdalo de nuevo.',
    })
    expect(readCell({ error: '#N/A' } as never)).toEqual({
      kind: 'error',
      message: 'La celda tiene un error de Excel (#N/A).',
      shown: '#N/A',
    })
  })
})

describe('cellText', () => {
  it('quita caracteres invisibles y une las tildes a su letra', () => {
    expect(cellText(text('LAP-001\u200b'))).toEqual({ ok: true, value: 'LAP-001' })
    expect(cellText(text('\ufeffImpresio\u0301n'))).toEqual({ ok: true, value: 'Impresión' })
  })

  it('limpia espacios, espacios no separables y saltos de línea', () => {
    expect(cellText(text('  HP  LaserJet\nPro  '))).toEqual({ ok: true, value: 'HP LaserJet Pro' })
    expect(cleanText('Línea 1  \r\n\r\n  Línea  2 ')).toBe('Línea 1\n\nLínea 2')
    expect(cellText(text(' Uno \n Dos '), { multiline: true })).toEqual({ ok: true, value: 'Uno\nDos' })
  })

  it('un número entero se escribe sin notación científica; con decimales, en el código es error', () => {
    expect(cellText(number(123456789012), { integerOnly: true })).toEqual({
      ok: true,
      value: '123456789012',
    })
    expect(cellText(number(12.5), { integerOnly: true })).toEqual({
      ok: false,
      error: 'No puede tener decimales. Escríbelo como texto.',
    })
    expect(cellText(number(3.5))).toEqual({ ok: true, value: '3.5' })
  })

  it('fechas y booleanos pasan a texto; la fecha en UTC, sin correr el día', () => {
    expect(cellText({ kind: 'date', value: new Date('2026-10-01T00:00:00Z') })).toEqual({
      ok: true,
      value: '01/10/2026',
    })
    expect(cellText({ kind: 'boolean', value: false })).toEqual({ ok: true, value: 'FALSO' })
  })
})

describe('precios', () => {
  it.each([
    ['1250.50', '1250.50'],
    ['1250,50', '1250.50'],
    ['1,250.50', '1250.50'],
    ['1.250,50', '1250.50'],
    ['S/ 1250.50', '1250.50'],
    ['S/. 99', '99'],
    ['1,299', '1299'],
    ['1.299', '1299'],
    ['12,5', '12.5'],
    ['1,299,000', '1299000'],
  ])('«%s» se lee como %s', (input, expected) => {
    expect(priceText(input)).toBe(expected)
  })

  it('pasa por la regla del formulario y devuelve dos decimales', () => {
    expect(cellPrice(text('S/ 1,250.5'))).toEqual({ ok: true, value: '1250.50' })
    expect(cellPrice(number(1299.8999999))).toEqual({ ok: true, value: '1299.90' })
    expect(cellPrice(number(2590))).toEqual({ ok: true, value: '2590.00' })
    expect(cellPrice({ kind: 'empty' })).toEqual({ ok: true, value: '' })
  })

  it('explica cada precio que no sirve', () => {
    expect(cellPrice(number(12.345))).toEqual({
      ok: false,
      error: 'Tiene más de dos decimales.',
    })
    expect(cellPrice(text('-5'))).toEqual({ ok: false, error: 'Debe ser mayor que cero.' })
    expect(cellPrice(number(0))).toEqual({ ok: false, error: 'Debe ser mayor que cero.' })
    expect(cellPrice(text('0,00'))).toEqual({ ok: false, error: 'Debe ser mayor que cero.' })
    expect(cellPrice(text('abc'))).toEqual({
      ok: false,
      error: 'Escribe solo números con hasta dos decimales, por ejemplo 1250.50.',
    })
    expect(cellPrice(number(12345678901))).toEqual({
      ok: false,
      error: 'No puede pasar de 9,999,999,999.99.',
    })
    expect(cellPrice({ kind: 'boolean', value: true })).toEqual({
      ok: false,
      error: 'Escribe el precio como número, por ejemplo 1250.50.',
    })
  })
})
```

`tests/unit/import-options.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  categoryKey,
  checkFile,
  DEFAULT_IMPORT_OPTIONS,
  FILE_MESSAGES,
  IMPORT_MAX_BYTES,
  importOptionsSchema,
  templateTitles,
} from '@/features/catalog/import/options'

describe('opciones de importación', () => {
  it('los títulos de la plantilla son los del reporte completo', () => {
    expect(Object.values(templateTitles())).toEqual([
      'Código',
      'Nombre',
      'Descripción',
      'Categoría',
      'Precio con IGV (S/)',
    ])
  })

  it('comprueba extensión y tamaño antes de enviar', () => {
    expect(checkFile({ name: 'productos.xlsx', size: 1000 })).toBeNull()
    expect(checkFile({ name: 'PRODUCTOS.XLSX', size: 1000 })).toBeNull()
    expect(checkFile({ name: 'productos.csv', size: 1000 })).toBe(FILE_MESSAGES.notXlsx)
    expect(checkFile({ name: 'productos.xlsx', size: IMPORT_MAX_BYTES + 1 })).toBe(FILE_MESSAGES.tooBig)
  })

  it('valida las opciones que manda el navegador', () => {
    expect(importOptionsSchema.safeParse(DEFAULT_IMPORT_OPTIONS).success).toBe(true)
    expect(
      importOptionsSchema.safeParse({
        pricesIncludeTax: false,
        mode: 'update',
        categoryMap: { laptps: { action: 'use', target: 'Laptops' }, monitor: { action: 'create' } },
      }).success,
    ).toBe(true)
    expect(importOptionsSchema.safeParse({ ...DEFAULT_IMPORT_OPTIONS, mode: 'delete' }).success).toBe(false)
    expect(
      importOptionsSchema.safeParse({
        ...DEFAULT_IMPORT_OPTIONS,
        categoryMap: { x: { action: 'use', target: '' } },
      }).success,
    ).toBe(false)
  })

  it('la clave de categoría sigue la regla del índice único', () => {
    expect(categoryKey('  Laptops ')).toBe('laptops')
    expect(categoryKey('IMPRESIÓN')).toBe('impresión')
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/import-normalize.test.ts tests/unit/import-options.test.ts`
Expected: FAIL. No existen los módulos.

- [ ] **Step 3: Escribir los tipos, las opciones y la lectura de celdas**

`src/features/catalog/import/types.ts`:

```ts
// Tipos de la carga masiva que comparten el servidor y la pantalla (spec del Excel §6).

// Columnas que entiende la carga masiva. Código es la única obligatoria del archivo (spec §6.7).
export const IMPORT_COLUMNS = ['code', 'name', 'description', 'category', 'price'] as const
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]
export type DataColumn = Exclude<ImportColumn, 'code'>
export const DATA_COLUMNS: DataColumn[] = ['name', 'description', 'category', 'price']

export const IMPORT_MODES = ['all', 'create', 'update'] as const
export type ImportMode = (typeof IMPORT_MODES)[number]

// Qué hacer con una categoría del archivo que no existe tal cual (spec §6.8).
export type CategoryDecision = { action: 'use'; target: string } | { action: 'create' }

export type ImportOptions = {
  pricesIncludeTax: boolean
  mode: ImportMode
  // La clave es la categoría del archivo en minúsculas y sin espacios en los extremos.
  categoryMap: Record<string, CategoryDecision>
}

// Cada fila cuenta en una sola tarjeta (spec §6.6): con errores, para revisar y luego lo que pasa.
export type RowStatus = 'create' | 'update' | 'unchanged' | 'review' | 'error' | 'omitted'
export type RowAction = 'create' | 'update' | 'unchanged'

export type FieldChange = { field: DataColumn; before: string | null; after: string | null }

export type PreviewRow = {
  line: number
  status: RowStatus
  // Lo que pasará con la fila; null si tiene errores o queda omitida.
  action: RowAction | null
  code: string
  // Valores tras importar: los del archivo o, si su columna no viene, los actuales.
  name: string | null
  category: string | null
  price: string | null
  // Precio del archivo antes de sumar el IGV, con «No incluyen IGV».
  priceBeforeTax: string | null
  changes: FieldChange[]
  warnings: string[]
  errors: string[]
}

export type PreviewCounts = Record<RowStatus, number>

// Precios que suben y bajan entre los que se actualizan, con el cambio promedio (0.082 = +8.2 %).
export type PriceTrend = {
  up: number
  down: number
  upAverage: number | null
  downAverage: number | null
}

export type CategoryKind = 'near' | 'similar' | 'new'

// Una categoría del archivo que no existe tal cual (spec §6.8).
export type CategoryChoice = {
  key: string
  name: string
  kind: CategoryKind
  suggestion: string | null
  decision: CategoryDecision | null
  products: number
}

// Productos del archivo por categoría, para las barras del resumen.
export type CategoryBar = { name: string; products: number; tag: 'new' | 'similar' | null }

export type ImportPreview = {
  fileName: string
  sheetName: string
  columns: ImportColumn[]
  partialNotice: string | null
  // «Valor sin IGV (S/)» del reporte no se importa: se avisa por si alguien lo cambió.
  ignoredNotice: string | null
  rows: PreviewRow[]
  counts: PreviewCounts
  prices: PriceTrend
  choices: CategoryChoice[]
  bars: CategoryBar[]
  undecided: number
  // Nuevos, se actualizan y para revisar: lo que dice el botón «Importar N productos».
  importable: number
  // Productos existentes que cambian: los cuenta la confirmación.
  updates: number
}

export type DownloadedFile = { base64: string; fileName: string }

export type ImportOutcome = {
  created: number
  updated: number
  unchanged: number
  skipped: number
  errors: number
  categoriesCreated: string[]
  receipt: DownloadedFile
}
```

`src/features/catalog/import/options.ts`:

```ts
import { z } from 'zod'
import { priceColumns } from '../price-columns'
import { IMPORT_MODES, type ImportColumn, type ImportMode, type ImportOptions } from './types'

// Límites de la carga masiva (spec del Excel §10): en un solo sitio, para ajustarlos si el negocio
// crece. Se comprueban en el navegador y otra vez en el servidor.
export const IMPORT_MAX_ROWS = 5000
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024
// Un precio que sube o baja la mitad o más pasa a «Para revisar» (spec §9.4).
export const PRICE_CHANGE_WARNING = 0.5
// Categoría «parecida»: hasta 2 letras de diferencia en nombres de 5 o más (spec §9.4).
export const CATEGORY_SIMILARITY_DISTANCE = 2
export const CATEGORY_SIMILARITY_MIN_LENGTH = 5

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  pricesIncludeTax: true,
  mode: 'all',
  categoryMap: {},
}

export const MODE_LABELS: Record<ImportMode, string> = {
  all: 'Crear y actualizar',
  create: 'Solo crear los nuevos',
  update: 'Solo actualizar los existentes',
}

// Mensajes a nivel de archivo (spec §12.1): dicen qué pasó y qué hacer.
export const FILE_MESSAGES = {
  notXlsx:
    'Ese archivo no es un Excel .xlsx. Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)".',
  tooBig: 'El archivo pesa más de 4 MB. Divide los productos en varios archivos.',
  tooManyRows: 'El archivo tiene más de 5 000 productos. Divídelo en archivos de hasta 5 000.',
  noColumns:
    'No encontramos las columnas de la plantilla. La primera fila debe tener al menos Código y lo que quieras cargar o actualizar.',
  noCode: 'Falta la columna Código: es la que identifica cada producto.',
  priceList:
    'Este archivo es una lista de precios, para clientes. Para actualizar precios usa "Descargar mi catálogo" o la plantilla.',
  empty: 'El archivo no tiene productos. Completa la plantilla desde la fila 2.',
  unreadable:
    'No pudimos abrir el archivo. Si tiene contraseña, quítasela; si no, vuelve a guardarlo desde Excel.',
} as const

// Lo que se comprueba en el navegador antes de enviar (spec §6.5); el servidor lo repite.
export function checkFile(file: { name: string; size: number }): string | null {
  if (!file.name.toLowerCase().endsWith('.xlsx')) return FILE_MESSAGES.notXlsx
  if (file.size > IMPORT_MAX_BYTES) return FILE_MESSAGES.tooBig
  return null
}

// Misma regla que el índice único de categorías: lower(btrim(name)).
export const categoryKey = (name: string) => name.trim().toLowerCase()

// Títulos de la plantilla, iguales a los del reporte completo: lo que se descarga se puede subir.
// Aquí y no en excel/ (solo servidor): la guía del paso 2 también los muestra.
export function templateTitles(): Record<ImportColumn, string> {
  return {
    code: 'Código',
    name: 'Nombre',
    description: 'Descripción',
    category: 'Categoría',
    price: priceColumns().catalog,
  }
}

const decisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('use'), target: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal('create') }),
])

// Llegan del navegador con cada petición: el servidor las valida (spec §9.2).
export const importOptionsSchema = z.object({
  pricesIncludeTax: z.boolean(),
  mode: z.enum(IMPORT_MODES),
  categoryMap: z
    .record(z.string().max(240), decisionSchema)
    .refine((map) => Object.keys(map).length <= IMPORT_MAX_ROWS, 'Demasiadas categorías.'),
})
```

`src/features/catalog/excel/normalize.ts`:

```ts
import { tz } from '@date-fns/tz'
import { format } from 'date-fns'
import type { CellValue } from 'exceljs'
import type { ImportColumn } from '../import/types'
import { unitPriceSchema } from '../money'

// Lo que hay en una celda, sin las variantes de ExcelJS (spec del Excel §9.3). Es la principal
// fuente de errores al importar: cada tipo tiene su regla.
export type Cell =
  | { kind: 'empty' }
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'date'; value: Date }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'error'; message: string; shown: string }

// Una fila del archivo, con las celdas de las columnas que entendemos.
export type ReadRow = { line: number; cells: Partial<Record<ImportColumn, Cell>> }

export const EMPTY_CELL: Cell = { kind: 'empty' }

export function readCell(value: CellValue | undefined): Cell {
  if (value === null || value === undefined) return EMPTY_CELL
  if (typeof value === 'string') return cleanLine(value) === '' ? EMPTY_CELL : { kind: 'text', value }
  if (typeof value === 'number') return { kind: 'number', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (value instanceof Date) return { kind: 'date', value }
  if ('richText' in value) return readCell(value.richText.map((part) => part.text).join(''))
  if ('error' in value) {
    const shown = String(value.error)
    return { kind: 'error', message: `La celda tiene un error de Excel (${shown}).`, shown }
  }
  if ('formula' in value || 'sharedFormula' in value) {
    if (value.result === undefined) {
      return {
        kind: 'error',
        message: 'Fórmula sin calcular. Abre el archivo en Excel y guárdalo de nuevo.',
        shown: '',
      }
    }
    return readCell(value.result)
  }
  if ('hyperlink' in value) return readCell(value.text as CellValue)
  return EMPTY_CELL
}

// Caracteres invisibles que llegan al copiar de una web o un PDF: «LAP-001\u200b» se vería igual que
// «LAP-001» y crearía otro producto. Las tildes se unen a su letra (NFC), como al escribirlas.
const invisible = (text: string) => text.normalize('NFC').replace(/[\u200b-\u200d\u2060\ufeff]/g, '')

// Espacios no separables y repetidos a uno, sin espacios en los extremos; los saltos de línea pasan
// a espacio. Para código, nombre y categoría.
export const cleanLine = (text: string) => invisible(text).replace(/\s+/g, ' ').trim()

// La descripción conserva sus saltos de línea.
export const cleanText = (text: string) =>
  invisible(text)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .trim()

export type Parsed = { ok: true; value: string } | { ok: false; error: string }

// Excel guarda las fechas como días en UTC: se escriben en UTC para no correr el día.
const utc = tz('UTC')

// Texto de una celda para código, nombre, descripción o categoría. Un número entero se escribe sin
// notación científica: 123456789012 → «123456789012».
export function cellText(
  cell: Cell,
  options: { multiline?: boolean; integerOnly?: boolean } = {},
): Parsed {
  switch (cell.kind) {
    case 'empty':
      return { ok: true, value: '' }
    case 'text':
      return { ok: true, value: options.multiline ? cleanText(cell.value) : cleanLine(cell.value) }
    case 'number':
      if (Number.isInteger(cell.value)) return { ok: true, value: cell.value.toFixed(0) }
      return options.integerOnly
        ? { ok: false, error: 'No puede tener decimales. Escríbelo como texto.' }
        : { ok: true, value: String(cell.value) }
    case 'date':
      return { ok: true, value: format(cell.value, 'dd/MM/yyyy', { in: utc }) }
    case 'boolean':
      return { ok: true, value: cell.value ? 'VERDADERO' : 'FALSO' }
    case 'error':
      return { ok: false, error: cell.message }
  }
}

// «S/ 1,250.50», «1.250,50», «1250,5» → «1250.50» (spec §9.3). Con los dos separadores, el último es
// el decimal; con uno solo seguido de exactamente 3 dígitos, es de miles.
export function priceText(text: string) {
  const value = text.replace(/S\/\.?/gi, '').replace(/\s+/g, '')
  const dot = value.lastIndexOf('.')
  const comma = value.lastIndexOf(',')
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? '.' : ','
    return value
      .split(decimal === '.' ? ',' : '.')
      .join('')
      .replace(decimal, '.')
  }
  if (dot < 0 && comma < 0) return value
  const parts = value.split(dot >= 0 ? '.' : ',')
  return parts.length > 2 || parts.at(-1)?.length === 3 ? parts.join('') : parts.join('.')
}

// La regla del formulario (unitPriceSchema), con mensajes claros para los casos más comunes. Van
// tras «Precio: », así que no repiten «El precio».
export function checkPrice(text: string): Parsed {
  if (text.startsWith('-') || /^0+(?:[.,]0+)?$/.test(text)) {
    return { ok: false, error: 'Debe ser mayor que cero.' }
  }
  if (/^\d{11,}/.test(text)) return { ok: false, error: 'No puede pasar de 9,999,999,999.99.' }
  const parsed = unitPriceSchema.safeParse(text)
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: parsed.error.issues[0].message }
}

// Precio de una celda, con dos decimales; '' si está vacía.
export function cellPrice(cell: Cell): Parsed {
  switch (cell.kind) {
    case 'empty':
      return { ok: true, value: '' }
    case 'number': {
      // 1299.8999999 es un resto de coma flotante y vale 1299.90; con más decimales de verdad, error.
      const rounded = Math.round(cell.value * 100) / 100
      if (Math.abs(cell.value - rounded) >= 0.000001) {
        return { ok: false, error: 'Tiene más de dos decimales.' }
      }
      return checkPrice(rounded.toFixed(2))
    }
    case 'text':
      return checkPrice(priceText(cell.value))
    case 'error':
      return { ok: false, error: cell.message }
    default:
      return { ok: false, error: 'Escribe el precio como número, por ejemplo 1250.50.' }
  }
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/import-normalize.test.ts tests/unit/import-options.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/import/types.ts src/features/catalog/import/options.ts src/features/catalog/excel/normalize.ts tests/unit/import-normalize.test.ts tests/unit/import-options.test.ts
git commit -m "feat: read Excel cells and prices for the bulk product import"
```

---

### Task 3: Lector del Excel

**Files:**
- Create: `src/features/catalog/excel/read.ts`
- Test: `tests/unit/import-read.test.ts`

**Interfaces:**
- Consumes: `readCell`, `Cell`, `ReadRow` (tarea 2); `FILE_MESSAGES`, `IMPORT_MAX_BYTES`, `IMPORT_MAX_ROWS` (tarea 2); `priceColumns` (fase 1); `buildProductsReport` y `buildPriceList` (fase 1, en las pruebas).
- Produces:
  - `headerKey(text)`;
  - `ReadSheet = { sheetName; columns: ImportColumn[]; rows: ReadRow[]; derivedPrice: string | null }`, donde `derivedPrice` es el título de la columna «Valor sin IGV (S/)» si el archivo la trae;
  - `ReadResult = { ok: true; sheet } | { ok: false; message }`;
  - `readImportFile(data: ArrayBuffer, fileName: string): Promise<ReadResult>`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/import-read.test.ts`:

```ts
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildPriceList } from '@/features/catalog/excel/price-list'
import { readImportFile } from '@/features/catalog/excel/read'
import { buildProductsReport } from '@/features/catalog/excel/report'
import { FILE_MESSAGES, IMPORT_MAX_BYTES } from '@/features/catalog/import/options'
import type { ProductListItem } from '@/features/catalog/types'

type Sheet = { name: string; rows: ExcelJS.CellValue[][] }

async function xlsx(...sheets: Sheet[]) {
  const workbook = new ExcelJS.Workbook()
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name)
    sheet.rows.forEach((values, index) => {
      if (values.length > 0) worksheet.getRow(index + 1).values = values
    })
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
}

const toArrayBuffer = (buffer: Buffer) => new Uint8Array(buffer).buffer
const HEADER = ['Código', 'Nombre', 'Descripción', 'Categoría', 'Precio con IGV (S/)']

async function read(data: ArrayBuffer, name = 'productos.xlsx') {
  const result = await readImportFile(data, name)
  if (!result.ok) throw new Error(result.message)
  return result.sheet
}

describe('readImportFile', () => {
  it('lee la plantilla: todas las columnas y sin las filas vacías', async () => {
    const sheet = await read(
      await xlsx({
        name: 'Productos',
        rows: [HEADER, ['LAP-001', 'Laptop', null, 'Laptops', 2590], [], ['IMP-001', 'Láser', 'Mono', 'Impresoras', '1,180.00']],
      }),
    )
    expect(sheet.sheetName).toBe('Productos')
    expect(sheet.columns).toEqual(['code', 'name', 'description', 'category', 'price'])
    expect(sheet.derivedPrice).toBeNull()
    expect(sheet.rows.map((row) => row.line)).toEqual([2, 4])
    expect(sheet.rows[0].cells.price).toEqual({ kind: 'number', value: 2590 })
    expect(sheet.rows[0].cells.description).toEqual({ kind: 'empty' })
  })

  it('salta las hojas reservadas, como «Instrucciones», y lee la siguiente', async () => {
    const sheet = await read(
      await xlsx(
        { name: 'Instrucciones', rows: [HEADER, ['EJ-001', 'Ejemplo', null, 'Laptops', 10]] },
        { name: 'Productos', rows: [HEADER, ['LAP-001', 'Laptop', null, 'Laptops', 10]] },
      ),
    )
    expect(sheet.sheetName).toBe('Productos')
    expect(sheet.rows).toHaveLength(1)
  })

  it('reconoce el reporte completo: títulos en la fila 8 y «Valor sin IGV» no es el precio', async () => {
    const product: ProductListItem = {
      id: 'p1',
      code: 'LAP-001',
      name: 'Laptop',
      description: null,
      category_id: 'c1',
      category_name: 'Laptops',
      unit_price: '1180.00',
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    }
    const report = await buildProductsReport({
      rows: [product],
      companyName: 'Ventronix',
      logo: null,
      generatedAt: new Date('2026-10-02T15:00:00Z'),
      filtersText: 'Sin filtros',
      viewUrl: null,
      truncatedAt: null,
    })
    const sheet = await read(toArrayBuffer(report))
    expect(sheet.columns).toEqual(['code', 'name', 'description', 'category', 'price'])
    expect(sheet.derivedPrice).toBe('Valor sin IGV (S/)')
    expect(sheet.rows).toEqual([
      expect.objectContaining({ line: 9, cells: expect.objectContaining({ price: { kind: 'number', value: 1180 } }) }),
    ])
  })

  it('acepta títulos sin tildes ni mayúsculas y alias, e ignora las columnas que no conoce', async () => {
    const sheet = await read(
      await xlsx({
        name: 'Hoja1',
        rows: [['N°', 'CÓD.', 'nombre del producto', 'Precio unitario (S/)', 'Motivo'], [1, 'A-1', 'Uno', 10, 'x']],
      }),
    )
    expect(sheet.columns).toEqual(['code', 'name', 'price'])
    expect(sheet.rows[0].cells).toEqual({
      code: { kind: 'text', value: 'A-1' },
      name: { kind: 'text', value: 'Uno' },
      price: { kind: 'number', value: 10 },
    })
  })

  it('un archivo con Código y Precio es una actualización parcial', async () => {
    const sheet = await read(await xlsx({ name: 'Precios', rows: [['Código', 'Precio'], ['A-1', 10]] }))
    expect(sheet.columns).toEqual(['code', 'price'])
  })

  it('explica cada archivo que no sirve', async () => {
    const message = async (data: ArrayBuffer, name = 'productos.xlsx') => {
      const result = await readImportFile(data, name)
      return result.ok ? null : result.message
    }
    const priceList = await buildPriceList({ rows: [], company: null, logo: null, generatedAt: new Date() })
    expect(await message(toArrayBuffer(priceList))).toBe(FILE_MESSAGES.priceList)
    expect(await message(await xlsx({ name: 'P', rows: [['Nombre', 'Precio'], ['A', 1]] }))).toBe(
      FILE_MESSAGES.noCode,
    )
    expect(await message(await xlsx({ name: 'P', rows: [['Cod. Prov', 'P.V.P.'], ['A', 1]] }))).toBe(
      FILE_MESSAGES.noColumns,
    )
    expect(await message(await xlsx({ name: 'P', rows: [HEADER] }))).toBe(FILE_MESSAGES.empty)
    expect(await message(await xlsx({ name: 'P', rows: [HEADER] }), 'productos.csv')).toBe(
      FILE_MESSAGES.notXlsx,
    )
    expect(await message(new TextEncoder().encode('codigo,nombre\nA,B').buffer)).toBe(
      FILE_MESSAGES.notXlsx,
    )
    expect(await message(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]).buffer)).toBe(
      FILE_MESSAGES.unreadable,
    )
    expect(await message(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]).buffer)).toBe(
      FILE_MESSAGES.unreadable,
    )
    expect(await message(new ArrayBuffer(IMPORT_MAX_BYTES + 1))).toBe(FILE_MESSAGES.tooBig)
  })

  it('acepta 5 000 productos y rechaza 5 001', async () => {
    const rows = (count: number) => [
      ['Código', 'Precio'],
      ...Array.from({ length: count }, (_, index) => [`P-${index}`, 10]),
    ]
    expect((await read(await xlsx({ name: 'P', rows: rows(5000) }))).rows).toHaveLength(5000)
    const result = await readImportFile(await xlsx({ name: 'P', rows: rows(5001) }), 'p.xlsx')
    expect(result).toEqual({ ok: false, message: FILE_MESSAGES.tooManyRows })
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/import-read.test.ts`
Expected: FAIL. No existe `@/features/catalog/excel/read`.

- [ ] **Step 3: Implementar el lector**

`src/features/catalog/excel/read.ts`:

```ts
import 'server-only'
import ExcelJS from 'exceljs'
import { FILE_MESSAGES, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '../import/options'
import { IMPORT_COLUMNS, type ImportColumn } from '../import/types'
import { priceColumns } from '../price-columns'
import { readCell, type ReadRow } from './normalize'

export type ReadSheet = { sheetName: string; columns: ImportColumn[]; rows: ReadRow[] }
export type ReadResult = { ok: true; sheet: ReadSheet } | { ok: false; message: string }

// «Código», «CÓDIGO », «codigo:» → «codigo».
export const headerKey = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/:$/, '')

// Títulos aceptados, sin tildes ni mayúsculas (spec §9.2). «Valor sin IGV» del reporte no es un
// precio: no está en la lista. El título del precio del catálogo se añade según TAX_CONFIG.
const ALIASES: Record<ImportColumn, string[]> = {
  code: ['codigo', 'cod', 'cod.', 'sku', 'codigo del producto'],
  name: ['nombre', 'producto', 'nombre del producto'],
  description: ['descripcion'],
  category: ['categoria'],
  price: [
    'precio',
    'precio (s/)',
    'precio unitario',
    'precio unitario (s/)',
    'precio con igv',
    'precio con igv (s/)',
    headerKey(priceColumns().catalog),
  ],
}

const COLUMN_BY_TITLE = new Map<string, ImportColumn>(
  IMPORT_COLUMNS.flatMap((column) => ALIASES[column].map((title) => [title, column] as const)),
)

// La otra columna de precio del reporte («Valor sin IGV (S/)») no se importa: se recuerda para avisar.
const derivedLabel = priceColumns().derived?.label
const DERIVED_KEY = derivedLabel ? headerKey(derivedLabel) : null

// Hojas que nunca traen productos para importar (spec §9.2).
const RESERVED = new Set(['instrucciones', 'categorias', 'resumen', 'resumen por categoria', 'cambios'])
const PRICE_LIST = 'lista de precios'
const HEADER_SCAN = 20
const ZIP = [0x50, 0x4b, 0x03, 0x04]
// Un .xlsx con contraseña (y un .xls) es un archivo OLE, no un ZIP.
const OLE = [0xd0, 0xcf, 0x11, 0xe0]

type Header = { row: number; positions: Map<ImportColumn, number>; derived: string | null }

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((byte, index) => bytes[index] === byte)

// Fila de títulos: la primera de las 20 primeras con al menos dos columnas conocidas. Sirve para la
// plantilla (fila 1), el reporte (fila 8) y la hoja «Para revertir» del comprobante (fila 4).
function findHeader(sheet: ExcelJS.Worksheet): Header | null {
  for (let row = 1; row <= Math.min(HEADER_SCAN, sheet.rowCount); row++) {
    const positions = new Map<ImportColumn, number>()
    let derived: string | null = null
    sheet.getRow(row).eachCell((cell, column) => {
      const key = headerKey(cell.text ?? '')
      const known = COLUMN_BY_TITLE.get(key)
      if (known && !positions.has(known)) positions.set(known, column)
      if (key === DERIVED_KEY) derived = cell.text.trim()
    })
    if (positions.size >= 2) return { row, positions, derived }
  }
  return null
}

// Filas bajo los títulos; las vacías se ignoran y no cuentan (spec §9.4).
function readRows(sheet: ExcelJS.Worksheet, header: Header): ReadResult {
  const columns = IMPORT_COLUMNS.filter((column) => header.positions.has(column))
  const rows: ReadRow[] = []
  let tooMany = false
  sheet.eachRow((row, line) => {
    if (line <= header.row || tooMany) return
    const cells: ReadRow['cells'] = {}
    let empty = true
    for (const [column, position] of header.positions) {
      const cell = readCell(row.getCell(position).value)
      cells[column] = cell
      if (cell.kind !== 'empty') empty = false
    }
    if (empty) return
    if (rows.length === IMPORT_MAX_ROWS) tooMany = true
    else rows.push({ line, cells })
  })
  if (tooMany) return { ok: false, message: FILE_MESSAGES.tooManyRows }
  if (rows.length === 0) return { ok: false, message: FILE_MESSAGES.empty }
  return {
    ok: true,
    sheet: { sheetName: sheet.name, columns, rows, derivedPrice: header.derived },
  }
}

// Lee el .xlsx de la carga masiva: la primera hoja con títulos conocidos, sin las reservadas
// (spec §9.2 y §11). Tamaño, extensión y firma se comprueban otra vez aquí, en el servidor.
export async function readImportFile(data: ArrayBuffer, fileName: string): Promise<ReadResult> {
  const fail = (message: string): ReadResult => ({ ok: false, message })
  if (!fileName.toLowerCase().endsWith('.xlsx')) return fail(FILE_MESSAGES.notXlsx)
  if (data.byteLength > IMPORT_MAX_BYTES) return fail(FILE_MESSAGES.tooBig)
  const head = new Uint8Array(data, 0, Math.min(4, data.byteLength))
  if (!startsWith(head, ZIP)) {
    return fail(startsWith(head, OLE) ? FILE_MESSAGES.unreadable : FILE_MESSAGES.notXlsx)
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(data)
  } catch {
    return fail(FILE_MESSAGES.unreadable)
  }

  let priceList = false
  let missingCode = false
  for (const sheet of workbook.worksheets) {
    const name = headerKey(sheet.name)
    if (name === PRICE_LIST) priceList = true
    if (name === PRICE_LIST || RESERVED.has(name)) continue
    const header = findHeader(sheet)
    if (!header) continue
    if (!header.positions.has('code')) {
      missingCode = true
      continue
    }
    return readRows(sheet, header)
  }
  if (priceList) return fail(FILE_MESSAGES.priceList)
  return fail(missingCode ? FILE_MESSAGES.noCode : FILE_MESSAGES.noColumns)
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/import-read.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

Si alguna lectura de ExcelJS devuelve otra forma (por ejemplo, el texto de una celda de título), se ajusta **la lectura en `read.ts`**, no la prueba: las pruebas describen lo que debe pasar con cada archivo. Se anota como `Ruling:`.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/excel/read.ts tests/unit/import-read.test.ts
git commit -m "feat: find the products sheet, header row and columns of an uploaded Excel"
```

---

### Task 4: Validación de filas y categorías parecidas

**Files:**
- Create: `src/features/catalog/excel/validate.ts`, `src/features/catalog/excel/similar.ts`
- Test: `tests/unit/import-validate.test.ts`, `tests/unit/import-similar.test.ts`

**Interfaces:**
- Consumes: `cellText`, `cellPrice`, `checkPrice`, `EMPTY_CELL`, `ReadRow` (tarea 2); `productSchema`, `categorySchema` (catálogo); `applyTax`, `parseCents`, `centsToDecimal` (proforma); `categoryKey` y las constantes de parecido (tarea 2).
- Produces:
  - `COLUMN_LABELS`, `fieldError(column, message)`;
  - `CheckedRow = { line; code; codeOk; name?; description?; category?; price?; priceBeforeTax?; errors }`;
  - `checkRows(rows, columns, { pricesIncludeTax, ratePercent }): CheckedRow[]`;
  - `categoryStem(name)`, `levenshtein(a, b)`;
  - `CategoryMatch = { kind: 'existing' | 'near' | 'similar'; target } | { kind: 'new' }`;
  - `matchCategory(name, existing): CategoryMatch`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/import-validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Cell, ReadRow } from '@/features/catalog/excel/normalize'
import { checkRows } from '@/features/catalog/excel/validate'
import type { ImportColumn } from '@/features/catalog/import/types'

const ALL: ImportColumn[] = ['code', 'name', 'description', 'category', 'price']
const WITH_TAX = { pricesIncludeTax: true, ratePercent: 18 }

const cell = (value: string | number | null): Cell =>
  value === null
    ? { kind: 'empty' }
    : typeof value === 'number'
      ? { kind: 'number', value }
      : { kind: 'text', value }

function row(line: number, values: Partial<Record<ImportColumn, string | number | null>>): ReadRow {
  return {
    line,
    cells: Object.fromEntries(Object.entries(values).map(([column, value]) => [column, cell(value)])),
  }
}

describe('checkRows', () => {
  it('limpia y valida una fila completa', () => {
    const [checked] = checkRows(
      [row(2, { code: ' lap-001 ', name: 'Laptop', description: 'Core i5', category: 'Laptops', price: '2,590.00' })],
      ALL,
      WITH_TAX,
    )
    expect(checked).toEqual({
      line: 2,
      code: 'LAP-001',
      codeOk: true,
      name: 'Laptop',
      description: 'Core i5',
      category: 'Laptops',
      price: '2590.00',
      errors: [],
    })
  })

  it('explica cada problema con el nombre de la columna', () => {
    const [checked] = checkRows(
      [row(2, { code: null, name: null, description: 'x'.repeat(2001), category: null, price: 'abc' })],
      ALL,
      WITH_TAX,
    )
    expect(checked.codeOk).toBe(false)
    expect(checked.errors).toEqual([
      'Código: escribe un código para identificar el producto.',
      'Nombre: está vacío. Escríbelo o quita la columna del archivo.',
      'Descripción: usa como máximo 2000 caracteres.',
      'Categoría: está vacía. Escríbela o quita la columna del archivo.',
      'Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50.',
    ])
  })

  it('un código repetido es error desde la segunda vez', () => {
    const rows = checkRows(
      [row(2, { code: 'A-1', price: 10 }), row(5, { code: 'a-1', price: 20 })],
      ['code', 'price'],
      WITH_TAX,
    )
    expect(rows[0].errors).toEqual([])
    expect(rows[1]).toMatchObject({ code: 'A-1', codeOk: false, errors: ['Código repetido: ya está en la fila 2.'] })
  })

  it('las columnas ausentes no se validan; una descripción vacía la borra', () => {
    const [checked] = checkRows([row(2, { code: 'A-1', description: null })], ['code', 'description'], WITH_TAX)
    expect(checked).toEqual({ line: 2, code: 'A-1', codeOk: true, description: null, errors: [] })
  })

  it('un código numérico se escribe sin notación científica y con decimales es error', () => {
    const rows = checkRows([row(2, { code: 123456789012 }), row(3, { code: 12.5 })], ['code'], WITH_TAX)
    expect(rows[0]).toMatchObject({ code: '123456789012', codeOk: true })
    expect(rows[1].errors).toEqual(['Código: no puede tener decimales. Escríbelo como texto.'])
  })

  it('«No incluyen IGV» suma el 18 % en céntimos, con la mitad hacia arriba, antes de validar', () => {
    const rows = checkRows(
      [
        row(2, { code: 'A', price: 1000 }),
        row(3, { code: 'B', price: '0.01' }),
        row(4, { code: 'C', price: '9999999999.99' }),
      ],
      ['code', 'price'],
      { pricesIncludeTax: false, ratePercent: 18 },
    )
    expect(rows[0]).toMatchObject({ price: '1180.00', priceBeforeTax: '1000.00' })
    expect(rows[1]).toMatchObject({ price: '0.01', priceBeforeTax: '0.01' })
    expect(rows[2].errors).toEqual(['Precio: no puede pasar de 9,999,999,999.99.'])
  })
})
```

`tests/unit/import-similar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { categoryStem, levenshtein, matchCategory } from '@/features/catalog/excel/similar'

const EXISTING = ['Impresoras', 'Impresión', 'Laptops', 'Lápices']

describe('categorías parecidas', () => {
  it('normaliza tildes, mayúsculas, espacios y el plural', () => {
    expect(categoryStem('  Impresoras ')).toBe('impresora')
    expect(categoryStem('IMPRESIÓN')).toBe('impresion')
    expect(categoryStem('Monitores')).toBe('monitor')
    expect(levenshtein('laptp', 'laptop')).toBe(1)
    expect(levenshtein('', 'abc')).toBe(3)
  })

  it('distingue la misma, casi igual, parecida y nueva', () => {
    expect(matchCategory('laptops', EXISTING)).toEqual({ kind: 'existing', target: 'Laptops' })
    expect(matchCategory('Impresora', EXISTING)).toEqual({ kind: 'near', target: 'Impresoras' })
    expect(matchCategory('Impresion', EXISTING)).toEqual({ kind: 'near', target: 'Impresión' })
    expect(matchCategory('Laptps', EXISTING)).toEqual({ kind: 'similar', target: 'Laptops' })
    expect(matchCategory('Monitores', EXISTING)).toEqual({ kind: 'new' })
  })

  it('elige la más cercana y no compara nombres de menos de 5 letras', () => {
    expect(matchCategory('Laptopz', EXISTING)).toEqual({ kind: 'similar', target: 'Laptops' })
    expect(matchCategory('Mous', ['Mesa'])).toEqual({ kind: 'new' })
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/import-validate.test.ts tests/unit/import-similar.test.ts`
Expected: FAIL. No existen los módulos.

- [ ] **Step 3: Implementar la validación y la comparación de categorías**

`src/features/catalog/excel/validate.ts`:

```ts
import { centsToDecimal, parseCents } from '@/features/proforma/money'
import { applyTax } from '@/features/proforma/tax'
import type { ImportColumn } from '../import/types'
import { categorySchema, productSchema } from '../schemas'
import { cellPrice, cellText, checkPrice, EMPTY_CELL, type ReadRow } from './normalize'

export const COLUMN_LABELS: Record<ImportColumn, string> = {
  code: 'Código',
  name: 'Nombre',
  description: 'Descripción',
  category: 'Categoría',
  price: 'Precio',
}

// Una fila con sus valores limpios y validados; solo trae las columnas presentes y válidas.
export type CheckedRow = {
  line: number
  code: string
  // Código válido y primera vez en el archivo: se puede buscar en la base.
  codeOk: boolean
  name?: string
  description?: string | null
  category?: string
  price?: string
  priceBeforeTax?: string
  errors: string[]
}

export type TaxOption = { pricesIncludeTax: boolean; ratePercent: number }

// «Precio: escribe solo números…»: el motivo sigue en minúscula tras el nombre de la columna.
export const fieldError = (column: ImportColumn, message: string) =>
  `${COLUMN_LABELS[column]}: ${message.charAt(0).toLowerCase()}${message.slice(1)}`

// Columna presente con la celda vacía (spec §6.7): solo la descripción puede quedar vacía, y se borra.
const EMPTY_MESSAGES = {
  name: 'Nombre: está vacío. Escríbelo o quita la columna del archivo.',
  category: 'Categoría: está vacía. Escríbela o quita la columna del archivo.',
  price: 'Precio: está vacío. Escríbelo o quita la columna del archivo.',
}

// Las mismas reglas del formulario (spec §3), aplicadas solo a las columnas presentes. Un producto
// nuevo sin nombre, categoría o precio se detecta después, cuando la base dice que el código no existe.
export function checkRows(rows: ReadRow[], columns: ImportColumn[], tax: TaxOption): CheckedRow[] {
  const firstLine = new Map<string, number>()
  const has = (column: ImportColumn) => columns.includes(column)
  return rows.map((row) => {
    const checked: CheckedRow = { line: row.line, code: '', codeOk: false, errors: [] }
    const fail = (column: ImportColumn, message: string) =>
      checked.errors.push(fieldError(column, message))
    const cell = (column: ImportColumn) => row.cells[column] ?? EMPTY_CELL

    const code = cellText(cell('code'), { integerOnly: true })
    if (!code.ok) fail('code', code.error)
    else {
      checked.code = code.value.toUpperCase()
      const parsed = productSchema.shape.code.safeParse(code.value)
      if (!parsed.success) fail('code', parsed.error.issues[0].message)
      else if (firstLine.has(parsed.data)) {
        checked.errors.push(`Código repetido: ya está en la fila ${firstLine.get(parsed.data)}.`)
      } else {
        firstLine.set(parsed.data, row.line)
        checked.codeOk = true
      }
    }

    if (has('name')) {
      const name = cellText(cell('name'))
      if (!name.ok) fail('name', name.error)
      else if (name.value === '') checked.errors.push(EMPTY_MESSAGES.name)
      else {
        const parsed = productSchema.shape.name.safeParse(name.value)
        if (parsed.success) checked.name = parsed.data
        else fail('name', parsed.error.issues[0].message)
      }
    }

    if (has('description')) {
      const description = cellText(cell('description'), { multiline: true })
      if (!description.ok) fail('description', description.error)
      else {
        const parsed = productSchema.shape.description.safeParse(description.value)
        if (parsed.success) checked.description = parsed.data
        else fail('description', parsed.error.issues[0].message)
      }
    }

    if (has('category')) {
      const category = cellText(cell('category'))
      if (!category.ok) fail('category', category.error)
      else if (category.value === '') checked.errors.push(EMPTY_MESSAGES.category)
      else {
        const parsed = categorySchema.shape.name.safeParse(category.value)
        if (parsed.success) checked.category = parsed.data
        else fail('category', parsed.error.issues[0].message)
      }
    }

    if (has('price')) {
      const price = cellPrice(cell('price'))
      if (!price.ok) fail('price', price.error)
      else if (price.value === '') checked.errors.push(EMPTY_MESSAGES.price)
      else if (tax.pricesIncludeTax) checked.price = price.value
      else {
        // «No incluyen IGV: sumar 18 %» (spec §9.4): en céntimos, con la mitad hacia arriba y antes de
        // validar, así que un precio que pasa el máximo da su error normal.
        const cents = parseCents(price.value) ?? BigInt(0)
        const total = applyTax(cents, { mode: 'added', ratePercent: tax.ratePercent }).total
        const withTax = checkPrice(centsToDecimal(total))
        if (!withTax.ok) fail('price', withTax.error)
        else {
          checked.price = withTax.value
          checked.priceBeforeTax = price.value
        }
      }
    }
    return checked
  })
}
```

`src/features/catalog/excel/similar.ts`:

```ts
import {
  CATEGORY_SIMILARITY_DISTANCE,
  CATEGORY_SIMILARITY_MIN_LENGTH,
  categoryKey,
} from '../import/options'

// Sin dependencias del servidor: se prueba aparte (spec §9.2).

export type CategoryMatch =
  | { kind: 'existing' | 'near' | 'similar'; target: string }
  | { kind: 'new' }

// Minúsculas, sin tildes ni espacios dobles y sin la «s» o «es» del plural (spec §9.4).
export const categoryStem = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?:es|s)$/, '')

export function levenshtein(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

// La misma (como el índice único), casi igual (tildes, mayúsculas, espacios o plural), parecida
// (hasta 2 letras de diferencia en nombres de 5 o más) o nueva. Con varias, la más cercana.
export function matchCategory(name: string, existing: string[]): CategoryMatch {
  const key = categoryKey(name)
  const same = existing.find((candidate) => categoryKey(candidate) === key)
  if (same) return { kind: 'existing', target: same }
  const stem = categoryStem(name)
  let best: { target: string; distance: number } | null = null
  for (const candidate of [...existing].sort((a, b) => a.localeCompare(b, 'es'))) {
    const other = categoryStem(candidate)
    if (other === stem) return { kind: 'near', target: candidate }
    if (stem.length < CATEGORY_SIMILARITY_MIN_LENGTH || other.length < CATEGORY_SIMILARITY_MIN_LENGTH) {
      continue
    }
    const distance = levenshtein(stem, other)
    if (distance <= CATEGORY_SIMILARITY_DISTANCE && (!best || distance < best.distance)) {
      best = { target: candidate, distance }
    }
  }
  return best ? { kind: 'similar', target: best.target } : { kind: 'new' }
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/import-validate.test.ts tests/unit/import-similar.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/excel/validate.ts src/features/catalog/excel/similar.ts tests/unit/import-validate.test.ts tests/unit/import-similar.test.ts
git commit -m "feat: validate imported rows and spot near-duplicate categories"
```

---

### Task 5: Plantilla de importación

**Files:**
- Create: `src/features/catalog/excel/template.ts`
- Test: `tests/unit/import-template.test.ts`

**Interfaces:**
- Consumes: el tema (fase 1); `IMPORT_COLUMNS`, `IMPORT_MAX_ROWS` y `templateTitles` (tarea 2); `readImportFile` (tarea 3, en las pruebas).
- Produces: `buildTemplate(categories: string[]): Promise<Buffer>`.

- [ ] **Step 1: Escribir la prueba, que lee la plantilla de vuelta**

`tests/unit/import-template.test.ts`:

```ts
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { readImportFile } from '@/features/catalog/excel/read'
import { buildTemplate } from '@/features/catalog/excel/template'
import { FILE_MESSAGES } from '@/features/catalog/import/options'

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer).buffer)
  return workbook
}

describe('buildTemplate', () => {
  it('trae las instrucciones primero, la hoja de productos y la lista oculta de categorías', async () => {
    const workbook = await load(await buildTemplate(['Impresoras', 'Laptops']))
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Instrucciones',
      'Productos',
      'Categorías',
    ])
    expect(workbook.getWorksheet('Categorías')!.state).toBe('hidden')
    expect(workbook.getWorksheet('Categorías')!.getCell('A2').value).toBe('Laptops')
    const instructions = workbook
      .getWorksheet('Instrucciones')!
      .getSheetValues()
      .flat()
      .filter((value) => typeof value === 'string')
    expect(instructions).toContain('Las filas de ejemplo de esta hoja no se importan.')
  })

  it('la hoja Productos lleva títulos, código como texto, ayudas y el desplegable de categorías', async () => {
    const products = (await load(await buildTemplate(['Impresoras', 'Laptops']))).getWorksheet(
      'Productos',
    )!
    expect((products.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Código',
      'Nombre',
      'Descripción',
      'Categoría',
      'Precio con IGV (S/)',
    ])
    expect(products.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(products.getColumn(1).numFmt).toBe('@')
    expect(products.getCell('A2').dataValidation).toMatchObject({
      type: 'textLength',
      formulae: [1, 64],
      promptTitle: 'Código',
    })
    expect(products.getCell('D5001').dataValidation).toMatchObject({
      type: 'list',
      formulae: ["'Categorías'!$A$1:$A$2"],
      errorStyle: 'information',
      errorTitle: 'Categoría nueva',
      error: 'No está en tu lista: se creará al importar.',
    })
    expect(products.getCell('E2').dataValidation).toMatchObject({
      type: 'decimal',
      operator: 'greaterThan',
      errorStyle: 'stop',
    })
  })

  it('sin categorías, la columna se escribe a mano', async () => {
    const products = (await load(await buildTemplate([]))).getWorksheet('Productos')!
    expect(products.getCell('D2').dataValidation).toMatchObject({ type: 'textLength' })
  })

  it('el importador la reconoce: vacía avisa que no hay productos y completada se lee', async () => {
    const empty = await buildTemplate(['Laptops'])
    expect(await readImportFile(new Uint8Array(empty).buffer, 'plantilla.xlsx')).toEqual({
      ok: false,
      message: FILE_MESSAGES.empty,
    })
    const workbook = await load(empty)
    workbook.getWorksheet('Productos')!.getRow(2).values = ['LAP-001', 'Laptop', null, 'Laptops', 2590]
    const filled = new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
    const result = await readImportFile(filled, 'plantilla.xlsx')
    expect(result.ok && result.sheet).toMatchObject({ sheetName: 'Productos', rows: [{ line: 2 }] })
  })
})
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `pnpm exec vitest run --project unit tests/unit/import-template.test.ts`
Expected: FAIL. No existe `@/features/catalog/excel/template`.

- [ ] **Step 3: Implementar la plantilla**

`src/features/catalog/excel/template.ts`:

```ts
import 'server-only'
import ExcelJS from 'exceljs'
import { IMPORT_MAX_ROWS, templateTitles } from '../import/options'
import { IMPORT_COLUMNS, type ImportColumn } from '../import/types'
import { priceColumns } from '../price-columns'
import { COLORS, FONT, styleBodyRow, styleHeaderRow } from './theme'

const WIDTHS: Record<ImportColumn, number> = {
  code: 16,
  name: 40,
  description: 60,
  category: 24,
  price: 18,
}
const LAST_ROW = IMPORT_MAX_ROWS + 1

type Validations = { add(range: string, validation: ExcelJS.DataValidation): void }

// ExcelJS acepta validaciones por rango aunque sus tipos no lo declaren: una sola regla para 5 000
// filas y un archivo de pocos KB.
const validations = (sheet: ExcelJS.Worksheet) =>
  (sheet as unknown as { dataValidations: Validations }).dataValidations

const EXAMPLES: ExcelJS.CellValue[][] = [
  ['LAP-001', 'Laptop 14" Core i5', 'Core i5 · 16 GB · SSD 512 GB', 'Laptops', 2590],
  ['IMP-014', 'Impresora láser HP M404dn', 'Monocromática, dúplex', 'Impresoras', 1180],
  ['FOT-002', 'Fotocopiadora Ricoh MP 3054', null, 'Fotocopiadoras', 12500],
]

// Hoja «Instrucciones», la primera al abrir (spec §8): pasos cortos y un ejemplo que no se importa.
function writeInstructions(sheet: ExcelJS.Worksheet) {
  const titles = templateTitles()
  sheet.columns = [{ width: 3 }, ...IMPORT_COLUMNS.map((column) => ({ width: WIDTHS[column] }))]
  const title = sheet.getCell('B2')
  title.value = 'Cómo cargar tus productos'
  title.font = { name: FONT, size: 16, bold: true, color: { argb: COLORS.ink } }
  const steps = [
    'Completa la hoja «Productos»: una fila por producto, desde la fila 2.',
    'Código es obligatorio. Si ya existe, se actualiza ese producto; si no, se crea uno nuevo.',
    `Para un producto nuevo completa también Nombre, Categoría y ${titles.price}.`,
    `${priceColumns().note} Por ejemplo 1250.50 o 1,250.50.`,
    'Elige la categoría del desplegable o escribe una nueva: se creará al importar.',
    `Para actualizar solo precios, deja Código y ${titles.price}, y borra las demás columnas.`,
    'Puedes dejar filas vacías: se ignoran. No cambies los títulos de la primera fila.',
    'Súbela en Productos › Carga masiva: antes de guardar verás qué pasará con cada fila.',
  ]
  steps.forEach((text, index) => {
    const row = 4 + index
    sheet.mergeCells(row, 2, row, 6)
    const cell = sheet.getCell(row, 2)
    cell.value = `${index + 1}. ${text}`
    cell.font = { name: FONT, size: 11, color: { argb: COLORS.ink } }
  })

  const exampleTitle = sheet.getCell(13, 2)
  exampleTitle.value = 'Ejemplo'
  exampleTitle.font = { name: FONT, size: 13, bold: true, color: { argb: COLORS.link } }
  const header = sheet.getRow(14)
  header.values = [null, ...IMPORT_COLUMNS.map((column) => titles[column])]
  styleHeaderRow(header)
  EXAMPLES.forEach((values, index) => {
    const row = sheet.getRow(15 + index)
    row.values = [null, ...values]
    styleBodyRow(row, index)
  })
  sheet.mergeCells(19, 2, 19, 6)
  const note = sheet.getCell(19, 2)
  note.value = 'Las filas de ejemplo de esta hoja no se importan.'
  note.font = { name: FONT, size: 10, italic: true, color: { argb: COLORS.muted } }
}

// Plantilla de importación (spec §8): desplegable de categorías desde una hoja oculta (una lista
// escrita no puede pasar de 255 caracteres), ayudas al seleccionar cada celda y el código como
// texto, para que Excel no convierta «00123» ni «1E5».
export async function buildTemplate(categories: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  const titles = templateTitles()

  writeInstructions(
    workbook.addWorksheet('Instrucciones', { properties: { tabColor: { argb: COLORS.ink } } }),
  )

  const products = workbook.addWorksheet('Productos', {
    properties: { tabColor: { argb: COLORS.primary } },
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  products.columns = IMPORT_COLUMNS.map((column) => ({ width: WIDTHS[column] }))
  const header = products.getRow(1)
  header.values = IMPORT_COLUMNS.map((column) => titles[column])
  styleHeaderRow(header)
  products.getColumn(1).numFmt = '@'
  products.getColumn(3).alignment = { wrapText: true, vertical: 'top' }
  products.getColumn(5).numFmt = '#,##0.00'

  const rules = validations(products)
  const help = { allowBlank: true, showInputMessage: true, showErrorMessage: true }
  rules.add(`A2:A${LAST_ROW}`, {
    ...help,
    type: 'textLength',
    operator: 'between',
    formulae: [1, 64],
    promptTitle: 'Código',
    prompt: 'Obligatorio y único. Si ya existe, se actualiza ese producto.',
    errorStyle: 'stop',
    errorTitle: 'Código',
    error: 'Usa de 1 a 64 caracteres.',
  })
  rules.add(`B2:B${LAST_ROW}`, {
    ...help,
    type: 'textLength',
    operator: 'between',
    formulae: [1, 120],
    promptTitle: 'Nombre',
    prompt: 'Obligatorio para productos nuevos. Hasta 120 caracteres.',
    errorStyle: 'stop',
    errorTitle: 'Nombre',
    error: 'Usa como máximo 120 caracteres.',
  })
  rules.add(`C2:C${LAST_ROW}`, {
    ...help,
    type: 'textLength',
    operator: 'between',
    formulae: [0, 2000],
    promptTitle: 'Descripción',
    prompt: 'Opcional, hasta 2 000 caracteres. Puede tener varias líneas.',
    errorStyle: 'stop',
    errorTitle: 'Descripción',
    error: 'Usa como máximo 2000 caracteres.',
  })
  rules.add(
    `D2:D${LAST_ROW}`,
    categories.length > 0
      ? {
          ...help,
          type: 'list',
          formulae: [`'Categorías'!$A$1:$A$${categories.length}`],
          promptTitle: 'Categoría',
          prompt: 'Elígela del desplegable o escribe una nueva: se creará al importar.',
          // Información y no advertencia: una categoría nueva no es un error.
          errorStyle: 'information',
          errorTitle: 'Categoría nueva',
          error: 'No está en tu lista: se creará al importar.',
        }
      : {
          ...help,
          type: 'textLength',
          operator: 'between',
          formulae: [1, 120],
          promptTitle: 'Categoría',
          prompt: 'Escribe la categoría: se creará al importar.',
          errorStyle: 'stop',
          errorTitle: 'Categoría',
          error: 'Usa como máximo 120 caracteres.',
        },
  )
  rules.add(`E2:E${LAST_ROW}`, {
    ...help,
    type: 'decimal',
    operator: 'greaterThan',
    formulae: [0],
    promptTitle: titles.price,
    prompt: priceColumns().note,
    errorStyle: 'stop',
    errorTitle: 'Precio',
    error: 'Escribe un precio mayor que 0, con hasta 2 decimales.',
  })

  const list = workbook.addWorksheet('Categorías', { state: 'hidden' })
  categories.forEach((name, index) => {
    list.getCell(index + 1, 1).value = name
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
```

- [ ] **Step 4: Ejecutar la prueba, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/import-template.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/excel/template.ts tests/unit/import-template.test.ts
git commit -m "feat: build the bulk import template with category list and cell help"
```

---

### Task 6: Archivo de filas con errores y comprobante

**Files:**
- Create: `src/features/catalog/excel/errors-file.ts`, `src/features/catalog/excel/receipt.ts`
- Modify: `src/features/catalog/excel/theme.ts` (color `danger`)
- Test: `tests/unit/import-files.test.ts`

**Interfaces:**
- Consumes:
  - `templateTitles` (tarea 2);
  - el tema (fase 1);
  - `formatDate` y `lima` (`src/lib/dates.ts`);
  - `Cell` (tarea 2);
  - `readImportFile` (tarea 3, en las pruebas).
- Produces:
  - errores: `ErrorRow = { line; cells: Partial<Record<ImportColumn, Cell>>; errors: string[] }` y `buildErrorsFile(rows, columns): Promise<Buffer>`;
  - tipos del comprobante: `ReceiptChange = { code; product; action: 'created' | 'updated'; field: DataColumn | null; before; after }`, `PreviousValues = { code; name; description; category; price }`, `ReceiptInput`;
  - comprobante: `REVERT_SHEET = 'Para revertir'` y `buildReceipt(input): Promise<Buffer>`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/import-files.test.ts`:

```ts
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildErrorsFile } from '@/features/catalog/excel/errors-file'
import { readImportFile } from '@/features/catalog/excel/read'
import { buildReceipt, type ReceiptInput } from '@/features/catalog/excel/receipt'

const bytes = (buffer: Buffer) => new Uint8Array(buffer).buffer

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes(buffer))
  return workbook
}

const receipt: ReceiptInput = {
  kind: 'receipt',
  fileName: 'precios-octubre.xlsx',
  // 19:35 UTC = 14:35 en Lima.
  generatedAt: new Date('2026-10-02T19:35:00Z'),
  counts: { created: 1, updated: 1, unchanged: 3, skipped: 0, errors: 2 },
  categoriesCreated: ['Monitores'],
  changes: [
    { code: 'LAP-1', product: 'Laptop uno', action: 'updated', field: 'price', before: '1000', after: '1100.00' },
    { code: 'MON-1', product: 'Monitor 24', action: 'created', field: null, before: null, after: null },
  ],
  previous: [{ code: 'LAP-1', name: 'Laptop uno', description: null, category: 'Laptops', price: '1000' }],
  columns: ['code', 'price'],
}

describe('buildReceipt', () => {
  it('resume la importación y lista cada dato cambiado', async () => {
    const workbook = await load(await buildReceipt(receipt))
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Cambios', 'Para revertir'])
    const summary = workbook.getWorksheet('Resumen')!
    expect(summary.getCell('A1').value).toBe('Comprobante de importación')
    expect(summary.getCell('A2').value).toBe('Importado el 02/10/2026 a las 14:35 (hora de Lima)')
    expect(summary.getCell('A3').value).toBe('Archivo: precios-octubre.xlsx')
    expect((summary.getRow(5).values as unknown[]).slice(1)).toEqual(['Productos creados', 1])
    const changes = workbook.getWorksheet('Cambios')!
    expect((changes.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Código',
      'Producto',
      'Acción',
      'Dato',
      'Antes',
      'Después',
    ])
    expect((changes.getRow(2).values as unknown[]).slice(1)).toEqual([
      'LAP-1',
      'Laptop uno',
      'Actualizado',
      'Precio con IGV (S/)',
      1000,
      1100,
    ])
    expect(changes.getCell('E2').numFmt).toBe('"S/" #,##0.00')
    expect(changes.getCell('C3').value).toBe('Creado')
  })

  it('la hoja «Para revertir» se puede volver a subir con los valores anteriores', async () => {
    const result = await readImportFile(bytes(await buildReceipt(receipt)), 'comprobante.xlsx')
    expect(result.ok && result.sheet).toMatchObject({
      sheetName: 'Para revertir',
      columns: ['code', 'price'],
      rows: [{ cells: { code: { kind: 'text', value: 'LAP-1' }, price: { kind: 'number', value: 1000 } } }],
    })
  })

  it('la simulación avisa que todavía no se guardó nada y no trae «Para revertir»', async () => {
    const workbook = await load(await buildReceipt({ ...receipt, kind: 'simulation', previous: [] }))
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Cambios'])
    expect(workbook.getWorksheet('Resumen')!.getCell('A1').value).toBe(
      'Simulación: todavía no se guardó nada',
    )
    expect(workbook.getWorksheet('Cambios')!.getCell('C2').value).toBe('Se actualizará')
  })
})

describe('buildErrorsFile', () => {
  it('trae lo que tenía cada fila y el motivo, y se puede corregir y volver a subir', async () => {
    const buffer = await buildErrorsFile(
      [
        {
          line: 7,
          cells: { code: { kind: 'text', value: 'BAD-1' }, price: { kind: 'text', value: 'abc' } },
          errors: ['Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50.'],
        },
        {
          line: 9,
          cells: { code: { kind: 'empty' }, price: { kind: 'number', value: 10 } },
          errors: ['Código: escribe un código para identificar el producto.', 'Otro motivo.'],
        },
      ],
      ['code', 'price'],
    )
    const sheet = (await load(buffer)).getWorksheet('Filas con errores')!
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Código',
      'Precio con IGV (S/)',
      'Fila',
      'Motivo',
    ])
    expect((sheet.getRow(2).values as unknown[]).slice(1)).toEqual([
      'BAD-1',
      'abc',
      7,
      'Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50.',
    ])
    expect(sheet.getCell('D3').value).toBe(
      'Código: escribe un código para identificar el producto.\nOtro motivo.',
    )
    expect(sheet.getCell('D2').font?.color?.argb).toBe('FFB42318')
    // El código va como texto: al corregirlo, Excel no convierte «00123» en 123.
    expect(sheet.getCell('A2').numFmt).toBe('@')
    const reread = await readImportFile(bytes(buffer), 'errores.xlsx')
    expect(reread.ok && reread.sheet.columns).toEqual(['code', 'price'])
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/import-files.test.ts`
Expected: FAIL. No existen los módulos.

- [ ] **Step 3: Implementar**

En `src/features/catalog/excel/theme.ts`, añade el rojo de los motivos a `COLORS`, después de `warning`:

```ts
  danger: 'FFB42318',
```

`src/features/catalog/excel/errors-file.ts`:

```ts
import 'server-only'
import ExcelJS from 'exceljs'
import { templateTitles } from '../import/options'
import type { ImportColumn } from '../import/types'
import type { Cell } from './normalize'
import { COLORS, FONT, styleBodyRow, styleHeaderRow } from './theme'

export type ErrorRow = {
  line: number
  cells: Partial<Record<ImportColumn, Cell>>
  errors: string[]
}

const WIDTHS: Record<ImportColumn, number> = {
  code: 16,
  name: 40,
  description: 50,
  category: 24,
  price: 18,
}

// Lo que traía la celda, tal cual, para corregirlo aquí mismo.
function shownValue(cell: Cell | undefined): ExcelJS.CellValue {
  if (!cell) return null
  switch (cell.kind) {
    case 'empty':
      return null
    case 'error':
      return cell.shown
    default:
      return cell.value
  }
}

// Filas con errores (spec §9.2): las columnas del archivo, la fila de origen y el motivo en rojo. Se
// corrige aquí y se vuelve a subir: «Fila» y «Motivo» no son columnas de la plantilla, así que el
// importador las ignora.
export async function buildErrorsFile(rows: ErrorRow[], columns: ImportColumn[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  const titles = templateTitles()
  const sheet = workbook.addWorksheet('Filas con errores', {
    properties: { tabColor: { argb: COLORS.danger } },
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  sheet.columns = [
    ...columns.map((column) => ({ width: WIDTHS[column] })),
    { width: 8 },
    { width: 70 },
  ]
  // El código como texto, igual que en la plantilla: al corregirlo, Excel no convierte «00123».
  const code = columns.indexOf('code')
  if (code >= 0) sheet.getColumn(code + 1).numFmt = '@'
  const header = sheet.getRow(1)
  header.values = [...columns.map((column) => titles[column]), 'Fila', 'Motivo']
  styleHeaderRow(header)
  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 2)
    excelRow.values = [
      ...columns.map((column) => shownValue(row.cells[column])),
      row.line,
      row.errors.join('\n'),
    ]
    styleBodyRow(excelRow, index)
    const reason = excelRow.getCell(columns.length + 2)
    reason.font = { name: FONT, size: 11, bold: true, color: { argb: COLORS.danger } }
    reason.alignment = { wrapText: true, vertical: 'top' }
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
```

`src/features/catalog/excel/receipt.ts`:

```ts
import 'server-only'
import { format } from 'date-fns'
import ExcelJS from 'exceljs'
import { formatDate, lima } from '@/lib/dates'
import { templateTitles } from '../import/options'
import type { DataColumn, ImportColumn } from '../import/types'
import { COLORS, FONT, MONEY_FORMAT, styleBodyRow, styleHeaderRow } from './theme'

export type ReceiptChange = {
  code: string
  product: string
  action: 'created' | 'updated'
  field: DataColumn | null
  before: string | null
  after: string | null
}

export type PreviousValues = {
  code: string
  name: string
  description: string | null
  category: string
  price: string
}

export type ReceiptInput = {
  kind: 'receipt' | 'simulation'
  fileName: string
  generatedAt: Date
  counts: { created: number; updated: number; unchanged: number; skipped: number; errors: number }
  categoriesCreated: string[]
  changes: ReceiptChange[]
  previous: PreviousValues[]
  // Columnas del archivo importado: «Para revertir» trae solo esas, así que revierte solo lo cambiado.
  columns: ImportColumn[]
}

export const REVERT_SHEET = 'Para revertir'
const REVERT_HEADER_ROW = 4

const WIDTHS: Record<ImportColumn, number> = {
  code: 16,
  name: 40,
  description: 50,
  category: 24,
  price: 18,
}

function writeSummary(sheet: ExcelJS.Worksheet, input: ReceiptInput) {
  const simulation = input.kind === 'simulation'
  const { counts } = input
  sheet.columns = [{ width: 44 }, { width: 14 }]
  const put = (row: number, value: string, font: Partial<ExcelJS.Font> = {}) => {
    const cell = sheet.getCell(row, 1)
    cell.value = value
    cell.font = { name: FONT, size: 11, color: { argb: COLORS.ink }, ...font }
  }
  put(1, simulation ? 'Simulación: todavía no se guardó nada' : 'Comprobante de importación', {
    size: 16,
    bold: true,
  })
  const at = input.generatedAt
  put(
    2,
    `${simulation ? 'Simulado' : 'Importado'} el ${formatDate(at)} a las ${format(at, 'HH:mm', { in: lima })} (hora de Lima)`,
    { color: { argb: COLORS.muted } },
  )
  put(3, `Archivo: ${input.fileName}`, { color: { argb: COLORS.muted } })
  const lines: [string, number][] = simulation
    ? [
        ['Productos que se crearían', counts.created],
        ['Productos que se actualizarían', counts.updated],
        ['Sin cambios', counts.unchanged],
        ['Filas omitidas por el modo', counts.skipped],
        ['Filas con errores (no se importarían)', counts.errors],
      ]
    : [
        ['Productos creados', counts.created],
        ['Productos actualizados', counts.updated],
        ['Sin cambios', counts.unchanged],
        ['Filas omitidas por el modo', counts.skipped],
        ['Filas con errores (no se importaron)', counts.errors],
      ]
  lines.forEach(([label, value], index) => {
    const row = sheet.getRow(5 + index)
    row.values = [label, value]
    styleBodyRow(row, index)
  })
  const label = simulation ? 'Categorías que se crearían' : 'Categorías nuevas'
  put(
    6 + lines.length,
    input.categoriesCreated.length > 0
      ? `${label}: ${input.categoriesCreated.join(', ')}`
      : 'Sin categorías nuevas.',
  )
}

function writeChanges(sheet: ExcelJS.Worksheet, input: ReceiptInput) {
  const simulation = input.kind === 'simulation'
  const titles = templateTitles()
  sheet.columns = [{ width: 16 }, { width: 40 }, { width: 16 }, { width: 22 }, { width: 40 }, { width: 40 }]
  const header = sheet.getRow(1)
  header.values = ['Código', 'Producto', 'Acción', 'Dato', 'Antes', 'Después']
  styleHeaderRow(header)
  input.changes.forEach((change, index) => {
    const row = sheet.getRow(index + 2)
    const price = change.field === 'price'
    const value = (text: string | null) => (price && text !== null ? Number(text) : text)
    const action =
      change.action === 'created'
        ? simulation
          ? 'Se creará'
          : 'Creado'
        : simulation
          ? 'Se actualizará'
          : 'Actualizado'
    row.values = [
      change.code,
      change.product,
      action,
      change.field ? titles[change.field] : '',
      value(change.before),
      value(change.after),
    ]
    styleBodyRow(row, index)
    for (const column of [5, 6]) {
      row.getCell(column).alignment = { wrapText: true, vertical: 'top' }
      if (price) row.getCell(column).numFmt = MONEY_FORMAT
    }
  })
  if (input.changes.length > 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } }
  }
}

// «Para revertir» (spec §6.10): los productos actualizados con sus valores anteriores, en formato de
// plantilla y solo con las columnas del archivo importado. Subirla es una actualización parcial más.
function writeRevert(sheet: ExcelJS.Worksheet, input: ReceiptInput) {
  const titles = templateTitles()
  sheet.columns = input.columns.map((column) => ({ width: WIDTHS[column] }))
  const notes = [
    'Sube esta hoja en Carga masiva para devolver estos productos a como estaban.',
    'Los productos creados no se borran: están en la hoja Cambios.',
    'Súbela tal cual, con «Incluyen IGV»: estos son los precios que tenía el catálogo.',
  ]
  notes.forEach((text, index) => {
    const cell = sheet.getCell(index + 1, 1)
    cell.value = text
    cell.font = {
      name: FONT,
      size: 11,
      bold: index === 0,
      color: { argb: index === 0 ? COLORS.link : COLORS.muted },
    }
  })
  const header = sheet.getRow(REVERT_HEADER_ROW)
  header.values = input.columns.map((column) => titles[column])
  styleHeaderRow(header)
  input.previous.forEach((product, index) => {
    const row = sheet.getRow(REVERT_HEADER_ROW + 1 + index)
    row.values = input.columns.map((column) => {
      switch (column) {
        case 'code':
          return product.code
        case 'name':
          return product.name
        case 'description':
          return product.description ?? ''
        case 'category':
          return product.category
        case 'price':
          return Number(product.price)
      }
    })
    styleBodyRow(row, index)
    const price = input.columns.indexOf('price')
    if (price >= 0) row.getCell(price + 1).numFmt = MONEY_FORMAT
  })
}

// Comprobante de la importación y simulación (spec §6.6 y §6.10): «Resumen», «Cambios» y, si se
// actualizó algo, «Para revertir».
export async function buildReceipt(input: ReceiptInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  workbook.created = input.generatedAt
  writeSummary(
    workbook.addWorksheet('Resumen', { properties: { tabColor: { argb: COLORS.ink } } }),
    input,
  )
  writeChanges(
    workbook.addWorksheet('Cambios', {
      properties: { tabColor: { argb: COLORS.primary } },
      views: [{ state: 'frozen', ySplit: 1 }],
    }),
    input,
  )
  if (input.kind === 'receipt' && input.previous.length > 0) {
    writeRevert(
      workbook.addWorksheet(REVERT_SHEET, {
        properties: { tabColor: { argb: COLORS.warning } },
        views: [{ state: 'frozen', ySplit: REVERT_HEADER_ROW }],
      }),
      input,
    )
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/import-files.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/excel/errors-file.ts src/features/catalog/excel/receipt.ts src/features/catalog/excel/theme.ts tests/unit/import-files.test.ts
git commit -m "feat: build the import receipt, simulation and rows-with-errors file"
```

---

### Task 7: Servicio de importación

**Files:**
- Create: `src/features/catalog/excel/import-service.ts`
- Test: `tests/integration/catalog-import-service.test.ts`

**Interfaces:**
- Consumes:
  - SQL de la tarea 1;
  - `readImportFile` (tarea 3);
  - `checkRows`, `COLUMN_LABELS`, `CheckedRow` y `matchCategory` (tarea 4);
  - `buildReceipt` (tarea 6) y `buildErrorsFile` (tarea 6), los dos con `import()` dinámico;
  - `listCategoryOptions`, `failure`, `limaDay`, `lima`, `priceColumns` y `TAX_CONFIG`, que ya existen.
- Produces:
  - `ImportAnalysis = { preview; columns: DataColumn[]; payload; errorRows: ErrorRow[]; missingTargets: string[] }`;
  - `analyzeImport(supabase, { data, fileName, options }): Promise<{ ok: true; analysis } | { ok: false; message }>`;
  - `runImport(supabase, analysis, mode, now?): Promise<ActionResult<ImportOutcome>>`;
  - `buildSimulation(analysis, now?): Promise<DownloadedFile>`;
  - `buildErrors(analysis, now?): Promise<DownloadedFile | null>`.

- [ ] **Step 1: Escribir las pruebas de integración**

`tests/integration/catalog-import-service.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  analyzeImport,
  buildErrors,
  buildSimulation,
  runImport,
} from '@/features/catalog/excel/import-service'
import { DEFAULT_IMPORT_OPTIONS } from '@/features/catalog/import/options'
import type { ImportOptions } from '@/features/catalog/import/types'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const owner = { email: 'servicio-owner@catalogo.test', password: 'servicio-clave-123' }
const HEADER = ['Código', 'Nombre', 'Descripción', 'Categoría', 'Precio con IGV (S/)']

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ ...owner, appMetadata: { catalog_access: 'owner' } })
  supabase = await signedInClient(owner.email, owner.password)
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCatalog(db)
  const { rows } = await db.query<{ id: string; name: string }>(
    "insert into public.categories (name) values ('Laptops'), ('Impresoras') returning id, name",
  )
  const id = (name: string) => rows.find((row) => row.name === name)!.id
  await db.query(
    `insert into public.products (code, name, category_id, unit_price) values
       ('LAP-001', 'Laptop uno', $1, 1000), ('LAP-002', 'Laptop dos', $1, 2000),
       ('IMP-001', 'Impresora láser', $2, 500)`,
    [id('Laptops'), id('Impresoras')],
  )
})

async function xlsx(rows: ExcelJS.CellValue[][], header = HEADER) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Productos')
  ;[header, ...rows].forEach((values, index) => {
    sheet.getRow(index + 1).values = values
  })
  return new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
}

async function analyze(data: ArrayBuffer, options: Partial<ImportOptions> = {}) {
  const result = await analyzeImport(supabase, {
    data,
    fileName: 'productos.xlsx',
    options: { ...DEFAULT_IMPORT_OPTIONS, ...options },
  })
  if (!result.ok) throw new Error(result.message)
  return result.analysis
}

const MIXED: ExcelJS.CellValue[][] = [
  ['LAP-001', 'Laptop uno', null, 'Laptops', 1100], // 2: sube un 10 %
  ['LAP-002', 'Laptop dos', null, 'Laptops', 100], // 3: baja un 95 %, para revisar
  ['IMP-001', 'Impresora láser', null, 'Impresoras', 500], // 4: sin cambios
  ['NEW-001', 'Monitor 24', null, 'Monitores', 500.5], // 5: nuevo, categoría nueva
  ['NEW-002', 'Tóner HP', null, 'Impresora', 80], // 6: casi igual a «Impresoras»
  ['NEW-003', 'Laptop gamer', null, 'Laptps', 5000], // 7: parecida a «Laptops»
  ['BAD-001', 'Malo', null, 'Laptops', 'abc'], // 8: precio con error
  ['LAP-001', 'Repetida', null, 'Laptops', 1], // 9: código repetido
  ['NEW-004', 'Laptop uno', null, 'Laptops', 900], // 10: nombre que ya existe
]

describe('analyzeImport', () => {
  it('dice qué pasará con cada fila, con avisos y categorías por decidir', async () => {
    const { preview, errorRows } = await analyze(await xlsx(MIXED))
    expect(preview.rows.map((row) => [row.line, row.status])).toEqual([
      [2, 'update'],
      [3, 'review'],
      [4, 'unchanged'],
      [5, 'create'],
      [6, 'create'],
      [7, 'create'],
      [8, 'error'],
      [9, 'error'],
      [10, 'review'],
    ])
    expect(preview.counts).toEqual({ create: 3, update: 1, unchanged: 1, review: 2, error: 2, omitted: 0 })
    expect(preview).toMatchObject({ importable: 6, updates: 2, undecided: 1, partialNotice: null })
    expect(preview.rows[0].changes).toEqual([{ field: 'price', before: '1000', after: '1100.00' }])
    expect(preview.rows[1].warnings).toEqual(['El precio baja un 95 %. ¿Es correcto?'])
    expect(preview.rows[4]).toMatchObject({ category: 'Impresoras' })
    expect(preview.rows[6].errors).toEqual([
      'Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50.',
    ])
    expect(preview.rows[7].errors).toEqual(['Código repetido: ya está en la fila 2.'])
    expect(preview.rows[8].warnings).toEqual([
      'Mismo nombre que la fila 2 (otro código).',
      'Ya existe "Laptop uno" con el código LAP-001.',
    ])
    expect(preview.choices).toEqual([
      { key: 'monitores', name: 'Monitores', kind: 'new', suggestion: null, decision: { action: 'create' }, products: 1 },
      {
        key: 'impresora',
        name: 'Impresora',
        kind: 'near',
        suggestion: 'Impresoras',
        decision: { action: 'use', target: 'Impresoras' },
        products: 1,
      },
      { key: 'laptps', name: 'Laptps', kind: 'similar', suggestion: 'Laptops', decision: null, products: 1 },
    ])
    expect(preview.bars).toEqual([
      { name: 'Laptops', products: 3, tag: null },
      { name: 'Impresoras', products: 2, tag: null },
      { name: 'Laptps', products: 1, tag: 'similar' },
      { name: 'Monitores', products: 1, tag: 'new' },
    ])
    expect(preview.prices).toEqual({ up: 1, down: 1, upAverage: 0.1, downAverage: -0.95 })
    expect(errorRows.map((row) => row.line)).toEqual([8, 9])
  })

  it('aplica la decisión de una categoría parecida', async () => {
    const { preview } = await analyze(await xlsx(MIXED), {
      categoryMap: { laptps: { action: 'use', target: 'Laptops' } },
    })
    expect(preview.undecided).toBe(0)
    expect(preview.rows[5]).toMatchObject({ line: 7, category: 'Laptops' })
    expect(preview.bars[0]).toEqual({ name: 'Laptops', products: 4, tag: null })
  })

  it('con solo Código y Precio actualiza precios; un código nuevo dice qué le falta', async () => {
    const { preview } = await analyze(
      await xlsx([['LAP-001', 1200], ['NEW-9', 10]], ['Código', 'Precio con IGV (S/)']),
    )
    expect(preview.partialNotice).toBe(
      'Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios. El resto de los datos se mantiene.',
    )
    expect(preview.rows[0]).toMatchObject({ status: 'update', name: 'Laptop uno', category: 'Laptops' })
    expect(preview.rows[1].errors).toEqual([
      'Producto nuevo: falta el nombre.',
      'Producto nuevo: falta la categoría.',
    ])
  })

  it('avisa que «Valor sin IGV» del reporte no se importa', async () => {
    const { preview } = await analyze(
      await xlsx([['LAP-001', 1000, 847.46]], ['Código', 'Precio con IGV (S/)', 'Valor sin IGV (S/)']),
    )
    expect(preview.ignoredNotice).toBe(
      'La columna «Valor sin IGV (S/)» no se importa: los precios se cambian en «Precio con IGV (S/)».',
    )
  })

  it('los modos dejan fuera filas sin marcarlas como error', async () => {
    const file = await xlsx([['LAP-001', 1200], ['NEW-9', 10]], ['Código', 'Precio'])
    const update = await analyze(file, { mode: 'update' })
    expect(update.preview.rows.map((row) => [row.status, row.errors])).toEqual([
      ['update', []],
      ['omitted', []],
    ])
    const create = await analyze(file, { mode: 'create' })
    expect(create.preview.rows.map((row) => row.status)).toEqual(['omitted', 'error'])
  })

  it('«No incluyen IGV» suma el 18 % y conserva el precio original', async () => {
    const { preview } = await analyze(await xlsx([['LAP-001', 'Laptop uno', null, 'Laptops', 1000]]), {
      pricesIncludeTax: false,
    })
    expect(preview.rows[0]).toMatchObject({
      price: '1180.00',
      priceBeforeTax: '1000.00',
      changes: [{ field: 'price', before: '1000', after: '1180.00' }],
    })
  })
})

describe('runImport', () => {
  it('importa lo decidido y deja un comprobante con «Para revertir»', async () => {
    const options = { categoryMap: { laptps: { action: 'use' as const, target: 'Laptops' } } }
    const analysis = await analyze(await xlsx(MIXED), options)
    const result = await runImport(supabase, analysis, 'all', new Date('2026-10-02T19:35:00Z'))
    expect(result).toMatchObject({
      ok: true,
      data: {
        created: 4,
        updated: 2,
        unchanged: 1,
        skipped: 0,
        errors: 2,
        categoriesCreated: ['Monitores'],
        receipt: { fileName: 'comprobante-importacion-2026-10-02-1435.xlsx' },
      },
    })
    const { rows } = await db.query<{ code: string; price: string; category: string }>(
      `select p.code, p.unit_price::text as price, c.name as category
       from public.products p join public.categories c on c.id = p.category_id order by p.code`,
    )
    expect(rows).toEqual([
      { code: 'IMP-001', price: '500', category: 'Impresoras' },
      { code: 'LAP-001', price: '1100.00', category: 'Laptops' },
      { code: 'LAP-002', price: '100.00', category: 'Laptops' },
      { code: 'NEW-001', price: '500.50', category: 'Monitores' },
      { code: 'NEW-002', price: '80.00', category: 'Impresoras' },
      { code: 'NEW-003', price: '5000.00', category: 'Laptops' },
      { code: 'NEW-004', price: '900.00', category: 'Laptops' },
    ])

    // La hoja «Para revertir» del comprobante devuelve los precios anteriores.
    if (!result.ok) throw new Error('import failed')
    const receipt = new Uint8Array(Buffer.from(result.data.receipt.base64, 'base64')).buffer
    const revert = await analyzeImport(supabase, {
      data: receipt,
      fileName: 'comprobante.xlsx',
      options: DEFAULT_IMPORT_OPTIONS,
    })
    if (!revert.ok) throw new Error(revert.message)
    expect(revert.analysis.preview.sheetName).toBe('Para revertir')
    await runImport(supabase, revert.analysis, 'all')
    const { rows: back } = await db.query<{ code: string; price: string }>(
      "select code, unit_price::text as price from public.products where code in ('LAP-001', 'LAP-002') order by code",
    )
    expect(back).toEqual([
      { code: 'LAP-001', price: '1000.00' },
      { code: 'LAP-002', price: '2000.00' },
    ])
  })

  it('no importa con categorías por decidir, con un destino borrado ni sin nada que cambiar', async () => {
    const file = await xlsx(MIXED)
    expect(await runImport(supabase, await analyze(file), 'all')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Decide 1 categoría antes de importar.' },
    })
    const gone = await analyze(file, { categoryMap: { laptps: { action: 'use', target: 'Borrada' } } })
    expect(await runImport(supabase, gone, 'all')).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: 'La categoría «Borrada» ya no existe. Vuelve a revisar el archivo.' },
    })
    const same = await analyze(await xlsx([['IMP-001', 'Impresora láser', null, 'Impresoras', 500]]))
    expect(await runImport(supabase, same, 'all')).toEqual({
      ok: false,
      error: { code: 'VALIDATION', message: 'Tu catálogo ya está al día con este archivo.' },
    })
  })
})

describe('simulación y filas con errores', () => {
  it('la simulación y el archivo de errores se arman sin guardar nada', async () => {
    const analysis = await analyze(await xlsx(MIXED))
    const now = new Date('2026-10-02T19:35:00Z')
    const simulation = await buildSimulation(analysis, now)
    expect(simulation.fileName).toBe('simulacion-importacion-2026-10-02.xlsx')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(new Uint8Array(Buffer.from(simulation.base64, 'base64')).buffer)
    expect(workbook.getWorksheet('Resumen')!.getCell('A1').value).toBe(
      'Simulación: todavía no se guardó nada',
    )
    const errors = await buildErrors(analysis, now)
    expect(errors?.fileName).toBe('filas-con-errores-2026-10-02.xlsx')
    const { rows } = await db.query<{ count: number }>('select count(*)::int as count from public.products')
    expect(rows[0].count).toBe(3)
    const clean = await analyze(await xlsx([['IMP-001', 'Impresora láser', null, 'Impresoras', 500]]))
    expect(await buildErrors(clean, now)).toBeNull()
  })
})

describe('rendimiento', () => {
  it('5 000 filas: lee, revisa e importa en pocos segundos, una llamada a la base por paso', async () => {
    const rows = Array.from({ length: 5000 }, (_, index) => [
      `P-${String(index).padStart(4, '0')}`,
      `Producto ${index}`,
      null,
      'Laptops',
      100 + index,
    ])
    const file = await xlsx(rows)
    const started = performance.now()
    const analysis = await analyze(file)
    expect(analysis.preview.counts.create).toBe(5000)
    expect(await runImport(supabase, analysis, 'all')).toMatchObject({
      ok: true,
      data: { created: 5000 },
    })
    // Holgado para no fallar en un equipo lento (la spec §10 espera menos de 3 s por paso); un
    // recorrido fila por fila tardaría minutos.
    expect(performance.now() - started).toBeLessThan(15_000)
  }, 60_000)
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project integration tests/integration/catalog-import-service.test.ts`
Expected: FAIL. No existe `@/features/catalog/excel/import-service`.

- [ ] **Step 3: Implementar el servicio**

`src/features/catalog/excel/import-service.ts`:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { z } from 'zod'
import { TAX_CONFIG } from '@/features/proforma/tax'
import type { ActionResult } from '@/lib/action-result'
import { lima } from '@/lib/dates'
import type { Database, Json } from '@/lib/supabase/database.types'
import { failure } from '../action-errors'
import { listCategoryOptions } from '../categories/queries'
import { categoryKey, PRICE_CHANGE_WARNING } from '../import/options'
import {
  DATA_COLUMNS,
  type CategoryBar,
  type CategoryChoice,
  type CategoryDecision,
  type DataColumn,
  type DownloadedFile,
  type FieldChange,
  type ImportColumn,
  type ImportMode,
  type ImportOptions,
  type ImportOutcome,
  type ImportPreview,
  type PreviewCounts,
  type PreviewRow,
  type PriceTrend,
  type RowAction,
  type RowStatus,
} from '../import/types'
import { limaDay } from '../list-options'
import { priceColumns } from '../price-columns'
import type { ErrorRow } from './errors-file'
import { readImportFile } from './read'
import type { ReceiptChange } from './receipt'
import { matchCategory } from './similar'
import { checkRows, COLUMN_LABELS, type CheckedRow } from './validate'

type Client = SupabaseClient<Database>

// Lo que se envía a la base por fila: el código y las columnas presentes, ya validadas.
type PayloadRow = {
  line: number
  code: string
  name?: string
  description?: string | null
  category?: string
  price?: string
}

export type ImportAnalysis = {
  preview: ImportPreview
  columns: DataColumn[]
  // Filas que van a import_products: todas menos las de errores y las omitidas.
  payload: PayloadRow[]
  errorRows: ErrorRow[]
  // Categorías elegidas como destino que ya no existen (alguien las borró).
  missingTargets: string[]
}

export type AnalyzeResult = { ok: true; analysis: ImportAnalysis } | { ok: false; message: string }

const planSchema = z.array(
  z.object({
    line: z.number().int(),
    exists: z.boolean(),
    category_exists: z.boolean(),
    current_name: z.string().nullable(),
    current_description: z.string().nullable(),
    current_category: z.string().nullable(),
    current_price: z.string().nullable(),
    name_changed: z.boolean(),
    description_changed: z.boolean(),
    category_changed: z.boolean(),
    price_changed: z.boolean(),
    name_taken_by: z.string().nullable(),
  }),
)
type PlanRow = z.infer<typeof planSchema>[number]

const importResultSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  skipped: z.number().int(),
  categories_created: z.array(z.string()),
  changes: z.array(
    z.object({
      code: z.string(),
      product: z.string(),
      action: z.enum(['created', 'updated']),
      field: z.enum(['name', 'description', 'category', 'price']).nullable(),
      before: z.string().nullable(),
      after: z.string().nullable(),
    }),
  ),
  previous: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      category: z.string(),
      price: z.string(),
    }),
  ),
})

const NEW_PRODUCT_MISSING = {
  name: 'Producto nuevo: falta el nombre.',
  category: 'Producto nuevo: falta la categoría.',
  price: 'Producto nuevo: falta el precio.',
} as const

const UPDATED_LABELS: Record<DataColumn, string> = {
  name: 'los nombres',
  description: 'las descripciones',
  category: 'las categorías',
  price: 'los precios',
}

const listText = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`

const columnTitle = (column: ImportColumn) =>
  column === 'price' ? priceColumns().catalog.replace(/\s*\(S\/\)$/, '') : COLUMN_LABELS[column]

// «Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios…» (spec §6.6).
function partialNotice(columns: ImportColumn[]) {
  const present = DATA_COLUMNS.filter((column) => columns.includes(column))
  if (present.length === DATA_COLUMNS.length) return null
  return `Tu archivo trae ${listText(columns.map(columnTitle))}: solo se actualizarán ${listText(
    present.map((column) => UPDATED_LABELS[column]),
  )}. El resto de los datos se mantiene.`
}

// El reporte trae «Valor sin IGV (S/)» junto al precio: si alguien lo cambió pensando que se
// importa, se entera antes (revisión 2 del plan).
const ignoredNotice = (derived: string | null) =>
  derived
    ? `La columna «${derived}» no se importa: los precios se cambian en «${priceColumns().catalog}».`
    : null

function payloadRow(row: CheckedRow, withValues: boolean): PayloadRow {
  if (!withValues) return { line: row.line, code: row.code }
  return {
    line: row.line,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
  }
}

type Resolution = {
  choices: Map<string, CategoryChoice>
  fileKeys: Map<number, string>
  missingTargets: string[]
}

// Categorías del archivo frente a las existentes, con las decisiones de la persona (spec §6.8).
// Cambia la categoría de cada fila por la que se usará: la existente elegida o la nueva tal cual.
function resolveCategories(
  rows: CheckedRow[],
  existing: string[],
  decisions: Record<string, CategoryDecision>,
): Resolution {
  const choices = new Map<string, CategoryChoice>()
  const resolved = new Map<string, string>()
  const fileKeys = new Map<number, string>()
  const missingTargets: string[] = []
  const findExisting = (name: string) =>
    existing.find((candidate) => categoryKey(candidate) === categoryKey(name))
  for (const row of rows) {
    if (row.category === undefined) continue
    const key = categoryKey(row.category)
    fileKeys.set(row.line, key)
    if (!resolved.has(key)) {
      const match = matchCategory(row.category, existing)
      if (match.kind === 'existing') resolved.set(key, match.target)
      else {
        // Solo las decisiones enviadas: una categoría llamada «constructor» no lee el prototipo.
        const asked = Object.hasOwn(decisions, key) ? decisions[key] : undefined
        const target = asked?.action === 'use' ? findExisting(asked.target) : undefined
        if (asked?.action === 'use' && !target) missingTargets.push(asked.target)
        let decision: CategoryDecision | null = null
        if (target) decision = { action: 'use', target }
        else if (asked?.action === 'create' || match.kind === 'new') decision = { action: 'create' }
        else if (match.kind === 'near') decision = { action: 'use', target: match.target }
        resolved.set(key, decision?.action === 'use' ? decision.target : row.category)
        choices.set(key, {
          key,
          name: row.category,
          kind: match.kind,
          suggestion: match.kind === 'new' ? null : match.target,
          decision,
          products: 0,
        })
      }
    }
    row.category = resolved.get(key)
  }
  return { choices, fileKeys, missingTargets }
}

function fieldChanges(row: CheckedRow, found: PlanRow): FieldChange[] {
  const changes: FieldChange[] = []
  if (found.name_changed) changes.push({ field: 'name', before: found.current_name, after: row.name ?? null })
  if (found.description_changed) {
    changes.push({ field: 'description', before: found.current_description, after: row.description ?? null })
  }
  if (found.category_changed) {
    changes.push({ field: 'category', before: found.current_category, after: row.category ?? null })
  }
  if (found.price_changed) changes.push({ field: 'price', before: found.current_price, after: row.price ?? null })
  return changes
}

// Avisos «Para revisar» (spec §9.4): se importan igual, pero conviene mirarlos.
function rowWarnings(
  row: CheckedRow,
  found: PlanRow,
  action: 'create' | 'update',
  firstByName: Map<string, { line: number; code: string }>,
) {
  const warnings: string[] = []
  if (action === 'update' && found.price_changed && row.price && found.current_price) {
    const before = Number(found.current_price)
    const ratio = before > 0 ? (Number(row.price) - before) / before : 0
    if (Math.abs(ratio) >= PRICE_CHANGE_WARNING) {
      const percent = Math.round(Math.abs(ratio) * 100)
      warnings.push(
        ratio > 0
          ? `El precio sube un ${percent} %. ¿Es correcto?`
          : `El precio baja un ${percent} %. ¿Es correcto?`,
      )
    }
  }
  if (row.name) {
    const first = firstByName.get(row.name.toLowerCase())
    if (first && first.line !== row.line && first.code !== row.code) {
      warnings.push(`Mismo nombre que la fila ${first.line} (otro código).`)
    }
    if (found.name_taken_by && (action === 'create' || found.name_changed)) {
      warnings.push(`Ya existe "${row.name}" con el código ${found.name_taken_by}.`)
    }
  }
  return warnings
}

// Estado de cada fila (spec §6.6): cuenta en una sola tarjeta, por este orden: con errores, omitida
// por el modo, para revisar y luego nuevo, se actualiza o sin cambios.
function describeRows(
  rows: CheckedRow[],
  plan: Map<number, PlanRow>,
  columns: ImportColumn[],
  mode: ImportMode,
): PreviewRow[] {
  const firstByName = new Map<string, { line: number; code: string }>()
  for (const row of rows) {
    const key = row.name?.toLowerCase()
    if (key && !firstByName.has(key)) firstByName.set(key, { line: row.line, code: row.code })
  }
  return rows.map((row) => {
    const found = row.codeOk ? plan.get(row.line) : undefined
    if (row.codeOk && !found) throw new Error(`La base no devolvió la fila ${row.line}.`)
    const errors = [...row.errors]
    let status: RowStatus = 'error'
    let action: RowAction | null = null
    let warnings: string[] = []
    if (found && (found.exists ? mode === 'create' : mode === 'update')) status = 'omitted'
    else if (found) {
      if (!found.exists) {
        for (const column of ['name', 'category', 'price'] as const) {
          if (!columns.includes(column)) errors.push(NEW_PRODUCT_MISSING[column])
        }
      }
      if (errors.length === 0) {
        const changed =
          found.name_changed || found.description_changed || found.category_changed || found.price_changed
        action = !found.exists ? 'create' : changed ? 'update' : 'unchanged'
        warnings = action === 'unchanged' ? [] : rowWarnings(row, found, action, firstByName)
        status = warnings.length > 0 ? 'review' : action
      }
    }
    return {
      line: row.line,
      status,
      action,
      code: row.code,
      name: row.name ?? found?.current_name ?? null,
      category: row.category ?? found?.current_category ?? null,
      price: row.price ?? found?.current_price ?? null,
      priceBeforeTax: row.priceBeforeTax ?? null,
      changes: action === 'update' && found ? fieldChanges(row, found) : [],
      warnings,
      errors: status === 'error' ? errors : [],
    }
  })
}

function countRows(rows: PreviewRow[]): PreviewCounts {
  const counts: PreviewCounts = { create: 0, update: 0, unchanged: 0, review: 0, error: 0, omitted: 0 }
  for (const row of rows) counts[row.status] += 1
  return counts
}

function priceTrend(rows: PreviewRow[]): PriceTrend {
  const ups: number[] = []
  const downs: number[] = []
  for (const row of rows) {
    for (const change of row.changes) {
      if (change.field !== 'price' || !change.before || !change.after) continue
      const before = Number(change.before)
      if (before <= 0) continue
      const ratio = (Number(change.after) - before) / before
      if (ratio > 0) ups.push(ratio)
      else if (ratio < 0) downs.push(ratio)
    }
  }
  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  return { up: ups.length, down: downs.length, upAverage: average(ups), downAverage: average(downs) }
}

const importable = (row: PreviewRow) => row.status !== 'error' && row.status !== 'omitted'

function categoryBars(rows: PreviewRow[], choices: CategoryChoice[], existing: string[]): CategoryBar[] {
  const existingKeys = new Set(existing.map(categoryKey))
  const undecided = new Set(
    choices.filter((choice) => choice.decision === null).map((choice) => choice.key),
  )
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.category && importable(row)) totals.set(row.category, (totals.get(row.category) ?? 0) + 1)
  }
  const bars: CategoryBar[] = []
  for (const [name, products] of totals) {
    const key = categoryKey(name)
    const tag = undecided.has(key) ? 'similar' : existingKeys.has(key) ? null : 'new'
    bars.push({ name, products, tag })
  }
  return bars.sort((a, b) => b.products - a.products || a.name.localeCompare(b.name, 'es'))
}

// Lee el archivo, lo valida con las reglas del formulario, compara las categorías y pide a la base el
// plan de cada fila (spec §6.6). No guarda nada: lo usan la vista previa, la simulación, el archivo
// de errores y la importación, que lo vuelve a calcular todo (spec §6.9).
export async function analyzeImport(
  supabase: Client,
  input: { data: ArrayBuffer; fileName: string; options: ImportOptions },
): Promise<AnalyzeResult> {
  const read = await readImportFile(input.data, input.fileName)
  if (!read.ok) return read
  const { sheet } = read
  const columns = DATA_COLUMNS.filter((column) => sheet.columns.includes(column))
  const checked = checkRows(sheet.rows, sheet.columns, {
    pricesIncludeTax: input.options.pricesIncludeTax,
    ratePercent: TAX_CONFIG.ratePercent,
  })
  const existing = (await listCategoryOptions(supabase)).map((category) => category.name)
  const { choices, fileKeys, missingTargets } = resolveCategories(
    checked,
    existing,
    input.options.categoryMap,
  )

  // Las filas con errores solo envían el código: hace falta saber si existe por el modo.
  const lookup = checked
    .filter((row) => row.codeOk)
    .map((row) => payloadRow(row, row.errors.length === 0))
  const { data, error } = await supabase.rpc('preview_product_import', {
    rows: lookup as unknown as Json,
    columns,
  })
  if (error) throw error
  const plan = new Map(planSchema.parse(data).map((row) => [row.line, row]))
  const rows = describeRows(checked, plan, sheet.columns, input.options.mode)

  for (const row of rows) {
    const key = fileKeys.get(row.line)
    const choice = key === undefined ? undefined : choices.get(key)
    if (choice && importable(row)) choice.products += 1
  }
  // Una categoría que solo aparece en filas con errores u omitidas no pide decisión.
  const used = [...choices.values()].filter((choice) => choice.products > 0)
  const counts = countRows(rows)
  const preview: ImportPreview = {
    fileName: input.fileName,
    sheetName: sheet.sheetName,
    columns: sheet.columns,
    partialNotice: partialNotice(sheet.columns),
    ignoredNotice: ignoredNotice(sheet.derivedPrice),
    rows,
    counts,
    prices: priceTrend(rows),
    choices: used,
    bars: categoryBars(rows, used, existing),
    undecided: used.filter((choice) => choice.decision === null).length,
    importable: counts.create + counts.update + counts.review,
    updates: rows.filter((row) => row.action === 'update').length,
  }

  const byLine = new Map(checked.map((row) => [row.line, row]))
  const cells = new Map(sheet.rows.map((row) => [row.line, row.cells]))
  return {
    ok: true,
    analysis: {
      preview,
      columns,
      payload: rows.filter(importable).map((row) => payloadRow(byLine.get(row.line)!, true)),
      errorRows: rows
        .filter((row) => row.status === 'error')
        .map((row) => ({ line: row.line, cells: cells.get(row.line) ?? {}, errors: row.errors })),
      missingTargets,
    },
  }
}

// Importa en una sola transacción lo que mostró la vista previa (spec §6.9) y arma el comprobante.
export async function runImport(
  supabase: Client,
  analysis: ImportAnalysis,
  mode: ImportMode,
  now = new Date(),
): Promise<ActionResult<ImportOutcome>> {
  const { preview } = analysis
  if (analysis.missingTargets.length > 0) {
    return failure(
      'CONFLICT',
      `La categoría «${analysis.missingTargets[0]}» ya no existe. Vuelve a revisar el archivo.`,
    )
  }
  if (preview.undecided > 0) {
    return failure(
      'VALIDATION',
      preview.undecided === 1
        ? 'Decide 1 categoría antes de importar.'
        : `Decide ${preview.undecided} categorías antes de importar.`,
    )
  }
  if (preview.importable === 0) {
    return failure(
      'VALIDATION',
      preview.counts.unchanged > 0
        ? 'Tu catálogo ya está al día con este archivo.'
        : 'No hay filas para importar.',
    )
  }
  const { data, error } = await supabase.rpc('import_products', {
    rows: analysis.payload as unknown as Json,
    columns: analysis.columns,
    mode,
  })
  if (error?.code === '23505') {
    return failure(
      'CONFLICT',
      'Otro cambio en el catálogo chocó con este archivo. No se importó nada: vuelve a revisarlo.',
    )
  }
  if (error) throw error
  const result = importResultSchema.parse(data)
  const skipped = result.skipped + preview.counts.omitted
  const { buildReceipt } = await import('./receipt')
  const receipt = await buildReceipt({
    kind: 'receipt',
    fileName: preview.fileName,
    generatedAt: now,
    counts: {
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped,
      errors: preview.counts.error,
    },
    categoriesCreated: result.categories_created,
    changes: result.changes,
    previous: result.previous,
    columns: preview.columns,
  })
  return {
    ok: true,
    data: {
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped,
      errors: preview.counts.error,
      categoriesCreated: result.categories_created,
      receipt: {
        base64: receipt.toString('base64'),
        fileName: `comprobante-importacion-${limaDay(now)}-${format(now, 'HHmm', { in: lima })}.xlsx`,
      },
    },
  }
}

// «Descargar simulación» (spec §6.6): el comprobante de lo que pasaría, sin guardar nada.
export async function buildSimulation(analysis: ImportAnalysis, now = new Date()): Promise<DownloadedFile> {
  const { preview } = analysis
  const changes: ReceiptChange[] = []
  for (const row of preview.rows) {
    const product = row.name ?? row.code
    if (row.action === 'create') {
      changes.push({ code: row.code, product, action: 'created', field: null, before: null, after: null })
    }
    if (row.action === 'update') {
      for (const change of row.changes) {
        changes.push({ code: row.code, product, action: 'updated', ...change })
      }
    }
  }
  changes.sort((a, b) => a.code.localeCompare(b.code))
  const { buildReceipt } = await import('./receipt')
  const buffer = await buildReceipt({
    kind: 'simulation',
    fileName: preview.fileName,
    generatedAt: now,
    counts: {
      created: preview.rows.filter((row) => row.action === 'create').length,
      updated: preview.updates,
      unchanged: preview.counts.unchanged,
      skipped: preview.counts.omitted,
      errors: preview.counts.error,
    },
    categoriesCreated: preview.bars.filter((bar) => bar.tag === 'new').map((bar) => bar.name),
    changes,
    previous: [],
    columns: preview.columns,
  })
  return { base64: buffer.toString('base64'), fileName: `simulacion-importacion-${limaDay(now)}.xlsx` }
}

// «Descargar filas con errores» (spec §6.6): null si no hay ninguna.
export async function buildErrors(analysis: ImportAnalysis, now = new Date()): Promise<DownloadedFile | null> {
  if (analysis.errorRows.length === 0) return null
  const { buildErrorsFile } = await import('./errors-file')
  const buffer = await buildErrorsFile(analysis.errorRows, analysis.preview.columns)
  return { base64: buffer.toString('base64'), fileName: `filas-con-errores-${limaDay(now)}.xlsx` }
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project integration tests/integration/catalog-import-service.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/excel/import-service.ts tests/integration/catalog-import-service.test.ts
git commit -m "feat: analyze and import an Excel of products with warnings and category decisions"
```

---

### Task 8: Acciones del servidor y configuración

**Files:**
- Create: `src/features/catalog/excel/import-request.ts`
- Modify: `src/features/catalog/products/excel-actions.ts`, `next.config.ts`
- Test: `tests/unit/import-request.test.ts`

**Interfaces:**
- Consumes:
  - `analyzeImport`, `runImport`, `buildSimulation` y `buildErrors` (tarea 7), con `import()` dinámico;
  - `buildTemplate` (tarea 5), también con `import()` dinámico;
  - `importOptionsSchema` y `FILE_MESSAGES` (tarea 2);
  - `withOwner`, `failure` y `listCategoryOptions`, que ya existen.
- Produces:
  - `readImportRequest(formData): { ok: true; file: File; options } | { ok: false; message }`;
  - Server Actions:
    - `downloadImportTemplate(): Promise<ActionResult<DownloadedFile>>`;
    - `previewProductImport(formData): Promise<ActionResult<ImportPreview>>`;
    - `importProducts(formData): Promise<ActionResult<ImportOutcome>>`;
    - `downloadImportSimulation(formData): Promise<ActionResult<DownloadedFile>>`;
    - `downloadImportErrors(formData): Promise<ActionResult<DownloadedFile>>`.
  - El `FormData` lleva `file` (el `.xlsx`) y `options` (JSON de `ImportOptions`).

- [ ] **Step 1: Escribir la prueba**

`tests/unit/import-request.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readImportRequest } from '@/features/catalog/excel/import-request'
import {
  DEFAULT_IMPORT_OPTIONS,
  FILE_MESSAGES,
  IMPORT_MAX_BYTES,
} from '@/features/catalog/import/options'

function form(file: File | null, options: unknown = DEFAULT_IMPORT_OPTIONS) {
  const data = new FormData()
  if (file) data.set('file', file)
  data.set('options', typeof options === 'string' ? options : JSON.stringify(options))
  return data
}

describe('readImportRequest', () => {
  it('devuelve el archivo y las opciones validadas', () => {
    const file = new File(['x'], 'productos.xlsx')
    const request = readImportRequest(form(file, { ...DEFAULT_IMPORT_OPTIONS, mode: 'update' }))
    expect(request).toMatchObject({ ok: true, options: { mode: 'update', pricesIncludeTax: true } })
  })

  it('sin archivo o con más de 4 MB, con el mensaje de la spec', () => {
    expect(readImportRequest(form(null))).toEqual({ ok: false, message: FILE_MESSAGES.notXlsx })
    const big = new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], 'productos.xlsx')
    expect(readImportRequest(form(big))).toEqual({ ok: false, message: FILE_MESSAGES.tooBig })
  })

  it('rechaza opciones que no valen', () => {
    const file = new File(['x'], 'productos.xlsx')
    const message =
      'Las opciones de la importación no son válidas. Recarga la página e inténtalo de nuevo.'
    expect(readImportRequest(form(file, '{no es json'))).toEqual({ ok: false, message })
    expect(readImportRequest(form(file, { ...DEFAULT_IMPORT_OPTIONS, mode: 'delete' }))).toEqual({
      ok: false,
      message,
    })
  })
})
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `pnpm exec vitest run --project unit tests/unit/import-request.test.ts`
Expected: FAIL. No existe `@/features/catalog/excel/import-request`.

- [ ] **Step 3: Implementar la lectura de la petición, las acciones y la configuración**

`src/features/catalog/excel/import-request.ts`:

```ts
import 'server-only'
import { FILE_MESSAGES, IMPORT_MAX_BYTES, importOptionsSchema } from '../import/options'
import type { ImportOptions } from '../import/types'

export type ImportRequest =
  | { ok: true; file: File; options: ImportOptions }
  | { ok: false; message: string }

// El archivo y las opciones del FormData, validados otra vez en el servidor (spec §6.5 y §9.2).
export function readImportRequest(formData: FormData): ImportRequest {
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, message: FILE_MESSAGES.notXlsx }
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, message: FILE_MESSAGES.tooBig }
  let options: unknown = null
  try {
    options = JSON.parse(String(formData.get('options') ?? ''))
  } catch {
    options = null
  }
  const parsed = importOptionsSchema.safeParse(options)
  if (!parsed.success) {
    return {
      ok: false,
      message:
        'Las opciones de la importación no son válidas. Recarga la página e inténtalo de nuevo.',
    }
  }
  return { ok: true, file, options: parsed.data }
}
```

En `src/features/catalog/products/excel-actions.ts`, añade estos imports a los que ya tiene:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { listCategoryOptions } from '../categories/queries'
import { readImportRequest } from '../excel/import-request'
import type { DownloadedFile, ImportOutcome, ImportPreview } from '../import/types'
```

Y añade al final del archivo:

```ts
// Plantilla de la carga masiva (spec §8), con las categorías actuales en su desplegable.
export async function downloadImportTemplate(): Promise<ActionResult<DownloadedFile>> {
  return withOwner(async ({ supabase }) => {
    const categories = await listCategoryOptions(supabase)
    const { buildTemplate } = await import('../excel/template')
    const buffer = await buildTemplate(categories.map((category) => category.name))
    return {
      ok: true,
      data: { base64: buffer.toString('base64'), fileName: 'plantilla-carga-masiva.xlsx' },
    }
  })
}

// Cada acción de la carga masiva vuelve a leer y validar el archivo: nunca se confía en el
// navegador (spec §3). ExcelJS se carga solo aquí.
async function analyzeRequest(supabase: SupabaseClient<Database>, formData: FormData) {
  const request = readImportRequest(formData)
  if (!request.ok) return { ok: false as const, failure: failure('VALIDATION', request.message) }
  const { analyzeImport } = await import('../excel/import-service')
  const result = await analyzeImport(supabase, {
    data: await request.file.arrayBuffer(),
    fileName: request.file.name,
    options: request.options,
  })
  if (!result.ok) return { ok: false as const, failure: failure('VALIDATION', result.message) }
  return { ok: true as const, analysis: result.analysis, options: request.options }
}

export async function previewProductImport(
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  return withOwner(async ({ supabase }) => {
    const result = await analyzeRequest(supabase, formData)
    return result.ok ? { ok: true, data: result.analysis.preview } : result.failure
  })
}

export async function importProducts(formData: FormData): Promise<ActionResult<ImportOutcome>> {
  return withOwner(async ({ supabase }) => {
    const result = await analyzeRequest(supabase, formData)
    if (!result.ok) return result.failure
    const { runImport } = await import('../excel/import-service')
    return runImport(supabase, result.analysis, result.options.mode)
  })
}

export async function downloadImportSimulation(
  formData: FormData,
): Promise<ActionResult<DownloadedFile>> {
  return withOwner(async ({ supabase }) => {
    const result = await analyzeRequest(supabase, formData)
    if (!result.ok) return result.failure
    const { buildSimulation } = await import('../excel/import-service')
    return { ok: true, data: await buildSimulation(result.analysis) }
  })
}

export async function downloadImportErrors(
  formData: FormData,
): Promise<ActionResult<DownloadedFile>> {
  return withOwner(async ({ supabase }) => {
    const result = await analyzeRequest(supabase, formData)
    if (!result.ok) return result.failure
    const { buildErrors } = await import('../excel/import-service')
    const file = await buildErrors(result.analysis)
    return file
      ? { ok: true, data: file }
      : failure('VALIDATION', 'Este archivo no tiene filas con errores.')
  })
}
```

En `next.config.ts`, añade el límite de la petición y el logotipo de la nueva ruta:

```ts
  experimental: {
    // La carga masiva sube un Excel de hasta 4 MB, más lo que añade el FormData; Vercel admite
    // hasta 4,5 MB por petición (spec del Excel §3 y §10).
    serverActions: { bodySizeLimit: '4.5mb' },
  },
```

```ts
    // «Descargar mi catálogo» de la carga masiva es el reporte completo, con su logotipo.
    '/products/import': ['./public/brand/ventronix-logo-proforma.jpg'],
```

La segunda va dentro de `outputFileTracingIncludes`, junto a `'/products'`.

- [ ] **Step 4: Ejecutar la prueba, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/import-request.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/excel/import-request.ts src/features/catalog/products/excel-actions.ts next.config.ts tests/unit/import-request.test.ts
git commit -m "feat: expose the bulk import as server actions with a 4 MB upload limit"
```

---

### Task 9: Pantalla de la carga masiva: ruta, cabecera, intenciones y accesos

**Files:**
- Create:
  - `src/app/(private)/products/import/page.tsx`
  - `src/features/catalog/import/components/import-intro.tsx`
  - `src/features/catalog/import/components/import-screen.tsx`
- Modify:
  - `src/features/catalog/components/catalog-screen.tsx`
  - `src/features/catalog/products/components/product-list.tsx`
- Test: `tests/components/import-intro.test.tsx`

**Interfaces:**
- Consumes: `getCatalogStats` (fase 1); `createClient` de `@/lib/supabase/server`.
- Produces:
  - `Intent = 'create' | 'update'`;
  - componentes `ImportHeader()`, `IntentCards({ value, onChange })` e `ImportFaq()`;
  - `ImportScreen({ hasProducts })`, en una primera versión que crece en las tareas 10 a 13.

- [ ] **Step 1: Escribir la prueba**

`tests/components/import-intro.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ImportScreen } from '@/features/catalog/import/components/import-screen'

function renderScreen(hasProducts: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ImportScreen hasProducts={hasProducts} />
    </QueryClientProvider>,
  )
}

describe('ImportScreen: entrada', () => {
  it('con el catálogo vacío propone cargar productos nuevos', () => {
    renderScreen(false)
    expect(screen.getByRole('heading', { level: 1, name: 'Carga masiva de productos' })).toBeVisible()
    expect(screen.getByRole('radio', { name: /Cargar productos nuevos/ })).toBeChecked()
    expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute('href', '/products')
  })

  it('con productos propone actualizarlos, y se puede cambiar', async () => {
    renderScreen(true)
    const update = screen.getByRole('radio', { name: /Actualizar precios o datos/ })
    expect(update).toBeChecked()
    await userEvent.setup().click(screen.getByRole('radio', { name: /Cargar productos nuevos/ }))
    expect(update).not.toBeChecked()
  })

  it('responde las preguntas frecuentes', () => {
    renderScreen(true)
    expect(screen.getByText('¿Se borran los productos que no estén en el archivo?')).toBeVisible()
    expect(screen.getAllByRole('group').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `pnpm exec vitest run --project components tests/components/import-intro.test.tsx`
Expected: FAIL. No existe `import-screen`.

- [ ] **Step 3: Implementar la ruta, la cabecera y los accesos**

`src/app/(private)/products/import/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { ImportScreen } from '@/features/catalog/import/components/import-screen'
import { getCatalogStats } from '@/features/catalog/products/queries'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Carga masiva' }

// Revisar e importar 5 000 filas tarda segundos; el margen cubre una base lenta.
export const maxDuration = 60

export default async function ImportPage() {
  const supabase = await createClient()
  // Con el catálogo vacío se propone cargar productos nuevos; si no, actualizarlos (spec §6.2).
  const hasProducts = await getCatalogStats(supabase)
    .then((stats) => stats.products > 0)
    .catch(() => true)
  return <ImportScreen hasProducts={hasProducts} />
}
```

`src/features/catalog/import/components/import-intro.tsx`:

```tsx
'use client'

import { ArrowLeft, ChevronDown, ChevronRight, CircleCheck, RefreshCw, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Intent = 'create' | 'update'

// Hoja de cálculo con los colores de la marca: el elemento memorable de la pantalla (spec §6.11).
function SheetIllustration({ className }: { className?: string }) {
  const rows = [0, 1, 2, 3]
  return (
    <svg viewBox="0 0 260 180" aria-hidden className={cn('w-full', className)}>
      <rect x="18" y="14" width="214" height="146" rx="14" fill="#ffffff" stroke="#e3e7de" />
      <path d="M18 28a14 14 0 0 1 14-14h186a14 14 0 0 1 14 14v18H18z" fill="#121511" />
      {[30, 86, 142, 190].map((x, index) => (
        <rect key={x} x={x} y="26" width={index === 3 ? 30 : 40} height="8" rx="4" fill={index === 3 ? '#72ce0b' : '#5d6559'} />
      ))}
      {rows.map((row) => (
        <g key={row}>
          <line x1="18" x2="232" y1={70 + row * 24} y2={70 + row * 24} stroke="#e3e7de" />
          <rect x="30" y={53 + row * 24} width="44" height="8" rx="4" fill="#d7dccf" />
          <rect x="86" y={53 + row * 24} width={row % 2 ? 36 : 48} height="8" rx="4" fill="#e3e7de" />
          <rect x="142" y={53 + row * 24} width="38" height="8" rx="4" fill={row === 1 ? '#c8ec9e' : '#e3e7de'} />
          <rect x="190" y={53 + row * 24} width="30" height="8" rx="4" fill="#e3e7de" />
        </g>
      ))}
      <circle cx="222" cy="150" r="22" fill="#72ce0b" />
      <path d="M211 150l8 8 14-15" fill="none" stroke="#0c0f0a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Cabecera con migas, título y la ilustración (spec §6.1 y §6.2).
export function ImportHeader() {
  return (
    <header className="grid gap-4">
      <nav aria-label="Migas de pan" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link href="/products" prefetch className="font-semibold hover:text-foreground hover:underline">
          Productos
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page" className="text-foreground">
          Carga masiva
        </span>
      </nav>
      <div className="grid items-center gap-6 overflow-hidden rounded-[18px] border bg-[linear-gradient(115deg,#eef7e2_0%,#f8fcf3_45%,#ffffff_100%)] p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="grid justify-items-start gap-3">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
            Carga masiva de productos
          </h1>
          <p className="max-w-[60ch] text-[15px] text-muted-foreground">
            Crea y actualiza muchos productos a la vez con un Excel. Antes de guardar te mostramos qué
            va a pasar con cada fila.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/products" prefetch>
              <ArrowLeft aria-hidden />
              Volver a Productos
            </Link>
          </Button>
        </div>
        <SheetIllustration className="max-lg:hidden" />
      </div>
    </header>
  )
}

const INTENTS = [
  {
    value: 'create',
    title: 'Cargar productos nuevos',
    text: 'Empieza con la plantilla: trae tus categorías y te guía columna por columna.',
    icon: Sparkles,
  },
  {
    value: 'update',
    title: 'Actualizar precios o datos',
    text: 'Descarga tu catálogo, cambia lo que necesites (puede ser solo el precio) y súbelo.',
    icon: RefreshCw,
  },
] as const

// «¿Qué quieres hacer?» (spec §6.2): radios nativos con aspecto de tarjeta, accesibles con flechas.
export function IntentCards({ value, onChange }: { value: Intent; onChange: (intent: Intent) => void }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 text-lg font-bold">¿Qué quieres hacer?</legend>
      <div className="grid gap-3 md:grid-cols-2">
        {INTENTS.map((intent) => {
          const Icon = intent.icon
          const selected = value === intent.value
          return (
            <label
              key={intent.value}
              className={cn(
                'relative grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-4 rounded-[14px] border-2 bg-card p-5 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                selected ? 'border-ring' : 'border-border hover:border-ring/50',
              )}
            >
              <input
                type="radio"
                name="import-intent"
                value={intent.value}
                checked={selected}
                onChange={() => onChange(intent.value)}
                className="sr-only"
              />
              <span
                className={cn(
                  'grid size-11 place-items-center rounded-xl',
                  selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-secondary-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="grid gap-1 pr-7">
                <span className="font-bold">{intent.title}</span>
                <span className="text-sm text-muted-foreground">{intent.text}</span>
              </span>
              {selected ? (
                <CircleCheck className="absolute top-4 right-4 size-5 text-ring" aria-hidden />
              ) : null}
            </label>
          )
        })}
      </div>
    </fieldset>
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
            <p className="pb-4 text-sm text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
```

`src/features/catalog/import/components/import-screen.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ImportFaq, ImportHeader, IntentCards, type Intent } from './import-intro'

// Carga masiva (spec del Excel §6). Esta versión trae la cabecera, la intención y las preguntas; los
// pasos, la vista previa y el resultado llegan en las tareas siguientes.
export function ImportScreen({ hasProducts }: { hasProducts: boolean }) {
  const [intent, setIntent] = useState<Intent>(hasProducts ? 'update' : 'create')
  return (
    <div className="grid max-w-[1200px] gap-8">
      <ImportHeader />
      <IntentCards value={intent} onChange={setIntent} />
      <ImportFaq />
    </div>
  )
}
```

En `src/features/catalog/components/catalog-screen.tsx`:
- Importa `Link` de `next/link` y añade `FileSpreadsheet` al import de `lucide-react`.
- Sustituye el botón «Nuevo producto» de la cabecera por este grupo:

```tsx
          <div className="flex flex-wrap gap-2">
            {/* Muchos productos a la vez, desde Excel (spec del Excel §6.1). */}
            <Button asChild variant="outline">
              <Link href="/products/import" prefetch>
                <FileSpreadsheet aria-hidden />
                Carga masiva
              </Link>
            </Button>
            <Button onClick={() => setProductDialog({ mode: 'create' })}>
              <Plus aria-hidden />
              Nuevo producto
            </Button>
          </div>
```

En `src/features/catalog/products/components/product-list.tsx`:
- Importa `Link` de `next/link`.
- En el estado vacío «Tu catálogo empieza aquí», sustituye la acción por:

```tsx
          action={
            <div className="grid justify-items-center gap-3">
              <Button onClick={onCreate}>
                <Plus aria-hidden />
                Crear un producto
              </Button>
              {/* Justo cuando más sirve (spec del Excel §6.1). */}
              <Link
                href="/products/import"
                prefetch
                className="text-sm font-semibold text-[#3f7d0a] underline-offset-4 hover:underline"
              >
                o súbelos todos desde Excel
              </Link>
            </div>
          }
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos, el lint y la altura en laptop**

Run:
- `pnpm exec vitest run --project components`
- `pnpm typecheck && pnpm lint`
- `pnpm exec playwright test tests/e2e/catalog.spec.ts --project desktop -g "al menos 6 productos|catálogo vacío"`

Expected: PASS en todo. El botón nuevo va en la fila del título, sin añadir altura.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(private)/products/import/page.tsx" src/features/catalog/import/components/import-intro.tsx src/features/catalog/import/components/import-screen.tsx src/features/catalog/components/catalog-screen.tsx src/features/catalog/products/components/product-list.tsx tests/components/import-intro.test.tsx
git commit -m "feat: add the bulk import screen with its entry points"
```

---

### Task 10: Vista previa: textos, opciones, resumen y categorías

**Files:**
- Create: `src/features/catalog/import/format.ts`, `src/features/catalog/import/components/import-preview.tsx`
- Test: `tests/unit/import-format.test.ts`, `tests/components/import-preview.test.tsx`

**Interfaces:**
- Consumes: los tipos y las opciones (tarea 2); `formatPrice` (catálogo); `TAX_CONFIG` (proforma).
- Produces:
  - **`format.ts`:**
    - etiquetas y números: `ROW_TABS`, `RowTab`, `STATUS_LABELS`, `money(value)`, `count(value)`, `plural(value, one, many)`, `fileSize(bytes)`;
    - porcentajes: `percentText(ratio)`, `priceRatio(before, after)`;
    - textos de fila: `changeText(change)`, `rowDetails(row, mode)`;
    - botón y resultado: `importButton(preview) → { enabled, label, reason }`, `outcomeSummary(outcome)`.
  - **`import-preview.tsx`:**
    - `STATUS_STYLES`;
    - componentes `PartialNotice({ text })`, `ImportOptionsPanel({ options, counts, disabled, onChange })`, `SummaryCards({ counts, active, onSelect })`, `VisualSummary({ prices, bars })` y `CategoryDecisions({ choices, disabled, onDecide })`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/import-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  changeText,
  count,
  fileSize,
  importButton,
  outcomeSummary,
  percentText,
  plural,
  rowDetails,
} from '@/features/catalog/import/format'
import type { PreviewCounts, PreviewRow } from '@/features/catalog/import/types'

const counts = (overrides: Partial<PreviewCounts> = {}): PreviewCounts => ({
  create: 0,
  update: 0,
  unchanged: 0,
  review: 0,
  error: 0,
  omitted: 0,
  ...overrides,
})

const row = (overrides: Partial<PreviewRow>): PreviewRow => ({
  line: 2,
  status: 'update',
  action: 'update',
  code: 'LAP-001',
  name: 'Laptop',
  category: 'Laptops',
  price: '1350.00',
  priceBeforeTax: null,
  changes: [],
  warnings: [],
  errors: [],
  ...overrides,
})

describe('textos de la vista previa', () => {
  it('cifras con espacio de miles que no se parte, y tamaños de archivo', () => {
    expect(count(1234)).toBe('1 234')
    expect(count(999)).toBe('999')
    expect(plural(1, 'fila', 'filas')).toBe('1 fila')
    expect(fileSize(300)).toBe('1 KB')
    expect(fileSize(350_000)).toBe('342 KB')
    expect(fileSize(1_258_291)).toBe('1.2 MB')
  })

  it('porcentajes con signo y el mismo punto decimal que los precios', () => {
    expect(percentText(0.125)).toBe('+12.5 %')
    expect(percentText(-0.04)).toBe('−4.0 %')
  })

  it('describe cada cambio como en la spec', () => {
    expect(changeText({ field: 'price', before: '1200', after: '1350.00' })).toBe(
      'Precio: S/ 1,200.00 → S/ 1,350.00 (+12.5 %)',
    )
    expect(changeText({ field: 'name', before: 'A', after: 'B' })).toBe('Nombre cambia.')
    expect(changeText({ field: 'category', before: 'Laptops', after: 'Computadoras' })).toBe(
      'Categoría: Laptops → Computadoras',
    )
  })

  it('el detalle cambia según el estado de la fila', () => {
    expect(rowDetails(row({ status: 'error', action: null, errors: ['Precio: x.'] }), 'all')).toEqual([
      'Precio: x.',
    ])
    expect(rowDetails(row({ status: 'omitted', action: null }), 'update')).toEqual([
      'No existe: el modo «Solo actualizar los existentes» la deja fuera.',
    ])
    expect(rowDetails(row({ status: 'create', action: 'create', priceBeforeTax: '1000.00', price: '1180.00' }), 'all')).toEqual([
      'Producto nuevo.',
      'S/ 1,000.00 + IGV → S/ 1,180.00',
    ])
    expect(rowDetails(row({ status: 'unchanged', action: 'unchanged' }), 'all')).toEqual([
      'Ya está igual: no se toca.',
    ])
  })

  it('el botón principal dice cuántos importa o por qué no se puede', () => {
    expect(importButton({ importable: 60, undecided: 0, counts: counts({ create: 60 }) })).toEqual({
      enabled: true,
      label: 'Importar 60 productos',
      reason: null,
    })
    expect(importButton({ importable: 3, undecided: 2, counts: counts({ create: 3 }) })).toMatchObject({
      enabled: false,
      reason: 'Decide 2 categorías antes de importar.',
    })
    expect(importButton({ importable: 0, undecided: 0, counts: counts({ unchanged: 5 }) })).toMatchObject({
      enabled: false,
      reason: 'Tu catálogo ya está al día con este archivo.',
    })
    expect(importButton({ importable: 0, undecided: 0, counts: counts({ error: 2 }) })).toMatchObject({
      enabled: false,
      reason: 'No hay filas para importar.',
    })
  })

  it('resume el resultado de la importación', () => {
    expect(
      outcomeSummary({ created: 48, updated: 12, unchanged: 5, categoriesCreated: ['A', 'B'] }),
    ).toBe('48 productos creados · 12 actualizados · 5 sin cambios · 2 categorías nuevas')
    expect(outcomeSummary({ created: 1, updated: 0, unchanged: 0, categoriesCreated: [] })).toBe(
      '1 producto creado',
    )
  })
})
```

`tests/components/import-preview.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  CategoryDecisions,
  ImportOptionsPanel,
  SummaryCards,
  VisualSummary,
} from '@/features/catalog/import/components/import-preview'
import { DEFAULT_IMPORT_OPTIONS } from '@/features/catalog/import/options'
import type { PreviewCounts } from '@/features/catalog/import/types'

const counts: PreviewCounts = { create: 3, update: 1, unchanged: 1, review: 2, error: 2, omitted: 4 }

describe('vista previa: resumen', () => {
  it('las tarjetas muestran cada cifra y filtran al pulsarlas', async () => {
    const onSelect = vi.fn()
    render(<SummaryCards counts={counts} active="error" onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /Con errores/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.setup().click(screen.getByRole('button', { name: /Para revisar/ }))
    expect(onSelect).toHaveBeenCalledWith('review')
  })

  it('las opciones avisan el cambio y cuentan las filas omitidas', async () => {
    const onChange = vi.fn()
    render(
      <ImportOptionsPanel
        options={{ ...DEFAULT_IMPORT_OPTIONS, mode: 'update' }}
        counts={counts}
        disabled={false}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('4 filas omitidas por el modo «Solo actualizar los existentes».')).toBeVisible()
    await userEvent.setup().click(screen.getByRole('radio', { name: 'No incluyen IGV: sumar 18 %' }))
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_IMPORT_OPTIONS, mode: 'update', pricesIncludeTax: false })
  })

  it('precios y categorías llevan su cifra en texto', () => {
    render(
      <VisualSummary
        prices={{ up: 150, down: 3, upAverage: 0.082, downAverage: -0.04 }}
        bars={[
          { name: 'Laptops', products: 12, tag: null },
          { name: 'Monitores', products: 3, tag: 'new' },
          { name: 'Laptps', products: 1, tag: 'similar' },
        ]}
      />,
    )
    expect(screen.getByText(/Suben 150/).closest('p')).toHaveTextContent(
      'Suben 150 (promedio +8.2 %) · Bajan 3 (promedio −4.0 %)',
    )
    expect(screen.getByText('nueva')).toBeVisible()
    expect(screen.getByText('¿parecida?')).toBeVisible()
    expect(screen.getByText('12 productos')).toBeVisible()
  })

  it('una categoría parecida pide decidir y la casi igual ya viene decidida', async () => {
    const onDecide = vi.fn()
    render(
      <CategoryDecisions
        choices={[
          {
            key: 'impresora',
            name: 'Impresora',
            kind: 'near',
            suggestion: 'Impresoras',
            decision: { action: 'use', target: 'Impresoras' },
            products: 4,
          },
          { key: 'laptps', name: 'Laptps', kind: 'similar', suggestion: 'Laptops', decision: null, products: 1 },
          { key: 'monitores', name: 'Monitores', kind: 'new', suggestion: null, decision: { action: 'create' }, products: 3 },
        ]}
        disabled={false}
        onDecide={onDecide}
      />,
    )
    expect(screen.getByText('Decide 1 categoría antes de importar: así no se crean duplicadas.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Usar "Impresoras"' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Elige una opción para poder importar.')).toBeVisible()
    expect(screen.getByText(/Se crearán:/).closest('p')).toHaveTextContent('Se crearán: Monitores (3)')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar "Laptops"' }))
    expect(onDecide).toHaveBeenCalledWith('laptps', { action: 'use', target: 'Laptops' })
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project unit --project components tests/unit/import-format.test.ts tests/components/import-preview.test.tsx`
Expected: FAIL. No existen los módulos.

- [ ] **Step 3: Implementar los textos y los componentes**

`src/features/catalog/import/format.ts`:

```ts
import { formatPrice } from '../money'
import type {
  FieldChange,
  ImportMode,
  ImportOutcome,
  ImportPreview,
  PreviewRow,
  RowStatus,
} from './types'

// Pestañas de la tabla (spec §6.6). Las tarjetas de resumen también eligen una.
export const ROW_TABS = ['all', 'create', 'update', 'review', 'unchanged', 'error'] as const
export type RowTab = (typeof ROW_TABS)[number]

export const STATUS_LABELS: Record<RowStatus, string> = {
  create: 'Nuevo',
  update: 'Se actualiza',
  review: 'Para revisar',
  unchanged: 'Sin cambios',
  error: 'Con errores',
  omitted: 'Omitida',
}

// «S/ 1,250.50», como en el resto de la app.
export const money = (value: string) => `S/ ${formatPrice(value)}`

// 1234 → «1 234», como en los textos de la spec. El espacio no se parte al final de una línea.
export const count = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export const plural = (value: number, one: string, many: string) =>
  `${count(value)} ${value === 1 ? one : many}`

// «340 KB» o «1.2 MB», para el chip del archivo elegido.
export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`

// «+12.5 %» o «−4.0 %»: con signo, un decimal y el mismo punto decimal que los precios, para que
// «S/ 1,350.00 (+12.5 %)» no mezcle separadores.
export const percentText = (ratio: number) =>
  `${ratio < 0 ? '−' : '+'}${Math.abs(ratio * 100).toFixed(1)} %`

export function priceRatio(before: string, after: string) {
  const base = Number(before)
  return base > 0 ? (Number(after) - base) / base : null
}

export function changeText(change: FieldChange) {
  switch (change.field) {
    case 'price': {
      if (!change.before || !change.after) return 'Precio cambia.'
      const ratio = priceRatio(change.before, change.after)
      const percent = ratio === null ? '' : ` (${percentText(ratio)})`
      return `Precio: ${money(change.before)} → ${money(change.after)}${percent}`
    }
    case 'category':
      return `Categoría: ${change.before ?? '—'} → ${change.after ?? '—'}`
    case 'name':
      return 'Nombre cambia.'
    case 'description':
      return 'Descripción cambia.'
  }
}

// La columna «Detalle» de cada fila (spec §6.6), sin los avisos, que van aparte en ámbar.
export function rowDetails(row: PreviewRow, mode: ImportMode): string[] {
  if (row.status === 'error') return row.errors
  if (row.status === 'omitted') {
    return [
      mode === 'create'
        ? 'Ya existe: el modo «Solo crear los nuevos» la deja fuera.'
        : 'No existe: el modo «Solo actualizar los existentes» la deja fuera.',
    ]
  }
  const lines: string[] = []
  if (row.action === 'create') lines.push('Producto nuevo.')
  if (row.action === 'unchanged') lines.push('Ya está igual: no se toca.')
  if (row.priceBeforeTax && row.price) {
    lines.push(`${money(row.priceBeforeTax)} + IGV → ${money(row.price)}`)
  }
  return [...lines, ...row.changes.map(changeText)]
}

// Texto y estado del botón principal (spec §6.6).
export function importButton(preview: Pick<ImportPreview, 'importable' | 'undecided' | 'counts'>) {
  const label = `Importar ${plural(preview.importable, 'producto', 'productos')}`
  if (preview.undecided > 0) {
    const reason =
      preview.undecided === 1
        ? 'Decide 1 categoría antes de importar.'
        : `Decide ${preview.undecided} categorías antes de importar.`
    return { enabled: false, label, reason }
  }
  if (preview.importable === 0) {
    const reason =
      preview.counts.unchanged > 0
        ? 'Tu catálogo ya está al día con este archivo.'
        : 'No hay filas para importar.'
    return { enabled: false, label: 'Importar', reason }
  }
  return { enabled: true, label, reason: null }
}

// «48 productos creados · 12 actualizados · 5 sin cambios · 2 categorías nuevas» (spec §6.10).
export function outcomeSummary(
  outcome: Pick<ImportOutcome, 'created' | 'updated' | 'unchanged' | 'categoriesCreated'>,
) {
  const parts: string[] = []
  if (outcome.created > 0) {
    parts.push(plural(outcome.created, 'producto creado', 'productos creados'))
  }
  if (outcome.updated > 0) parts.push(plural(outcome.updated, 'actualizado', 'actualizados'))
  if (outcome.unchanged > 0) parts.push(`${count(outcome.unchanged)} sin cambios`)
  if (outcome.categoriesCreated.length > 0) {
    parts.push(plural(outcome.categoriesCreated.length, 'categoría nueva', 'categorías nuevas'))
  }
  return parts.join(' · ')
}
```

`src/features/catalog/import/components/import-preview.tsx`:

```tsx
'use client'

import {
  CircleAlert,
  CircleMinus,
  CirclePlus,
  Info,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { TAX_CONFIG } from '@/features/proforma/tax'
import { cn } from '@/lib/utils'
import { count, percentText, plural, type RowTab } from '../format'
import { MODE_LABELS } from '../options'
import {
  IMPORT_MODES,
  type CategoryBar,
  type CategoryChoice,
  type CategoryDecision,
  type ImportOptions,
  type PreviewCounts,
  type PriceTrend,
  type RowStatus,
} from '../types'

// Cada estado con su icono y su color; el color nunca va solo, siempre con texto (spec §6.6).
export const STATUS_STYLES: Record<RowStatus, { icon: LucideIcon; tone: string }> = {
  create: { icon: CirclePlus, tone: 'bg-[#eef7e2] text-[#3f7d0a]' },
  update: { icon: RefreshCw, tone: 'bg-sky-50 text-sky-700' },
  review: { icon: TriangleAlert, tone: 'bg-amber-50 text-amber-800' },
  unchanged: { icon: CircleMinus, tone: 'bg-muted text-muted-foreground' },
  error: { icon: CircleAlert, tone: 'bg-destructive/10 text-destructive' },
  omitted: { icon: CircleMinus, tone: 'bg-muted text-muted-foreground' },
}

// «Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios…» (spec §6.6).
export function PartialNotice({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-3 rounded-[12px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text}
    </p>
  )
}

function Choice({
  name,
  checked,
  onChange,
  children,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm has-checked:border-ring has-checked:bg-[#f6fbef] has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-wait has-disabled:opacity-70">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-4 accent-ring" />
      {children}
    </label>
  )
}

// Opciones de importación, siempre visibles; al cambiarlas se recalcula la vista previa (spec §6.6).
export function ImportOptionsPanel({
  options,
  counts,
  disabled,
  onChange,
}: {
  options: ImportOptions
  counts: PreviewCounts
  disabled: boolean
  onChange: (options: ImportOptions) => void
}) {
  return (
    <section aria-labelledby="import-options" className="grid gap-4 rounded-[14px] border bg-card p-5">
      <h3 id="import-options" className="font-bold">
        Opciones de importación
      </h3>
      <div className="grid gap-5 md:grid-cols-2">
        <fieldset disabled={disabled} className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">Los precios de este archivo</legend>
          <Choice
            name="import-tax"
            checked={options.pricesIncludeTax}
            onChange={() => onChange({ ...options, pricesIncludeTax: true })}
          >
            Incluyen IGV
          </Choice>
          <Choice
            name="import-tax"
            checked={!options.pricesIncludeTax}
            onChange={() => onChange({ ...options, pricesIncludeTax: false })}
          >
            No incluyen IGV: sumar {TAX_CONFIG.ratePercent} %
          </Choice>
        </fieldset>
        <fieldset disabled={disabled} className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">Qué hacer</legend>
          {IMPORT_MODES.map((mode) => (
            <Choice
              key={mode}
              name="import-mode"
              checked={options.mode === mode}
              onChange={() => onChange({ ...options, mode })}
            >
              {MODE_LABELS[mode]}
            </Choice>
          ))}
        </fieldset>
      </div>
      {counts.omitted > 0 ? (
        <p className="text-sm text-muted-foreground">
          {plural(counts.omitted, 'fila omitida', 'filas omitidas')} por el modo «
          {MODE_LABELS[options.mode]}».
        </p>
      ) : null}
    </section>
  )
}

const CARDS: { status: Exclude<RowTab, 'all'>; title: string; text: string }[] = [
  { status: 'create', title: 'Nuevos', text: 'Se crearán.' },
  { status: 'update', title: 'Se actualizan', text: 'El código ya existe y algo cambia.' },
  { status: 'review', title: 'Para revisar', text: 'Se importan, pero conviene mirarlos.' },
  { status: 'unchanged', title: 'Sin cambios', text: 'Ya están iguales: no se tocan.' },
  { status: 'error', title: 'Con errores', text: 'No se importan.' },
]

// Tarjetas de resumen (spec §6.6): cada fila cuenta en una sola. Al pulsar una, la tabla muestra
// esas filas.
export function SummaryCards({
  counts,
  active,
  onSelect,
}: {
  counts: PreviewCounts
  active: RowTab
  onSelect: (tab: RowTab) => void
}) {
  return (
    <div role="group" aria-label="Resumen de la vista previa" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map((card) => {
        const { icon: Icon, tone } = STATUS_STYLES[card.status]
        return (
          <button
            key={card.status}
            type="button"
            aria-pressed={active === card.status}
            onClick={() => onSelect(card.status)}
            className="grid cursor-pointer content-start gap-1.5 rounded-[14px] border bg-card p-4 text-left transition-colors outline-none hover:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-ring aria-pressed:ring-1 aria-pressed:ring-ring"
          >
            <span className={cn('mb-1 grid size-9 place-items-center rounded-lg', tone)}>
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="text-[28px] leading-none font-extrabold tabular-nums">
              {count(counts[card.status])}
            </span>
            <span className="font-semibold">{card.title}</span>
            <span className="text-[13px] text-muted-foreground">{card.text}</span>
          </button>
        )
      })}
    </div>
  )
}

// Resumen visual (spec §6.6): precios que suben y bajan, y productos por categoría. Las barras
// llevan su cifra en texto.
export function VisualSummary({ prices, bars }: { prices: PriceTrend; bars: CategoryBar[] }) {
  const moved = prices.up + prices.down
  const most = Math.max(1, ...bars.map((bar) => bar.products))
  const shown = bars.slice(0, 8)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section aria-labelledby="import-prices" className="grid content-start gap-3 rounded-[14px] border bg-card p-5">
        <h3 id="import-prices" className="font-bold">
          Precios
        </h3>
        {moved === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún precio cambia con este archivo.</p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold text-[#3f7d0a]">Suben {count(prices.up)}</span>
              {prices.upAverage === null ? '' : ` (promedio ${percentText(prices.upAverage)})`}
              {' · '}
              <span className="font-semibold text-amber-800">Bajan {count(prices.down)}</span>
              {prices.downAverage === null ? '' : ` (promedio ${percentText(prices.downAverage)})`}
            </p>
            <div aria-hidden className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="bg-[#72ce0b]" style={{ width: `${(prices.up / moved) * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${(prices.down / moved) * 100}%` }} />
            </div>
          </>
        )}
      </section>
      <section aria-labelledby="import-by-category" className="grid content-start gap-3 rounded-[14px] border bg-card p-5">
        <h3 id="import-by-category" className="font-bold">
          Por categoría
        </h3>
        <ul className="grid gap-2.5">
          {shown.map((bar) => (
            <li key={bar.name} className="grid gap-1">
              <span className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{bar.name}</span>
                  {bar.tag ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 text-[11px] font-bold',
                        bar.tag === 'new' ? 'bg-[#eef7e2] text-[#3f7d0a]' : 'bg-amber-50 text-amber-800',
                      )}
                    >
                      {bar.tag === 'new' ? 'nueva' : '¿parecida?'}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {plural(bar.products, 'producto', 'productos')}
                </span>
              </span>
              <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-[#72ce0b]"
                  style={{ width: `${(bar.products / most) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
        {bars.length > shown.length ? (
          <p className="text-[13px] text-muted-foreground">
            y {plural(bars.length - shown.length, 'categoría más', 'categorías más')}.
          </p>
        ) : null}
      </section>
    </div>
  )
}

// Categorías nuevas y parecidas (spec §6.8): decisiones que hay que tomar antes de importar, para
// que nunca aparezca un duplicado por descuido. La casi igual ya viene decidida, pero se puede cambiar.
export function CategoryDecisions({
  choices,
  disabled,
  onDecide,
}: {
  choices: CategoryChoice[]
  disabled: boolean
  onDecide: (key: string, decision: CategoryDecision) => void
}) {
  if (choices.length === 0) return null
  const doubtful = choices.filter((choice) => choice.kind !== 'new')
  const created = choices.filter((choice) => choice.kind === 'new')
  const pending = doubtful.filter((choice) => choice.decision === null).length
  return (
    <section aria-labelledby="import-category-choices" className="grid gap-4 rounded-[14px] border bg-card p-5">
      <div className="grid gap-1">
        <h3 id="import-category-choices" className="font-bold">
          Categorías nuevas y parecidas
        </h3>
        <p className="text-sm text-muted-foreground">
          {pending > 0
            ? `Decide ${plural(pending, 'categoría', 'categorías')} antes de importar: así no se crean duplicadas.`
            : 'Así quedarán las categorías del archivo.'}
        </p>
      </div>
      {doubtful.length > 0 ? (
        <ul className="grid gap-3">
          {doubtful.map((choice) => {
            const undecided = choice.decision === null
            const using = choice.decision?.action === 'use'
            const creating = choice.decision?.action === 'create'
            return (
              <li
                key={choice.key}
                className={cn(
                  'grid gap-3 rounded-[12px] border p-4',
                  undecided ? 'border-amber-400 bg-amber-50/60' : 'bg-background/60',
                )}
              >
                <p className="text-sm">
                  {choice.kind === 'near' ? (
                    <>
                      «<strong>{choice.name}</strong>» es casi igual a «<strong>{choice.suggestion}</strong>».
                    </>
                  ) : (
                    <>
                      «<strong>{choice.name}</strong>» se parece a «<strong>{choice.suggestion}</strong>». ¿Usar
                      esa?
                    </>
                  )}{' '}
                  <span className="text-muted-foreground">
                    {plural(choice.products, 'producto', 'productos')}.
                  </span>
                </p>
                {undecided ? (
                  <p className="flex items-center gap-1.5 text-[13px] font-semibold text-amber-800">
                    <TriangleAlert className="size-4" aria-hidden />
                    Elige una opción para poder importar.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={using ? 'default' : 'outline'}
                    aria-pressed={using}
                    disabled={disabled}
                    onClick={() => onDecide(choice.key, { action: 'use', target: choice.suggestion ?? choice.name })}
                  >
                    Usar &quot;{choice.suggestion}&quot;
                  </Button>
                  <Button
                    size="sm"
                    variant={creating ? 'default' : 'outline'}
                    aria-pressed={creating}
                    disabled={disabled}
                    onClick={() => onDecide(choice.key, { action: 'create' })}
                  >
                    Crear &quot;{choice.name}&quot;
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
      {created.length > 0 ? (
        <p className="text-sm">
          <span className="font-semibold">Se crearán:</span>{' '}
          {created.map((choice) => `${choice.name} (${count(choice.products)})`).join(' · ')}
        </p>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit --project components tests/unit/import-format.test.ts tests/components/import-preview.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/import/format.ts src/features/catalog/import/components/import-preview.tsx tests/unit/import-format.test.ts tests/components/import-preview.test.tsx
git commit -m "feat: show the import preview summary, options and category decisions"
```

---
### Task 11: Pasos 1, 2 y 3: descarga, guía de la plantilla y zona de carga

**Files:**
- Create:
  - `src/features/catalog/import/use-download.ts`
  - `src/features/catalog/import/components/import-steps.tsx`
- Modify:
  - `src/features/catalog/import/components/import-screen.tsx`
  - `tests/components/import-intro.test.tsx`
- Test: `tests/components/import-steps.test.tsx`

**Interfaces:**
- Consumes:
  - `downloadImportTemplate` (tarea 8) y `exportProducts` con su tipo `ExcelFile` (fase 1);
  - `checkFile`, `IMPORT_MAX_ROWS` y `templateTitles` (tarea 2); `IMPORT_COLUMNS` (tarea 2);
  - `count`, `plural` y `fileSize` (tarea 10);
  - `Intent` (tarea 9).
- Produces:
  - `useDownload<Key>() → { pending: Key | null, download(key, action, done) }` y `DOWNLOAD_FAILED`, que también usan la barra de acción y el resultado (tareas 12 y 13);
  - componentes:
    - `ImportSteps({ intent, upload })`: los tres pasos, con el paso 3 recibido como `upload`;
    - `DownloadStep({ intent })`;
    - `TemplateGuide({ intent })`;
    - `UploadStep({ file, status, error, disabled, onFile })`;
  - `useIgnoreStrayDrops()`, que la pantalla usa en todas sus etapas.

- [ ] **Step 1: Escribir las pruebas**

`tests/components/import-steps.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DownloadStep,
  TemplateGuide,
  UploadStep,
} from '@/features/catalog/import/components/import-steps'
import { FILE_MESSAGES, IMPORT_MAX_BYTES } from '@/features/catalog/import/options'

const actions = vi.hoisted(() => ({ downloadImportTemplate: vi.fn(), exportProducts: vi.fn() }))
vi.mock('@/features/catalog/products/excel-actions', () => actions)

const excel = (fileName: string, extra: object = {}) => ({
  ok: true,
  data: { base64: btoa('xlsx'), fileName, ...extra },
})

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:excel')
  URL.revokeObjectURL = vi.fn()
})
// Cada prueba prepara sus respuestas: ninguna pasa a la siguiente.
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

function renderDownload(intent: 'create' | 'update') {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  render(
    <>
      <DownloadStep intent={intent} />
      <Toaster />
    </>,
  )
  return { click, user: userEvent.setup() }
}

describe('Paso 1: descarga el archivo', () => {
  it('para cargar productos nuevos destaca la plantilla y la descarga', async () => {
    actions.downloadImportTemplate.mockResolvedValue(excel('plantilla-carga-masiva.xlsx'))
    const { click, user } = renderDownload('create')
    expect(screen.getByText(/Tiene las columnas listas, tus categorías en un desplegable/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Descargar plantilla' }))
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('plantilla-carga-masiva.xlsx')
    expect(await screen.findByText('Plantilla descargada')).toBeVisible()
  })

  it('para actualizar descarga todo el catálogo, sin filtros', async () => {
    actions.exportProducts.mockResolvedValue(excel('productos-2026-10-03.xlsx', { count: 52, truncated: false }))
    const { user } = renderDownload('update')
    expect(screen.getByText(/Lo que no cambies se queda igual/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Descargar mi catálogo' }))
    expect(actions.exportProducts).toHaveBeenCalledWith(
      { search: '', category: null, dateBy: 'created', date: null, from: null, to: null, sort: 'name' },
      'report',
    )
    expect(await screen.findByText('Catálogo descargado · 52 productos')).toBeVisible()
  })

  it('con el catálogo vacío sugiere la plantilla, y avisa si pasa del límite de la carga', async () => {
    actions.exportProducts.mockResolvedValueOnce({
      ok: false,
      error: { code: 'VALIDATION', message: 'No hay productos para descargar con estos filtros.' },
    })
    const { user } = renderDownload('update')
    await user.click(screen.getByRole('button', { name: 'Descargar mi catálogo' }))
    expect(
      await screen.findByText('Tu catálogo todavía no tiene productos. Empieza con la plantilla.'),
    ).toBeVisible()

    actions.exportProducts.mockResolvedValueOnce(excel('productos.xlsx', { count: 6200, truncated: false }))
    await user.click(screen.getByRole('button', { name: 'Descargar mi catálogo' }))
    expect(
      await screen.findByText(
        'Tu catálogo tiene 6 200 productos y cada carga acepta hasta 5 000: divide el archivo antes de subirlo.',
      ),
    ).toBeVisible()
  })
})

describe('Paso 2: la guía de la plantilla', () => {
  it('muestra la maqueta, las reglas de cada columna y los consejos', async () => {
    render(<TemplateGuide intent="create" />)
    expect(screen.getByRole('table', { name: 'Ejemplo de la hoja Productos de la plantilla' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Precio con IGV (S/)' })).toBeVisible()
    expect(screen.getByText('LAP-001')).toBeVisible()
    expect(screen.getByText(/Siempre obligatorio/)).toBeVisible()
    expect(screen.getByText('Puedes dejar filas vacías: se ignoran.')).toBeVisible()

    const code = screen.getByRole('button', { name: 'Código' })
    expect(code).toHaveAccessibleDescription(/Siempre obligatorio y único, hasta 64 caracteres/)
    await userEvent.setup().click(code)
    expect(screen.getByText(/Siempre obligatorio/).closest('li')).toHaveAttribute('data-active')
  })
})

describe('Paso 3: la zona de carga', () => {
  function renderUpload(props: Partial<Parameters<typeof UploadStep>[0]> = {}) {
    const onFile = vi.fn()
    render(<UploadStep file={null} status={null} error={null} disabled={false} onFile={onFile} {...props} />)
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    return { onFile, input }
  }

  it('acepta un .xlsx elegido o soltado', () => {
    const { onFile, input } = renderUpload()
    expect(screen.getByRole('button', { name: /Arrastra tu Excel aquí o elige un archivo/ })).toHaveTextContent(
      'Solo .xlsx · hasta 4 MB · hasta 5 000 productos',
    )
    const file = new File(['x'], 'productos.xlsx')
    fireEvent.change(input, { target: { files: [file] } })
    expect(onFile).toHaveBeenCalledWith(file)

    const zone = screen.getByRole('button', { name: /Arrastra tu Excel/ })
    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ['Files'] } })
    expect(zone).toHaveAttribute('data-dragging')
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })
    expect(onFile).toHaveBeenCalledTimes(2)
    expect(zone).not.toHaveAttribute('data-dragging')
  })

  it('rechaza en el navegador lo que no es .xlsx o pesa demasiado, con el mensaje de la spec', () => {
    const { onFile, input } = renderUpload()
    fireEvent.change(input, { target: { files: [new File(['x'], 'productos.csv')] } })
    expect(screen.getByRole('alert')).toHaveTextContent(FILE_MESSAGES.notXlsx)
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(IMPORT_MAX_BYTES + 1)], 'grande.xlsx')] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(FILE_MESSAGES.tooBig)
    expect(onFile).not.toHaveBeenCalled()
  })

  it('con el archivo elegido muestra su chip y la espera; un error devuelve la zona', () => {
    const file = new File([new Uint8Array(350_000)], 'Productos.xlsx')
    const { rerender } = render(
      <UploadStep file={file} status="Leyendo tu Excel…" error={null} disabled onFile={vi.fn()} />,
    )
    expect(screen.getByText('Productos.xlsx')).toBeVisible()
    expect(screen.getByText('342 KB')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cambiar archivo' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Leyendo tu Excel…')

    rerender(
      <UploadStep file={null} status={null} error={FILE_MESSAGES.noCode} disabled={false} onFile={vi.fn()} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(FILE_MESSAGES.noCode)
    expect(screen.getByRole('button', { name: /Arrastra tu Excel/ })).toBeEnabled()
  })
})
```

En `tests/components/import-intro.test.tsx`, la pantalla ya importa las acciones del servidor: añade `vi` al import de `vitest` y, debajo de los imports:

```tsx
// Las acciones cargan Supabase y ExcelJS en el servidor; esta prueba no las usa.
vi.mock('@/features/catalog/products/excel-actions', () => ({
  downloadImportTemplate: vi.fn(),
  exportProducts: vi.fn(),
  previewProductImport: vi.fn(),
  importProducts: vi.fn(),
  downloadImportSimulation: vi.fn(),
  downloadImportErrors: vi.fn(),
}))
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project components tests/components/import-steps.test.tsx`
Expected: FAIL. No existe `import-steps`.

- [ ] **Step 3: Implementar la descarga y los pasos**

`src/features/catalog/import/use-download.ts`:

```ts
import { useState } from 'react'
import { toast } from 'sonner'
import { settle, type ActionResult } from '@/lib/action-result'
import { base64ToFile, downloadFile, XLSX_MIME } from '@/lib/files'
import type { DownloadedFile } from './types'

export const DOWNLOAD_FAILED =
  'No se pudo preparar el Excel. Revisa tu conexión e inténtalo de nuevo.'

// Descarga un Excel que prepara una Server Action. Recuerda cuál se está preparando (para su botón)
// y avisa si falla; `done` recibe el archivo para el aviso de éxito.
export function useDownload<Key extends string>() {
  const [pending, setPending] = useState<Key | null>(null)

  async function download<T extends DownloadedFile>(
    key: Key,
    action: () => Promise<ActionResult<T>>,
    done: (file: T) => void,
  ) {
    setPending(key)
    const result = await settle(action())
    setPending(null)
    if (!result.ok) {
      toast.error(result.error.code === 'UNEXPECTED' ? DOWNLOAD_FAILED : result.error.message)
      return false
    }
    downloadFile(base64ToFile(result.data.base64, result.data.fileName, XLSX_MIME))
    done(result.data)
    return true
  }

  return { pending, download }
}
```

`src/features/catalog/import/components/import-steps.tsx`:

```tsx
'use client'

import {
  Check,
  CircleAlert,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Monitor,
  Upload,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ExportFilters } from '../../excel/export-request'
import { downloadImportTemplate, exportProducts } from '../../products/excel-actions'
import { count, fileSize, plural } from '../format'
import { checkFile, IMPORT_MAX_ROWS, templateTitles } from '../options'
import { IMPORT_COLUMNS, type ImportColumn } from '../types'
import { useDownload } from '../use-download'
import type { Intent } from './import-intro'

// Un paso numerado (spec §6.11): aquí la numeración sí es una secuencia. La línea que une los pasos
// es decorativa y va en el hueco entre tarjetas, hasta el centro del círculo (24 + 18 px).
function Step({
  number,
  title,
  className,
  children,
}: {
  number: number
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <li
      className={cn(
        'relative grid min-w-0 content-start gap-4 rounded-[16px] border bg-card p-6',
        number > 1 &&
          'before:absolute before:-top-4 before:left-[41px] before:h-4 before:w-0.5 before:bg-[#c8ec9e]',
        className,
      )}
    >
      <h2 className="flex items-center gap-3 text-lg font-bold">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-base font-extrabold text-primary-foreground"
        >
          {number}
        </span>
        <span>
          <span className="sr-only">Paso {number}: </span>
          {title}
        </span>
      </h2>
      {children}
    </li>
  )
}

// Los tres pasos (spec §6.2): en PC el 1 y el 2 lado a lado y el 3 a todo el ancho; en móvil, uno
// debajo de otro.
export function ImportSteps({ intent, upload }: { intent: Intent; upload: ReactNode }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground md:hidden">
        <Monitor className="size-4 shrink-0" aria-hidden />
        Es más cómodo desde una PC.
      </p>
      <ol className="grid gap-4 lg:grid-cols-2">
        <Step number={1} title="Descarga el archivo">
          <DownloadStep intent={intent} />
        </Step>
        <Step
          number={2}
          title={intent === 'create' ? 'Complétalo' : 'Cambia lo que necesites'}
          className="lg:before:top-[41px] lg:before:-left-4 lg:before:h-0.5 lg:before:w-4"
        >
          <TemplateGuide intent={intent} />
        </Step>
        <Step number={3} title="Súbelo" className="lg:col-span-2">
          {upload}
        </Step>
      </ol>
    </div>
  )
}

// Todo el catálogo, sin filtros y por nombre (spec §6.3): «Descargar mi catálogo» es el reporte
// completo.
const WHOLE_CATALOG: ExportFilters = {
  search: '',
  category: null,
  dateBy: 'created',
  date: null,
  from: null,
  to: null,
  sort: 'name',
}

type Download = 'template' | 'catalog'

const DOWNLOADS: Record<Download, { label: string; text: string; hint: string }> = {
  template: {
    label: 'Descargar plantilla',
    text: 'Tiene las columnas listas, tus categorías en un desplegable y una hoja con instrucciones y ejemplos.',
    hint: '¿Vas a cargar productos nuevos?',
  },
  catalog: {
    label: 'Descargar mi catálogo',
    text: 'Trae todos tus productos con su código: cambia lo que necesites y súbelo. Lo que no cambies se queda igual.',
    hint: '¿Vas a cambiar productos que ya tienes?',
  },
}

// Sin productos, la acción dice «No hay productos para descargar con estos filtros»; aquí no hay
// filtros, así que se sugiere la plantilla.
async function catalogFile() {
  const result = await exportProducts(WHOLE_CATALOG, 'report')
  if (result.ok || result.error.code !== 'VALIDATION') return result
  return {
    ...result,
    error: { ...result.error, message: 'Tu catálogo todavía no tiene productos. Empieza con la plantilla.' },
  }
}

// Paso 1 (spec §6.3): el archivo de la intención elegida como botón principal; el otro, como enlace.
export function DownloadStep({ intent }: { intent: Intent }) {
  const { pending, download } = useDownload<Download>()
  const primary: Download = intent === 'create' ? 'template' : 'catalog'
  const secondary: Download = primary === 'template' ? 'catalog' : 'template'

  function run(kind: Download) {
    if (kind === 'template') {
      return download('template', downloadImportTemplate, () => toast.success('Plantilla descargada'))
    }
    return download('catalog', catalogFile, (file) => {
      // El reporte puede traer hasta 10 000 productos; la carga masiva acepta 5 000 por archivo.
      if (file.count > IMPORT_MAX_ROWS) {
        toast.warning(
          `Tu catálogo tiene ${count(file.count)} productos y cada carga acepta hasta ${count(IMPORT_MAX_ROWS)}: divide el archivo antes de subirlo.`,
        )
      } else {
        toast.success(`Catálogo descargado · ${plural(file.count, 'producto', 'productos')}`)
      }
    })
  }

  const label = (kind: Download) => (pending === kind ? 'Preparando Excel…' : DOWNLOADS[kind].label)
  return (
    <div className="grid content-start gap-4">
      <p className="text-sm text-muted-foreground">{DOWNLOADS[primary].text}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button onClick={() => void run(primary)} disabled={pending !== null}>
          {pending === primary ? (
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          {label(primary)}
        </Button>
        <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          {DOWNLOADS[secondary].hint}
          <Button
            variant="link"
            className="h-auto px-0 py-0 text-sm"
            onClick={() => void run(secondary)}
            disabled={pending !== null}
          >
            {label(secondary)}
          </Button>
        </span>
      </div>
    </div>
  )
}

// Reglas de cada columna (spec §6.4).
const RULES: Record<ImportColumn, ReactNode> = {
  code: (
    <>
      <strong>Siempre obligatorio</strong> y único, hasta 64 caracteres. Se guarda en mayúsculas.{' '}
      <strong>Si ya existe, se actualiza ese producto.</strong>
    </>
  ),
  name: 'Hasta 120 caracteres. Obligatorio para productos nuevos.',
  description: 'Opcional, hasta 2 000 caracteres. Puede tener varias líneas.',
  category: (
    <>
      Obligatoria para productos nuevos. Elígela del desplegable o escribe una nueva:{' '}
      <strong>se creará</strong>. No distingue mayúsculas.
    </>
  ),
  price: (
    <>
      Mayor que 0, con hasta 2 decimales, en soles y <strong>con IGV incluido</strong>. Obligatorio
      para productos nuevos. Vale <code>1250.50</code>, <code>1250,50</code>, <code>1,250.50</code> o{' '}
      <code>S/ 1250.50</code>.
    </>
  ),
}

// Dos filas como las de la hoja «Productos», con el formato de precio de la plantilla.
const EXAMPLE_ROWS: Record<ImportColumn, string>[] = [
  {
    code: 'LAP-001',
    name: 'Laptop 14" Core i5',
    description: 'Core i5 · 16 GB · SSD 512 GB',
    category: 'Laptops',
    price: 'S/ 2,590.00',
  },
  {
    code: 'IMP-014',
    name: 'Impresora láser HP M404dn',
    description: 'Monocromática, dúplex',
    category: 'Impresoras',
    price: 'S/ 1,180.00',
  },
]

const TIPS = [
  'No cambies los títulos de la primera fila.',
  'Una fila por producto.',
  'Para actualizar solo precios, deja las columnas Código y Precio con IGV y borra las demás.',
  'Puedes dejar filas vacías: se ignoran.',
]

// Paso 2 (spec §6.4): maqueta de la plantilla con aspecto de Excel. Cada título es un botón que
// resalta su columna y su regla al pasar el cursor, enfocarlo o tocarlo; las reglas también están
// siempre visibles debajo, como texto, para el teclado y los lectores de pantalla.
export function TemplateGuide({ intent }: { intent: Intent }) {
  const titles = templateTitles()
  const [active, setActive] = useState<ImportColumn | null>(null)
  const id = useId()
  const ruleId = (column: ImportColumn) => `${id}-${column}`
  const highlight = (column: ImportColumn) => ({
    onMouseEnter: () => setActive(column),
    onMouseLeave: () => setActive(null),
  })
  return (
    <div className="grid min-w-0 content-start gap-4">
      {intent === 'update' ? (
        <p className="text-sm text-muted-foreground">
          Tu catálogo trae las mismas columnas que la plantilla, con algunas más que se ignoran al
          subirlo.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Ejemplo de la hoja Productos de la plantilla</caption>
          <thead>
            <tr aria-hidden className="bg-muted text-center text-[11px] text-muted-foreground">
              <td className="w-8 border-r" />
              {IMPORT_COLUMNS.map((column, index) => (
                <td
                  key={column}
                  className={cn(
                    'border-r px-2 py-0.5 last:border-r-0',
                    active === column && 'bg-[#e4f4cf] font-bold text-foreground',
                  )}
                >
                  {String.fromCharCode(65 + index)}
                </td>
              ))}
            </tr>
            <tr>
              <td
                aria-hidden
                className="border-t border-r bg-muted text-center text-[11px] text-muted-foreground"
              >
                1
              </td>
              {IMPORT_COLUMNS.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'border-t border-r p-0 last:border-r-0',
                    active === column ? 'bg-[#3f7d0a]' : 'bg-[#121511]',
                  )}
                >
                  <button
                    type="button"
                    aria-describedby={ruleId(column)}
                    {...highlight(column)}
                    onFocus={() => setActive(column)}
                    onBlur={() => setActive(null)}
                    onClick={() => setActive(column)}
                    className="w-full cursor-help px-2.5 py-2 text-left font-bold whitespace-nowrap text-white outline-none focus-visible:ring-3 focus-visible:ring-primary focus-visible:ring-inset"
                  >
                    {titles[column]}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXAMPLE_ROWS.map((row, index) => (
              <tr key={row.code}>
                <td
                  aria-hidden
                  className="border-t border-r bg-muted text-center text-[11px] text-muted-foreground"
                >
                  {index + 2}
                </td>
                {IMPORT_COLUMNS.map((column) => (
                  <td
                    key={column}
                    className={cn(
                      'border-t border-r px-2.5 py-1.5 whitespace-nowrap last:border-r-0',
                      column === 'price' && 'text-right tabular-nums',
                      active === column && 'bg-[#f6fbef]',
                    )}
                  >
                    {row[column]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-1.5">
        {IMPORT_COLUMNS.map((column) => (
          <li
            key={column}
            id={ruleId(column)}
            {...highlight(column)}
            data-active={active === column || undefined}
            className="rounded-lg border border-transparent px-3 py-2 text-sm transition-colors data-active:border-ring/40 data-active:bg-[#f6fbef] motion-reduce:transition-none"
          >
            <span className="font-semibold">{titles[column]}:</span> {RULES[column]}
          </li>
        ))}
      </ul>
      <ul className="grid gap-1.5 text-sm text-muted-foreground">
        {TIPS.map((tip) => (
          <li key={tip} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-ring" aria-hidden />
            {tip}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Soltar un archivo fuera de la zona de carga no lo abre en el navegador, en ninguna etapa de la
// pantalla (la vista previa no tiene zona de carga).
export function useIgnoreStrayDrops() {
  useEffect(() => {
    const ignore = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault()
    }
    window.addEventListener('dragover', ignore)
    window.addEventListener('drop', ignore)
    return () => {
      window.removeEventListener('dragover', ignore)
      window.removeEventListener('drop', ignore)
    }
  }, [])
}

// Paso 3 (spec §6.5): un button real con un input oculto. El tamaño y la extensión se comprueban
// aquí antes de enviar, y otra vez en el servidor.
export function UploadStep({
  file,
  status,
  error,
  disabled,
  onFile,
}: {
  file: File | null
  status: string | null
  error: string | null
  disabled: boolean
  onFile: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  function choose(chosen: File | undefined) {
    if (!chosen) return
    const message = checkFile(chosen)
    setProblem(message)
    if (!message) onFile(chosen)
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!disabled) choose(event.dataTransfer.files[0])
  }

  const message = problem ?? error
  const browse = () => input.current?.click()
  return (
    <div className="grid gap-3">
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(event) => {
          choose(event.target.files?.[0])
          // Así, elegir otra vez el mismo archivo (ya corregido) vuelve a enviarlo.
          event.target.value = ''
        }}
      />
      {file && !message ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] border bg-background/60 px-4 py-3">
          <FileSpreadsheet className="size-5 shrink-0 text-ring" aria-hidden />
          <span className="grid min-w-0 flex-1">
            <span className="truncate font-semibold">{file.name}</span>
            <span className="text-[13px] text-muted-foreground">{fileSize(file.size)}</span>
          </span>
          <Button variant="outline" size="sm" onClick={browse} disabled={disabled}>
            Cambiar archivo
          </Button>
        </div>
      ) : (
        <button
          id="import-dropzone"
          type="button"
          onClick={browse}
          disabled={disabled}
          data-dragging={dragging || undefined}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
          }}
          onDrop={drop}
          className="grid cursor-pointer justify-items-center gap-2 rounded-[16px] border-2 border-dashed border-[#cfd6c6] bg-background/60 px-6 py-10 text-center transition-colors outline-none hover:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70 data-dragging:border-ring data-dragging:bg-[#eef7e2] motion-reduce:transition-none"
        >
          <span className="grid size-12 place-items-center rounded-full bg-[#eef7e2] text-ring">
            <Upload className="size-5" aria-hidden />
          </span>
          <span className="font-semibold">Arrastra tu Excel aquí o elige un archivo</span>
          <span className="text-[13px] text-muted-foreground">
            Solo .xlsx · hasta 4 MB · hasta {count(IMPORT_MAX_ROWS)} productos
          </span>
        </button>
      )}
      <div role="status">
        {status ? (
          <div className="grid gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <LoaderCircle
                className="size-4 animate-spin text-ring motion-reduce:animate-none"
                aria-hidden
              />
              {status}
            </p>
            <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-full animate-pulse rounded-full bg-primary/70 motion-reduce:animate-none" />
            </div>
          </div>
        ) : null}
      </div>
      {message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[12px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
      ) : null}
    </div>
  )
}
```

En `src/features/catalog/import/components/import-screen.tsx`, la pantalla queda así (la tarea 13 la completa con la vista previa):

```tsx
'use client'

import { useState } from 'react'
import { ImportFaq, ImportHeader, IntentCards, type Intent } from './import-intro'
import { ImportSteps, UploadStep, useIgnoreStrayDrops } from './import-steps'

// Carga masiva (spec del Excel §6). La vista previa y el resultado llegan en la tarea 13.
export function ImportScreen({ hasProducts }: { hasProducts: boolean }) {
  const [intent, setIntent] = useState<Intent>(hasProducts ? 'update' : 'create')
  const [file, setFile] = useState<File | null>(null)
  useIgnoreStrayDrops()
  return (
    <div className="grid max-w-[1200px] gap-8">
      <ImportHeader />
      <IntentCards value={intent} onChange={setIntent} />
      <ImportSteps
        intent={intent}
        upload={<UploadStep file={file} status={null} error={null} disabled={false} onFile={setFile} />}
      />
      <ImportFaq />
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components tests/components/import-steps.test.tsx tests/components/import-intro.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/import/use-download.ts src/features/catalog/import/components/import-steps.tsx src/features/catalog/import/components/import-screen.tsx tests/components/import-steps.test.tsx tests/components/import-intro.test.tsx
git commit -m "feat: guide the bulk import in three steps with downloads and a drop zone"
```

---
### Task 12: Filas de la vista previa y barra de acción

**Files:**
- Create:
  - `src/features/catalog/import/components/preview-rows.tsx`
  - `src/features/catalog/import/components/import-action-bar.tsx`
- Modify: `src/features/catalog/import/format.ts`, `tests/unit/import-format.test.ts`
- Test: `tests/components/import-rows.test.tsx`

**Interfaces:**
- Consumes:
  - `ROW_TABS`, `RowTab`, `STATUS_LABELS`, `money`, `count`, `plural`, `rowDetails` e `importButton` (tarea 10);
  - `STATUS_STYLES` (tarea 10);
  - `PreviewRow`, `PreviewCounts`, `ImportPreview` e `ImportMode` (tarea 2).
- Produces:
  - en **`format.ts`**: `PAGE_SIZE = 50`, `defaultTab(counts)`, `filterRows(rows, tab, search)` y `previewSummary(counts)`;
  - `PreviewRows({ rows, counts, mode, tab, onTab })`;
  - `BarDownload = 'simulation' | 'errors'`;
  - `ImportActionBar({ preview, importing, refreshing, downloading, onChooseAnother, onDownload, onImport })`, que pide confirmación si `preview.updates > 0`;
  - `ErrorsNotice({ errors, downloading, onDownload })` y `ReviewNotice({ reviews })`.

- [ ] **Step 1: Escribir las pruebas**

Añade a `tests/unit/import-format.test.ts` (y `defaultTab`, `filterRows` y `previewSummary` al import de `format`):

```ts
describe('pestañas y búsqueda de la vista previa', () => {
  const rows = [
    row({ line: 2, status: 'create', code: 'IMP-001', name: 'Impresión térmica' }),
    row({ line: 3, status: 'error', code: 'LAP-002', name: 'Laptop' }),
    row({ line: 4, status: 'omitted', code: 'MON-003', name: 'Monitor' }),
  ]

  it('se abre en lo que más conviene mirar: errores, avisos, cambios y nuevos', () => {
    expect(defaultTab(counts({ error: 1, review: 2 }))).toBe('error')
    expect(defaultTab(counts({ review: 2, update: 3 }))).toBe('review')
    expect(defaultTab(counts({ create: 5, update: 2, unchanged: 4000 }))).toBe('update')
    expect(defaultTab(counts({ create: 5 }))).toBe('create')
    expect(defaultTab(counts({ unchanged: 5 }))).toBe('all')
  })

  it('filtra por pestaña y busca por código o nombre sin tildes ni mayúsculas', () => {
    expect(filterRows(rows, 'all', '').map((item) => item.line)).toEqual([2, 3, 4])
    expect(filterRows(rows, 'error', '').map((item) => item.line)).toEqual([3])
    expect(filterRows(rows, 'all', '  IMPRESION ').map((item) => item.line)).toEqual([2])
    expect(filterRows(rows, 'all', 'mon-0').map((item) => item.line)).toEqual([4])
    expect(filterRows(rows, 'create', 'laptop')).toEqual([])
  })

  it('resume lo que hará el botón Importar', () => {
    expect(previewSummary(counts({ create: 48, update: 12, review: 3 }))).toBe(
      '48 nuevos · 12 se actualizan · 3 para revisar',
    )
    expect(previewSummary(counts({ update: 1 }))).toBe('1 se actualiza')
    expect(previewSummary(counts({ unchanged: 4 }))).toBe('')
  })
})
```

`tests/components/import-rows.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  ErrorsNotice,
  ImportActionBar,
  ReviewNotice,
} from '@/features/catalog/import/components/import-action-bar'
import { PreviewRows } from '@/features/catalog/import/components/preview-rows'
import type { RowTab } from '@/features/catalog/import/format'
import type { ImportPreview, PreviewCounts, PreviewRow } from '@/features/catalog/import/types'

const row = (line: number, overrides: Partial<PreviewRow> = {}): PreviewRow => ({
  line,
  status: 'create',
  action: 'create',
  code: `P-${line}`,
  name: `Producto ${line}`,
  category: 'Laptops',
  price: '100.00',
  priceBeforeTax: null,
  changes: [],
  warnings: [],
  errors: [],
  ...overrides,
})

function countsOf(rows: PreviewRow[]): PreviewCounts {
  const counts: PreviewCounts = { create: 0, update: 0, unchanged: 0, review: 0, error: 0, omitted: 0 }
  for (const item of rows) counts[item.status] += 1
  return counts
}

function Rows({ rows, initial = 'all' }: { rows: PreviewRow[]; initial?: RowTab }) {
  const [tab, setTab] = useState<RowTab>(initial)
  return <PreviewRows rows={rows} counts={countsOf(rows)} mode="all" tab={tab} onTab={setTab} />
}

describe('PreviewRows', () => {
  const mixed = [
    row(2),
    row(3, {
      status: 'update',
      action: 'update',
      changes: [{ field: 'price', before: '1200.00', after: '1350.00' }],
    }),
    row(4, {
      status: 'review',
      action: 'update',
      warnings: ['El precio baja un 90 %. ¿Es correcto?'],
      changes: [{ field: 'price', before: '1000.00', after: '100.00' }],
    }),
    row(5, {
      status: 'error',
      action: null,
      price: null,
      errors: ['Precio: escribe solo números con hasta dos decimales, por ejemplo 1250.50.'],
    }),
  ]

  it('muestra cada estado con texto, su detalle y la cifra de cada pestaña', async () => {
    render(<Rows rows={mixed} />)
    expect(screen.getByRole('tab', { name: /Todas\s*4/ })).toHaveAttribute('aria-selected', 'true')
    const table = within(screen.getByRole('table', { name: /Todas: Filas 1–4 de 4/ }))
    expect(table.getByText('Precio: S/ 1,200.00 → S/ 1,350.00 (+12.5 %)')).toBeVisible()
    expect(table.getByText('El precio baja un 90 %. ¿Es correcto?')).toBeVisible()
    expect(table.getAllByText('Con errores')).toHaveLength(1)

    await userEvent.setup().click(screen.getByRole('tab', { name: /Con errores\s*1/ }))
    const errors = within(screen.getByRole('table'))
    expect(errors.getAllByRole('row')).toHaveLength(2)
    expect(errors.getByText(/Precio: escribe solo números/)).toBeVisible()
  })

  it('en móvil cada fila es una tarjeta con la misma información', () => {
    render(<Rows rows={mixed} />)
    const cards = within(screen.getByRole('list', { name: /Todas: Filas 1–4 de 4/ }))
    expect(cards.getAllByText(/^Fila \d+$/)).toHaveLength(4)
    expect(cards.getByText('Precio: S/ 1,200.00 → S/ 1,350.00 (+12.5 %)')).toBeVisible()
  })

  it('busca por código o nombre y pagina de 50 en 50', async () => {
    const many = Array.from({ length: 120 }, (_, index) => row(index + 2))
    many[80] = row(82, { name: 'Impresión láser' })
    const user = userEvent.setup()
    render(<Rows rows={many} />)
    expect(screen.getByText('Filas 1–50 de 120')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getByText('Filas 51–100 de 120')).toBeVisible()

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }), 'impresion')
    expect(screen.getByText('Filas 1–1 de 1')).toBeVisible()
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'xyz')
    expect(screen.getByText('Ninguna fila coincide con «xyz».')).toBeVisible()
  })
})

const preview = (overrides: Partial<ImportPreview> = {}): ImportPreview => ({
  fileName: 'productos.xlsx',
  sheetName: 'Productos',
  columns: ['code', 'name', 'description', 'category', 'price'],
  partialNotice: null,
  ignoredNotice: null,
  rows: [],
  counts: { create: 48, update: 12, unchanged: 5, review: 0, error: 3, omitted: 0 },
  prices: { up: 12, down: 0, upAverage: 0.05, downAverage: null },
  choices: [],
  bars: [],
  undecided: 0,
  importable: 60,
  updates: 12,
  ...overrides,
})

function renderBar(props: Partial<Parameters<typeof ImportActionBar>[0]> = {}) {
  const handlers = { onChooseAnother: vi.fn(), onDownload: vi.fn(), onImport: vi.fn() }
  render(
    <ImportActionBar
      preview={preview()}
      importing={false}
      refreshing={false}
      downloading={null}
      {...handlers}
      {...props}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('ImportActionBar', () => {
  it('pide confirmación antes de actualizar productos existentes', async () => {
    const { onImport, user } = renderBar()
    expect(screen.getByRole('region', { name: 'Importación' })).toHaveTextContent(
      '48 nuevos · 12 se actualizan',
    )
    await user.click(screen.getByRole('button', { name: 'Importar 60 productos' }))
    const dialog = screen.getByRole('alertdialog', { name: '¿Actualizar 12 productos existentes?' })
    expect(dialog).toHaveTextContent('Al terminar podrás descargar un comprobante para revertirlo.')
    await user.click(within(dialog).getByRole('button', { name: 'Importar' }))
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('solo con productos nuevos importa sin preguntar', async () => {
    const { onImport, user } = renderBar({
      preview: preview({ updates: 0, counts: { create: 3, update: 0, unchanged: 0, review: 0, error: 0, omitted: 0 }, importable: 3 }),
    })
    await user.click(screen.getByRole('button', { name: 'Importar 3 productos' }))
    expect(onImport).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('explica por qué no se puede importar y bloquea todo mientras importa', () => {
    const { rerender } = render(
      <ImportActionBar
        preview={preview({ undecided: 2 })}
        importing={false}
        refreshing={false}
        downloading={null}
        onChooseAnother={vi.fn()}
        onDownload={vi.fn()}
        onImport={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Importar 60 productos' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription('Decide 2 categorías antes de importar.')

    rerender(
      <ImportActionBar
        preview={preview()}
        importing
        refreshing={false}
        downloading={null}
        onChooseAnother={vi.fn()}
        onDownload={vi.fn()}
        onImport={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Importando 60 productos…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Elegir otro archivo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Descargar simulación' })).toBeDisabled()
  })

  it('el aviso de errores descarga las filas aparte', async () => {
    const onDownload = vi.fn()
    render(<ErrorsNotice errors={3} downloading={null} onDownload={onDownload} />)
    expect(
      screen.getByText(
        '3 filas con errores no se importarán. Corrígelas y vuelve a subir el archivo, o descárgalas aparte.',
      ),
    ).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Descargar filas con errores' }))
    expect(onDownload).toHaveBeenCalledWith('errors')
  })

  it('las filas para revisar se importan igual, y dice cómo corregirlas', () => {
    render(<ReviewNotice reviews={2} />)
    expect(
      screen.getByText(
        '2 filas para revisar se importarán igual. Si alguna no es correcta, corrígela en el Excel y vuelve a subir el archivo.',
      ),
    ).toBeVisible()
  })
})
```

- [ ] **Step 2: Ejecutarlas y ver que fallan**

Run: `pnpm exec vitest run --project unit --project components tests/unit/import-format.test.ts tests/components/import-rows.test.tsx`
Expected: FAIL. No existen `defaultTab`, `filterRows`, `previewSummary` ni los componentes.

- [ ] **Step 3: Implementar las pestañas, la tabla y la barra**

Añade a `src/features/catalog/import/format.ts` (y `PreviewCounts` al import de `./types`):

```ts
// Nunca se dibujan miles de filas de golpe (spec §6.6).
export const PAGE_SIZE = 50

// La primera pestaña con contenido de este orden: Con errores, Para revisar, Se actualizan, Nuevos y
// Todas. Con el catálogo completo, «Todas» escondería los pocos cambios entre miles de filas sin
// cambios (revisión 2 del plan).
export const defaultTab = (counts: PreviewCounts): RowTab =>
  (['error', 'review', 'update', 'create'] as const).find((tab) => counts[tab] > 0) ?? 'all'

// Sin tildes ni mayúsculas: «impresion» encuentra «Impresión».
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function filterRows(rows: PreviewRow[], tab: RowTab, search: string) {
  const needle = fold(search.trim())
  return rows.filter(
    (row) =>
      (tab === 'all' || row.status === tab) &&
      (!needle || fold(row.code).includes(needle) || fold(row.name ?? '').includes(needle)),
  )
}

// «48 nuevos · 12 se actualizan · 3 para revisar»: lo que hará el botón Importar.
export function previewSummary(counts: PreviewCounts) {
  return [
    counts.create > 0 ? plural(counts.create, 'nuevo', 'nuevos') : null,
    counts.update > 0
      ? `${count(counts.update)} ${counts.update === 1 ? 'se actualiza' : 'se actualizan'}`
      : null,
    counts.review > 0 ? `${count(counts.review)} para revisar` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
```

`src/features/catalog/import/components/preview-rows.tsx`:

```tsx
'use client'

import { ChevronLeft, ChevronRight, Search, TriangleAlert } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { useDeferredValue, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  count,
  filterRows,
  money,
  PAGE_SIZE,
  ROW_TABS,
  rowDetails,
  STATUS_LABELS,
  type RowTab,
} from '../format'
import type { ImportMode, PreviewCounts, PreviewRow, RowStatus } from '../types'
import { STATUS_STYLES } from './import-preview'

const TAB_LABELS: Record<RowTab, string> = {
  all: 'Todas',
  create: 'Nuevos',
  update: 'Se actualizan',
  review: 'Para revisar',
  unchanged: 'Sin cambios',
  error: 'Con errores',
}

function StatusBadge({ status }: { status: RowStatus }) {
  const { icon: Icon, tone } = STATUS_STYLES[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap',
        tone,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  )
}

// Detalle de una fila (spec §6.6): qué cambia, los errores en rojo y los avisos en ámbar.
function RowDetail({ row, mode }: { row: PreviewRow; mode: ImportMode }) {
  return (
    <ul className="grid gap-1 text-[13px]">
      {rowDetails(row, mode).map((line, index) => (
        <li
          key={`${index}-${line}`}
          className={row.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}
        >
          {line}
        </li>
      ))}
      {row.warnings.map((warning) => (
        <li key={warning} className="flex items-start gap-1.5 font-semibold text-amber-800">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {warning}
        </li>
      ))}
    </ul>
  )
}

const shownPrice = (row: PreviewRow) => (row.price ? money(row.price) : '—')

// Una página de filas: tabla en PC y tarjetas en móvil (spec §6.6). La página vuelve a la primera
// al cambiar la búsqueda; al cambiar de pestaña, este componente se monta de nuevo.
function RowsPage({
  rows,
  tab,
  search,
  mode,
}: {
  rows: PreviewRow[]
  tab: RowTab
  search: string
  mode: ImportMode
}) {
  const [paging, setPaging] = useState({ search, page: 0 })
  const filtered = filterRows(rows, tab, search)
  if (filtered.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground">
        {search.trim()
          ? `Ninguna fila coincide con «${search.trim()}».`
          : 'No hay filas en esta pestaña.'}
      </p>
    )
  }
  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const page = Math.min(paging.search === search ? paging.page : 0, pages - 1)
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const range = `Filas ${count(page * PAGE_SIZE + 1)}–${count(page * PAGE_SIZE + shown.length)} de ${count(filtered.length)}`
  const go = (next: number) => setPaging({ search, page: next })
  return (
    <div className="grid">
      <div className="overflow-x-auto max-md:hidden">
        <table className="w-full min-w-[860px] text-left text-sm">
          <caption className="sr-only">
            {TAB_LABELS[tab]}: {range}
          </caption>
          <thead className="border-b bg-muted/50 text-[13px] text-muted-foreground">
            <tr>
              <th scope="col" className="w-16 px-4 py-2.5 font-semibold">Fila</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Estado</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Código</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Nombre</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Categoría</th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">Precio</th>
              <th scope="col" className="w-[32%] px-4 py-2.5 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((row) => (
              <tr key={row.line} className="align-top">
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{row.line}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 font-semibold break-all">{row.code || '—'}</td>
                <td className="px-4 py-3">{row.name ?? '—'}</td>
                <td className="px-4 py-3">{row.category ?? '—'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {shownPrice(row)}
                </td>
                <td className="px-4 py-3">
                  <RowDetail row={row} mode={mode} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label={`${TAB_LABELS[tab]}: ${range}`} className="grid gap-3 p-4 md:hidden">
        {shown.map((row) => (
          <li key={row.line} className="grid gap-2 rounded-[12px] border bg-background/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <StatusBadge status={row.status} />
              <span className="text-[13px] text-muted-foreground">Fila {row.line}</span>
            </div>
            <p className="grid">
              <span className="font-semibold break-all">{row.code || '—'}</span>
              <span>{row.name ?? '—'}</span>
            </p>
            <p className="text-[13px] text-muted-foreground">
              {row.category ?? '—'} · {shownPrice(row)}
            </p>
            <RowDetail row={row} mode={mode} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-[13px] text-muted-foreground">
        <span>{range}</span>
        {pages > 1 ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Página anterior"
              disabled={page === 0}
              onClick={() => go(page - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Página siguiente"
              disabled={page === pages - 1}
              onClick={() => go(page + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Filas de la vista previa (spec §6.6): pestañas con su cifra, búsqueda en el navegador y páginas
// de 50. La pestaña la controla la pantalla, porque las tarjetas de resumen también la cambian.
export function PreviewRows({
  rows,
  counts,
  mode,
  tab,
  onTab,
}: {
  rows: PreviewRow[]
  counts: PreviewCounts
  mode: ImportMode
  tab: RowTab
  onTab: (tab: RowTab) => void
}) {
  const [search, setSearch] = useState('')
  // Escribir nunca se traba, aunque haya 5 000 filas que filtrar: la tabla se pone al día después.
  const deferredSearch = useDeferredValue(search)
  const tabCount = (value: RowTab) => (value === 'all' ? rows.length : counts[value])
  return (
    <section aria-labelledby="import-rows" className="grid min-w-0 rounded-[14px] border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h3 id="import-rows" className="font-bold">
          Filas del archivo
        </h3>
        <div className="relative w-full sm:max-w-[320px]">
          <Search
            className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor="import-search" className="sr-only">
            Buscar por código o nombre
          </label>
          <Input
            id="import-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={120}
            autoComplete="off"
            placeholder="Buscar por código o nombre…"
            className="bg-background/60 pl-9"
          />
        </div>
      </div>
      <Tabs.Root value={tab} onValueChange={(value) => onTab(value as RowTab)} className="grid min-w-0">
        <Tabs.List aria-label="Filas por estado" className="flex overflow-x-auto border-b px-2">
          {ROW_TABS.map((value) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset data-[state=active]:text-foreground data-[state=active]:after:bg-primary"
            >
              {TAB_LABELS[value]}
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums">
                {count(tabCount(value))}
              </span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {ROW_TABS.map((value) => (
          <Tabs.Content key={value} value={value} className="outline-none">
            <RowsPage rows={rows} tab={value} search={deferredSearch} mode={mode} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </section>
  )
}
```

`src/features/catalog/import/components/import-action-bar.tsx`:

```tsx
'use client'

import { CircleAlert, Download, LoaderCircle, TriangleAlert, Upload } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { importButton, plural, previewSummary } from '../format'
import type { ImportPreview } from '../types'

export type BarDownload = 'simulation' | 'errors'

// En el teléfono los botones secundarios muestran solo su icono (el nombre sigue para los lectores
// de pantalla y como title): la barra ocupa dos filas cortas y no tapa media pantalla.
const ghost = 'h-10 px-3 text-[#d6dbd2] hover:bg-white/12 hover:text-white'

// Barra fija con «Importar N productos» (spec §6.6 y §6.9), como la de la proforma. Si se van a
// actualizar productos que ya existen, pide confirmación.
export function ImportActionBar({
  preview,
  importing,
  refreshing,
  downloading,
  onChooseAnother,
  onDownload,
  onImport,
}: {
  preview: ImportPreview
  importing: boolean
  refreshing: boolean
  downloading: BarDownload | null
  onChooseAnother: () => void
  onDownload: (kind: BarDownload) => void
  onImport: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const button = importButton(preview)
  const busy = importing || refreshing
  const products = plural(preview.importable, 'producto', 'productos')
  const status = importing
    ? 'Guardando: no cierres esta página.'
    : (button.reason ?? previewSummary(preview.counts))
  return (
    <>
      {/* Espacio para que la barra no tape la paginación. */}
      <div aria-hidden className="h-32 sm:h-24" />
      <div
        role="region"
        aria-label="Importación"
        className="fixed inset-x-4 bottom-4 z-20 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[14px] bg-foreground py-3 pr-3.5 pl-5 text-white shadow-[0_18px_36px_-12px_#10180a66] sm:inset-x-6 sm:bottom-6 lg:right-10 lg:left-[calc(var(--sidebar-width)+2.5rem)]"
      >
        <p
          id="import-bar-status"
          aria-live="polite"
          className="min-w-0 flex-1 text-sm text-[#d6dbd2]"
        >
          {status}
        </p>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            variant="ghost"
            className={ghost}
            title="Elegir otro archivo"
            disabled={busy}
            onClick={onChooseAnother}
          >
            <Upload aria-hidden />
            <span className="max-sm:sr-only">Elegir otro archivo</span>
          </Button>
          <Button
            variant="ghost"
            className={ghost}
            title="Descargar simulación"
            disabled={busy || downloading !== null}
            onClick={() => onDownload('simulation')}
          >
            {downloading === 'simulation' ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            <span className="max-sm:sr-only">
              {downloading === 'simulation' ? 'Preparando Excel…' : 'Descargar simulación'}
            </span>
          </Button>
          <Button
            className="h-11 flex-1 px-4.5 text-[15px] font-bold sm:flex-none"
            disabled={!button.enabled || busy}
            aria-describedby="import-bar-status"
            onClick={() => (preview.updates > 0 ? setConfirming(true) : onImport())}
          >
            {importing ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {importing ? `Importando ${products}…` : button.label}
          </Button>
        </div>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Actualizar {plural(preview.updates, 'producto existente', 'productos existentes')}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sus datos se reemplazarán por los del Excel. Al terminar podrás descargar un
              comprobante para revertirlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onImport}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// Aviso de filas para revisar (revisión 2 del plan): se importan igual. La importación es todo o
// nada, así que una fila que no es correcta se corrige en el Excel.
export function ReviewNotice({ reviews }: { reviews: number }) {
  return (
    <p className="flex items-start gap-2 rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {plural(reviews, 'fila para revisar se importará igual', 'filas para revisar se importarán igual')}
        . Si alguna no es correcta, corrígela en el Excel y vuelve a subir el archivo.
      </span>
    </p>
  )
}

// Aviso de filas con errores (spec §6.6), con su descarga aparte.
export function ErrorsNotice({
  errors,
  downloading,
  onDownload,
}: {
  errors: number
  downloading: BarDownload | null
  onDownload: (kind: BarDownload) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[12px] border border-destructive/30 bg-destructive/5 px-4 py-3">
      <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-destructive">
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {plural(errors, 'fila con errores no se importará', 'filas con errores no se importarán')}.
        Corrígelas y vuelve a subir el archivo, o descárgalas aparte.
      </p>
      <Button
        variant="outline"
        size="sm"
        disabled={downloading !== null}
        onClick={() => onDownload('errors')}
      >
        {downloading === 'errors' ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Download aria-hidden />
        )}
        {downloading === 'errors' ? 'Preparando Excel…' : 'Descargar filas con errores'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit --project components tests/unit/import-format.test.ts tests/components/import-rows.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/import/format.ts src/features/catalog/import/components/preview-rows.tsx src/features/catalog/import/components/import-action-bar.tsx tests/unit/import-format.test.ts tests/components/import-rows.test.tsx
git commit -m "feat: list the import preview rows by status and add the import action bar"
```

---
### Task 13: Pantalla completa: vista previa, importación y resultado

**Files:**
- Create: `src/features/catalog/import/components/import-result.tsx`
- Modify: `src/features/catalog/import/components/import-screen.tsx`
- Test: `tests/components/import-screen.test.tsx`

**Interfaces:**
- Consumes:
  - las acciones `previewProductImport`, `importProducts`, `downloadImportSimulation` y `downloadImportErrors` (tarea 8);
  - `DEFAULT_IMPORT_OPTIONS` (tarea 2); `defaultTab`, `outcomeSummary` y `plural` (tareas 10 y 12);
  - los componentes de las tareas 9 a 12 y `useDownload` (tarea 11);
  - `catalogKeys` y `settle`, que ya existen.
- Produces:
  - `ImportScreen({ hasProducts })` completa, con las etapas `choose → reading → preview → importing → done`;
  - `ImportResult({ outcome, downloading, onErrors, onAgain })` y `RESULT_LINK`.

- [ ] **Step 1: Escribir la prueba del recorrido**

`tests/components/import-screen.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportScreen } from '@/features/catalog/import/components/import-screen'
import { FILE_MESSAGES } from '@/features/catalog/import/options'
import type { ImportOutcome, ImportPreview, PreviewRow } from '@/features/catalog/import/types'
import type { ActionResult } from '@/lib/action-result'

const actions = vi.hoisted(() => ({
  downloadImportTemplate: vi.fn(),
  exportProducts: vi.fn(),
  previewProductImport: vi.fn(),
  importProducts: vi.fn(),
  downloadImportSimulation: vi.fn(),
  downloadImportErrors: vi.fn(),
}))
vi.mock('@/features/catalog/products/excel-actions', () => actions)

const row = (line: number, overrides: Partial<PreviewRow> = {}): PreviewRow => ({
  line,
  status: 'create',
  action: 'create',
  code: `P-${line}`,
  name: `Producto ${line}`,
  category: 'Laptops',
  price: '100.00',
  priceBeforeTax: null,
  changes: [],
  warnings: [],
  errors: [],
  ...overrides,
})

const PREVIEW: ImportPreview = {
  fileName: 'productos.xlsx',
  sheetName: 'Productos',
  columns: ['code', 'name', 'description', 'category', 'price'],
  partialNotice: null,
  ignoredNotice: null,
  rows: [
    row(2),
    row(3, {
      status: 'update',
      action: 'update',
      changes: [{ field: 'price', before: '1200.00', after: '1350.00' }],
    }),
    row(4, { category: 'Laptps' }),
    row(5, { status: 'error', action: null, errors: ['Precio: está vacío. Escríbelo o quita la columna del archivo.'] }),
  ],
  counts: { create: 2, update: 1, unchanged: 0, review: 0, error: 1, omitted: 0 },
  prices: { up: 1, down: 0, upAverage: 0.125, downAverage: null },
  choices: [
    { key: 'laptps', name: 'Laptps', kind: 'similar', suggestion: 'Laptops', decision: null, products: 1 },
  ],
  bars: [{ name: 'Laptops', products: 3, tag: null }],
  undecided: 1,
  importable: 3,
  updates: 1,
}

const DECIDED: ImportPreview = {
  ...PREVIEW,
  choices: [{ ...PREVIEW.choices[0], decision: { action: 'use', target: 'Laptops' } }],
  undecided: 0,
}

const OUTCOME: ImportOutcome = {
  created: 2,
  updated: 1,
  unchanged: 0,
  skipped: 0,
  errors: 1,
  categoriesCreated: [],
  receipt: { base64: btoa('xlsx'), fileName: 'comprobante-importacion-2026-10-03-1015.xlsx' },
}

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function renderScreen() {
  const client = new QueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <ImportScreen hasProducts />
      <Toaster />
    </QueryClientProvider>,
  )
  return { invalidate, user: userEvent.setup() }
}

const choose = (file = new File(['x'], 'productos.xlsx')) =>
  fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })

const sentOptions = (call: number) =>
  JSON.parse(String((actions.previewProductImport.mock.calls[call][0] as FormData).get('options')))

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:excel')
  URL.revokeObjectURL = vi.fn()
})
// Cada prueba prepara sus respuestas: ninguna pasa a la siguiente.
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('ImportScreen: recorrido completo', () => {
  it('lee, revisa, decide, confirma, importa y entrega el comprobante', async () => {
    const reading = deferred<ActionResult<ImportPreview>>()
    actions.previewProductImport.mockReturnValueOnce(reading.promise)
    const { invalidate, user } = renderScreen()

    choose()
    expect(screen.getByRole('status')).toHaveTextContent('Leyendo tu Excel…')
    expect(screen.getByText('productos.xlsx')).toBeVisible()
    await act(async () => reading.resolve(ok(PREVIEW)))

    const heading = screen.getByRole('heading', { name: 'Esto es lo que va a pasar' })
    expect(heading).toHaveFocus()
    expect(screen.getByRole('tab', { name: /Con errores/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Importar 3 productos' })).toBeDisabled()

    // Decidir la categoría parecida vuelve a pedir la vista previa con la decisión.
    actions.previewProductImport.mockResolvedValueOnce(ok(DECIDED))
    await user.click(screen.getByRole('button', { name: 'Usar "Laptops"' }))
    expect(sentOptions(1).categoryMap).toEqual({ laptps: { action: 'use', target: 'Laptops' } })
    const importButton = screen.getByRole('button', { name: 'Importar 3 productos' })
    await vi.waitFor(() => expect(importButton).toBeEnabled())

    // Hay un producto existente que cambia: se confirma antes.
    actions.importProducts.mockResolvedValueOnce(ok(OUTCOME))
    await user.click(importButton)
    const dialog = screen.getByRole('alertdialog', { name: '¿Actualizar 1 producto existente?' })
    await user.click(within(dialog).getByRole('button', { name: 'Importar' }))

    const done = await screen.findByRole('heading', { name: '¡Listo! Tu catálogo está actualizado' })
    expect(done).toHaveFocus()
    expect(screen.getByText('2 productos creados · 1 actualizado')).toBeVisible()
    expect(screen.getByText('1 fila no se importó.')).toBeVisible()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['catalog'] })
    expect(screen.getByRole('link', { name: 'Ver productos' })).toHaveAttribute(
      'href',
      '/products?dateBy=updated&date=today&sort=updated',
    )

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await user.click(screen.getByRole('button', { name: 'Descargar comprobante' }))
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(OUTCOME.receipt.fileName)
    expect(actions.importProducts).toHaveBeenCalledOnce()
  })

  it('al cambiar una opción recalcula la vista previa y lo anuncia', async () => {
    actions.previewProductImport.mockResolvedValueOnce(ok(DECIDED))
    const { user } = renderScreen()
    choose()
    await screen.findByRole('heading', { name: 'Esto es lo que va a pasar' })

    const refresh = deferred<ActionResult<ImportPreview>>()
    actions.previewProductImport.mockReturnValueOnce(refresh.promise)
    await user.click(screen.getByRole('radio', { name: 'No incluyen IGV: sumar 18 %' }))
    expect(sentOptions(1)).toMatchObject({ pricesIncludeTax: false, mode: 'all' })
    expect(screen.getByRole('status')).toHaveTextContent('Revisando 4 filas…')
    expect(screen.getByRole('button', { name: 'Importar 3 productos' })).toBeDisabled()
    await act(async () => refresh.resolve(ok(DECIDED)))
    expect(screen.getByRole('button', { name: 'Importar 3 productos' })).toBeEnabled()
  })

  it('un archivo que no sirve muestra su mensaje y deja elegir otro', async () => {
    actions.previewProductImport.mockResolvedValueOnce({
      ok: false,
      error: { code: 'VALIDATION', message: FILE_MESSAGES.noCode },
    })
    renderScreen()
    choose()
    expect(await screen.findByRole('alert')).toHaveTextContent(FILE_MESSAGES.noCode)
    expect(screen.getByRole('button', { name: /Arrastra tu Excel/ })).toBeEnabled()
  })

  it('si la base falla no se guarda nada; si se corta la red, revisa cómo quedó el catálogo', async () => {
    actions.previewProductImport.mockResolvedValue(ok({ ...DECIDED, updates: 0 }))
    actions.importProducts.mockResolvedValueOnce({
      ok: false,
      error: { code: 'UNEXPECTED', message: 'No se pudo completar la operación. Inténtalo de nuevo.' },
    })
    const { user } = renderScreen()
    choose()
    const importButton = await screen.findByRole('button', { name: 'Importar 3 productos' })
    await user.click(importButton)
    expect(
      await screen.findByText(
        'No se importó nada. Revisa tu conexión e inténtalo de nuevo; tu archivo sigue seleccionado.',
      ),
    ).toBeVisible()
    await vi.waitFor(() => expect(importButton).toBeEnabled())
    expect(actions.previewProductImport).toHaveBeenCalledOnce()

    actions.importProducts.mockRejectedValueOnce(new Error('red caída'))
    await user.click(importButton)
    expect(
      await screen.findByText(
        'Se cortó la conexión durante la importación. Revisamos tu archivo otra vez: la vista previa muestra cómo quedó tu catálogo.',
      ),
    ).toBeVisible()
    await vi.waitFor(() => expect(actions.previewProductImport).toHaveBeenCalledTimes(2))
  })

  it('cada archivo nuevo empieza con las opciones por defecto', async () => {
    actions.previewProductImport.mockResolvedValue(ok(DECIDED))
    const { user } = renderScreen()
    choose()
    await user.click(await screen.findByRole('radio', { name: 'No incluyen IGV: sumar 18 %' }))
    expect(sentOptions(1)).toMatchObject({ pricesIncludeTax: false })
    const another = screen.getByRole('button', { name: 'Elegir otro archivo' })
    await vi.waitFor(() => expect(another).toBeEnabled())
    await user.click(another)
    choose(new File(['y'], 'comprobante.xlsx'))
    await screen.findByRole('heading', { name: 'Esto es lo que va a pasar' })
    expect(sentOptions(2)).toEqual({ pricesIncludeTax: true, mode: 'all', categoryMap: {} })
  })

  it('«Elegir otro archivo» vuelve a la zona de carga con el foco en ella', async () => {
    actions.previewProductImport.mockResolvedValueOnce(ok(DECIDED))
    const { user } = renderScreen()
    choose()
    await user.click(await screen.findByRole('button', { name: 'Elegir otro archivo' }))
    expect(screen.getByRole('button', { name: /Arrastra tu Excel/ })).toHaveFocus()
    expect(screen.queryByRole('heading', { name: 'Esto es lo que va a pasar' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Ejecutarla y ver que falla**

Run: `pnpm exec vitest run --project components tests/components/import-screen.test.tsx`
Expected: FAIL. La pantalla todavía no muestra la vista previa.

- [ ] **Step 3: Implementar el resultado y las etapas de la pantalla**

`src/features/catalog/import/components/import-result.tsx`:

```tsx
'use client'

import { Check, Download, ListChecks, LoaderCircle, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { base64ToFile, downloadFile, XLSX_MIME } from '@/lib/files'
import { outcomeSummary, plural } from '../format'
import type { ImportOutcome } from '../types'
import type { BarDownload } from './import-action-bar'

// Lo creado y lo actualizado hoy, lo último primero (spec §6.10).
export const RESULT_LINK = '/products?dateBy=updated&date=today&sort=updated'

// Resultado (spec §6.10): el comprobante ya viene en la respuesta, sin otra petición.
export function ImportResult({
  outcome,
  downloading,
  onErrors,
  onAgain,
}: {
  outcome: ImportOutcome
  downloading: BarDownload | null
  onErrors: () => void
  onAgain: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  // Al terminar, el foco va al título del resultado (spec §6.11).
  useEffect(() => heading.current?.focus(), [])
  const { receipt } = outcome
  return (
    <section
      aria-labelledby="import-result"
      className="grid justify-items-center gap-6 rounded-[18px] border bg-card px-6 py-12 text-center"
    >
      <span
        aria-hidden
        className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground motion-safe:animate-in motion-safe:duration-500 motion-safe:zoom-in-50"
      >
        <Check className="size-8" strokeWidth={3} />
      </span>
      <div className="grid gap-2">
        <h2
          id="import-result"
          ref={heading}
          tabIndex={-1}
          className="scroll-mt-24 text-2xl font-extrabold tracking-[-0.01em] outline-none"
        >
          ¡Listo! Tu catálogo está actualizado
        </h2>
        <p className="text-[15px] text-muted-foreground">
          {outcomeSummary(outcome) || 'No hubo cambios: tu catálogo ya estaba al día.'}
        </p>
        {outcome.categoriesCreated.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Categorías nuevas: {outcome.categoriesCreated.join(', ')}
          </p>
        ) : null}
      </div>
      {outcome.errors > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-[12px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{plural(outcome.errors, 'fila no se importó', 'filas no se importaron')}.</span>
          <Button variant="outline" size="sm" disabled={downloading !== null} onClick={onErrors}>
            {downloading === 'errors' ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            {downloading === 'errors' ? 'Preparando Excel…' : 'Descargar filas con errores'}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          onClick={() => downloadFile(base64ToFile(receipt.base64, receipt.fileName, XLSX_MIME))}
        >
          <Download aria-hidden />
          Descargar comprobante
        </Button>
        <Button asChild variant="outline">
          <Link href={RESULT_LINK} prefetch>
            <ListChecks aria-hidden />
            Ver productos
          </Link>
        </Button>
        <Button variant="ghost" onClick={onAgain}>
          <RotateCcw aria-hidden />
          Hacer otra carga
        </Button>
      </div>
      {outcome.updated > 0 ? (
        <p className="max-w-[56ch] text-[13px] text-muted-foreground">
          Guarda el comprobante: su hoja «Para revertir» trae los valores anteriores de los productos
          actualizados.
        </p>
      ) : null}
    </section>
  )
}
```

`src/features/catalog/import/components/import-screen.tsx`, completa:

```tsx
'use client'

import { useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { settle, type ActionResult } from '@/lib/action-result'
import { cn } from '@/lib/utils'
import {
  downloadImportErrors,
  downloadImportSimulation,
  importProducts,
  previewProductImport,
} from '../../products/excel-actions'
import { catalogKeys } from '../../query-keys'
import { defaultTab, plural, type RowTab } from '../format'
import { DEFAULT_IMPORT_OPTIONS } from '../options'
import type { CategoryDecision, ImportOptions, ImportOutcome, ImportPreview } from '../types'
import { useDownload } from '../use-download'
import { ErrorsNotice, ImportActionBar, ReviewNotice, type BarDownload } from './import-action-bar'
import { ImportFaq, ImportHeader, IntentCards, type Intent } from './import-intro'
import {
  CategoryDecisions,
  ImportOptionsPanel,
  PartialNotice,
  SummaryCards,
  VisualSummary,
} from './import-preview'
import { ImportResult } from './import-result'
import { ImportSteps, UploadStep, useIgnoreStrayDrops } from './import-steps'
import { PreviewRows } from './preview-rows'

type Stage = 'choose' | 'reading' | 'preview' | 'importing' | 'done'

// Si la app se actualizó con la pantalla abierta, las acciones viejas ya no existen: recargar lo arregla.
const READ_FAILED =
  'No pudimos revisar el archivo. Revisa tu conexión e inténtalo de nuevo; si sigue fallando, recarga la página.'
const IMPORT_FAILED =
  'No se importó nada. Revisa tu conexión e inténtalo de nuevo; tu archivo sigue seleccionado.'
// Sin respuesta no se sabe si la base alcanzó a guardar: no se puede decir «no se importó nada».
const CONNECTION_LOST =
  'Se cortó la conexión durante la importación. Revisamos tu archivo otra vez: la vista previa muestra cómo quedó tu catálogo.'

// El archivo y las opciones viajan en cada petición: el servidor vuelve a leer y validar todo
// (spec §9.2).
function requestData(file: File, options: ImportOptions) {
  const data = new FormData()
  data.set('file', file)
  data.set('options', JSON.stringify(options))
  return data
}

const smooth = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

// «Esto es lo que va a pasar» (spec §6.6): opciones, resumen, decisiones, filas y la barra fija.
function PreviewStage({
  preview,
  options,
  tab,
  refreshing,
  importing,
  downloading,
  onTab,
  onOptions,
  onChooseAnother,
  onDownload,
  onImport,
}: {
  preview: ImportPreview
  options: ImportOptions
  tab: RowTab
  refreshing: boolean
  importing: boolean
  downloading: BarDownload | null
  onTab: (tab: RowTab) => void
  onOptions: (options: ImportOptions) => void
  onChooseAnother: () => void
  onDownload: (kind: BarDownload) => void
  onImport: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  // Al llegar la vista previa, el foco va a su título (spec §6.11).
  useEffect(() => heading.current?.focus(), [])
  const busy = refreshing || importing
  const rows = plural(preview.rows.length, 'fila', 'filas')

  // Una tarjeta de resumen elige su pestaña y lleva a la tabla.
  function selectCard(next: RowTab) {
    onTab(next)
    document.getElementById('import-rows')?.scrollIntoView?.({ behavior: smooth(), block: 'start' })
  }

  function decide(key: string, decision: CategoryDecision) {
    onOptions({ ...options, categoryMap: { ...options.categoryMap, [key]: decision } })
  }

  return (
    <section
      aria-labelledby="import-preview"
      className="grid gap-6 motion-safe:animate-in motion-safe:duration-300 motion-safe:fade-in"
    >
      <div className="grid gap-1.5">
        <h2
          id="import-preview"
          ref={heading}
          tabIndex={-1}
          className="scroll-mt-24 text-2xl font-extrabold tracking-[-0.01em] outline-none"
        >
          Esto es lo que va a pasar
        </h2>
        {/* Otro archivo se elige desde la barra fija: una sola acción con un solo nombre. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <FileSpreadsheet className="size-4 text-ring" aria-hidden />
          <span className="font-semibold break-all text-foreground">{preview.fileName}</span>
          <span>
            · hoja «{preview.sheetName}» · {rows}
          </span>
        </p>
        <p role="status" className="text-sm font-semibold text-ring">
          {refreshing ? `Revisando ${rows}…` : null}
        </p>
      </div>
      {preview.partialNotice ? <PartialNotice text={preview.partialNotice} /> : null}
      {preview.ignoredNotice ? <PartialNotice text={preview.ignoredNotice} /> : null}
      <ImportOptionsPanel
        options={options}
        counts={preview.counts}
        disabled={busy}
        onChange={onOptions}
      />
      <div
        className={cn(
          'grid gap-6 transition-opacity motion-reduce:transition-none',
          refreshing && 'opacity-60',
        )}
      >
        <SummaryCards counts={preview.counts} active={tab} onSelect={selectCard} />
        {preview.counts.error > 0 ? (
          <ErrorsNotice
            errors={preview.counts.error}
            downloading={downloading}
            onDownload={onDownload}
          />
        ) : null}
        {preview.counts.review > 0 ? <ReviewNotice reviews={preview.counts.review} /> : null}
        <CategoryDecisions choices={preview.choices} disabled={busy} onDecide={decide} />
        <VisualSummary prices={preview.prices} bars={preview.bars} />
        <PreviewRows
          rows={preview.rows}
          counts={preview.counts}
          mode={options.mode}
          tab={tab}
          onTab={onTab}
        />
      </div>
      <ImportActionBar
        preview={preview}
        importing={importing}
        refreshing={refreshing}
        downloading={downloading}
        onChooseAnother={onChooseAnother}
        onDownload={onDownload}
        onImport={onImport}
      />
    </section>
  )
}

// Carga masiva (spec del Excel §6): elegir el archivo, revisar qué pasará, importar y descargar el
// comprobante. El archivo se queda en el navegador y se reenvía en cada petición.
export function ImportScreen({ hasProducts }: { hasProducts: boolean }) {
  const queryClient = useQueryClient()
  const [intent, setIntent] = useState<Intent>(hasProducts ? 'update' : 'create')
  const [stage, setStage] = useState<Stage>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<RowTab>('all')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const latest = useRef(0)
  const { pending: downloading, download } = useDownload<BarDownload>()
  useIgnoreStrayDrops()

  // Salir mientras se guarda no deja nada a medias, pero se avisa (spec §6.9).
  useEffect(() => {
    if (stage !== 'importing') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [stage])

  // Pide la vista previa. Si mientras tanto llegó otra petición, esta respuesta ya no vale (null).
  async function review(chosen: File, next: ImportOptions) {
    const id = ++latest.current
    const result = await settle(previewProductImport(requestData(chosen, next)))
    return id === latest.current ? result : null
  }

  async function chooseFile(chosen: File) {
    // Cada archivo empieza con las opciones por defecto: así la hoja «Para revertir» nunca se sube
    // con «No incluyen IGV» de una carga anterior, que sumaría el 18 % a los precios de antes.
    const next = DEFAULT_IMPORT_OPTIONS
    setFile(chosen)
    setOptions(next)
    setError(null)
    setRefreshing(false)
    setStage('reading')
    const result = await review(chosen, next)
    if (!result) return
    if (!result.ok) {
      setFile(null)
      setStage('choose')
      setError(result.error.code === 'UNEXPECTED' ? READ_FAILED : result.error.message)
      return
    }
    setPreview(result.data)
    setTab(defaultTab(result.data.counts))
    setStage('preview')
  }

  async function refresh(next: ImportOptions) {
    if (!file) return
    const previous = options
    setOptions(next)
    setRefreshing(true)
    const result = await review(file, next)
    if (!result) return
    setRefreshing(false)
    if (!result.ok) {
      setOptions(previous)
      toast.error(result.error.code === 'UNEXPECTED' ? READ_FAILED : result.error.message)
      return
    }
    setPreview(result.data)
    // Si la pestaña elegida se quedó vacía, se abre la que toca.
    if (tab !== 'all' && result.data.counts[tab] === 0) setTab(defaultTab(result.data.counts))
  }

  async function importNow() {
    if (!file) return
    setStage('importing')
    let result: ActionResult<ImportOutcome>
    try {
      result = await importProducts(requestData(file, options))
    } catch {
      // Lo que ya se haya importado sale «Sin cambios» en la vista previa nueva.
      setStage('preview')
      toast.error(CONNECTION_LOST)
      void refresh(options)
      return
    }
    if (result.ok) {
      setOutcome(result.data)
      setStage('done')
      // Productos, categorías e indicadores quedan al día al volver a la lista (spec §6.10).
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all })
      return
    }
    setStage('preview')
    // La base revirtió todo: no se guardó nada.
    if (result.error.code === 'UNEXPECTED') {
      toast.error(IMPORT_FAILED)
      return
    }
    toast.error(result.error.message)
    // El catálogo cambió desde la vista previa (otra pestaña, una categoría borrada): se revisa de nuevo.
    if (result.error.code === 'CONFLICT' || result.error.code === 'VALIDATION') void refresh(options)
  }

  function downloadExtra(kind: BarDownload) {
    if (!file) return
    const action = kind === 'simulation' ? downloadImportSimulation : downloadImportErrors
    void download(
      kind,
      () => action(requestData(file, options)),
      () => toast.success(kind === 'simulation' ? 'Simulación descargada' : 'Filas con errores descargadas'),
    )
  }

  // Vuelve a la zona de carga con el foco en ella, lista para elegir otro archivo.
  function startOver() {
    latest.current += 1
    flushSync(() => {
      setStage('choose')
      setFile(null)
      setPreview(null)
      setOutcome(null)
      setRefreshing(false)
      setError(null)
      setOptions(DEFAULT_IMPORT_OPTIONS)
    })
    document.getElementById('import-dropzone')?.focus()
  }

  if (stage === 'done' && outcome) {
    return (
      <div className="grid max-w-[1200px] gap-8">
        <ImportHeader />
        <ImportResult
          outcome={outcome}
          downloading={downloading}
          onErrors={() => downloadExtra('errors')}
          onAgain={startOver}
        />
      </div>
    )
  }

  if ((stage === 'preview' || stage === 'importing') && preview) {
    return (
      <div className="grid max-w-[1200px] gap-8">
        <ImportHeader />
        <PreviewStage
          preview={preview}
          options={options}
          tab={tab}
          refreshing={refreshing}
          importing={stage === 'importing'}
          downloading={downloading}
          onTab={setTab}
          onOptions={(next) => void refresh(next)}
          onChooseAnother={startOver}
          onDownload={downloadExtra}
          onImport={() => void importNow()}
        />
      </div>
    )
  }

  return (
    <div className="grid max-w-[1200px] gap-8">
      <ImportHeader />
      <IntentCards value={intent} onChange={setIntent} />
      <ImportSteps
        intent={intent}
        upload={
          <UploadStep
            file={file}
            status={stage === 'reading' ? 'Leyendo tu Excel…' : null}
            error={error}
            disabled={stage === 'reading'}
            onFile={(chosen) => void chooseFile(chosen)}
          />
        }
      />
      <ImportFaq />
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components && pnpm typecheck && pnpm lint`
Expected: PASS, con todas las pruebas de componentes (las de las tareas 9 a 12 siguen en verde).

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/import/components/import-result.tsx src/features/catalog/import/components/import-screen.tsx tests/components/import-screen.test.tsx
git commit -m "feat: preview, import and download the receipt from the bulk import screen"
```

---
### Task 14: Pruebas de punta a punta de la carga masiva

**Files:**
- Test: `tests/e2e/catalog-import.spec.ts`

**Interfaces:**
- Consumes: la pantalla completa (tareas 9 a 13), `connect` y `resetCatalog` (`tests/integration/db.ts`) y `login` (`tests/e2e/session.ts`).
- Produces: pruebas en PC y en móvil (los dos proyectos de `playwright.config.ts`).

- [ ] **Step 1: Escribir las pruebas**

`tests/e2e/catalog-import.spec.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { connect, resetCatalog } from '../integration/db'
import { login } from './session'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const TITLES = ['Código', 'Nombre', 'Descripción', 'Categoría', 'Precio con IGV (S/)']

async function seed() {
  const db = await connect()
  try {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string; name: string }>(
      "insert into public.categories (name) values ('Laptops'), ('Impresoras') returning id, name",
    )
    const id = (name: string) => rows.find((row) => row.name === name)!.id
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, description) values
         ('LAP-001', 'Laptop básica', $1, 1180.00, 'Core i3'),
         ('IMP-001', 'Impresora láser', $2, 590.00, 'Monocromática')`,
      [id('Laptops'), id('Impresoras')],
    )
  } finally {
    await db.end()
  }
}

async function product(code: string) {
  const db = await connect()
  try {
    const { rows } = await db.query<{
      name: string
      description: string | null
      price: string
      category: string
    }>(
      `select p.name, p.description, p.unit_price::text as price, c.name as category
         from public.products p join public.categories c on c.id = p.category_id
        where p.code = $1`,
      [code],
    )
    return rows[0] ?? null
  } finally {
    await db.end()
  }
}

// Un .xlsx como el que haría quien gestiona el catálogo: títulos en la fila 1 y una fila por producto.
async function workbook(rows: (string | number | null)[][], titles = TITLES) {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Productos')
  sheet.addRow(titles)
  for (const row of rows) sheet.addRow(row)
  return Buffer.from(await book.xlsx.writeBuffer())
}

const upload = (page: Page, buffer: Buffer, name = 'productos.xlsx') =>
  page.locator('input[type="file"]').setInputFiles({ name, mimeType: XLSX, buffer })

async function download(page: Page, button: string) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ])
  return file
}

async function readDownload(file: Download) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile((await file.path())!)
  return book
}

async function importAndConfirm(page: Page, button: string) {
  await page.getByRole('button', { name: button }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Importar' }).click()
  await expect(
    page.getByRole('heading', { name: '¡Listo! Tu catálogo está actualizado' }),
  ).toBeFocused()
}

const visibleText = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first()

// Nada se sale de la pantalla: ni la tabla, ni la maqueta de la plantilla, ni la barra fija.
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// Capturas para revisarlas a ojo en test-results/ (no se suben al repositorio).
const capture = (page: Page, name: string) =>
  page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true })

test('se entra desde Productos y cada intención descarga su archivo', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Carga masiva' }).click()
  await expect(page).toHaveURL('/products/import')
  await expect(page.getByRole('heading', { level: 1, name: 'Carga masiva de productos' })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await capture(page, 'pasos')

  // Con productos, propone actualizarlos: el botón principal es el catálogo completo.
  const catalog = await download(page, 'Descargar mi catálogo')
  expect(catalog.suggestedFilename()).toMatch(/^productos-\d{4}-\d{2}-\d{2}\.xlsx$/)
  await expect(page.getByText('Catálogo descargado · 2 productos')).toBeVisible()

  await page.getByText('Cargar productos nuevos').click()
  const template = await download(page, 'Descargar plantilla')
  expect(template.suggestedFilename()).toBe('plantilla-carga-masiva.xlsx')
  const book = await readDownload(template)
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Instrucciones', 'Productos', 'Categorías'])
})

test('un archivo mixto: decide la categoría, confirma, importa y deja el comprobante', async ({
  page,
}) => {
  await seed()
  await login(page)
  await page.goto('/products/import')
  await upload(
    page,
    await workbook([
      ['LAP-001', 'Laptop básica', 'Core i3', 'Laptops', 1298],
      ['IMP-001', 'Impresora láser', 'Monocromática', 'Impresoras', 590],
      ['MON-001', 'Monitor 24"', null, 'Monitores', 799],
      ['LAP-002', 'Laptop gamer', null, 'Laptps', 4999],
      ['BAD-001', 'Sin precio', null, 'Laptops', 'abc'],
    ]),
  )

  await expect(page.getByRole('heading', { name: 'Esto es lo que va a pasar' })).toBeFocused()
  await expect(page.getByRole('tab', { name: /Con errores/ })).toHaveAttribute('aria-selected', 'true')
  await expect(visibleText(page, /Precio: escribe solo números/)).toBeVisible()
  await expect(page.getByText('«Laptps» se parece a «Laptops». ¿Usar esa?', { exact: false })).toBeVisible()
  const importButton = page.getByRole('button', { name: 'Importar 3 productos' })
  await expect(importButton).toBeDisabled()
  await expectNoHorizontalScroll(page)
  await capture(page, 'vista-previa')

  await page.getByRole('button', { name: 'Usar "Laptops"' }).click()
  await expect(importButton).toBeEnabled()
  await importAndConfirm(page, 'Importar 3 productos')
  await expect(page.getByText('2 productos creados · 1 actualizado · 1 sin cambios · 1 categoría nueva')).toBeVisible()
  await expectNoHorizontalScroll(page)
  await capture(page, 'resultado')

  const receipt = await download(page, 'Descargar comprobante')
  expect(receipt.suggestedFilename()).toMatch(/^comprobante-importacion-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/)
  const book = await readDownload(receipt)
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Cambios', 'Para revertir'])

  expect(await product('LAP-001')).toMatchObject({ price: '1298.00' })
  expect(await product('LAP-002')).toMatchObject({ category: 'Laptops' })
  expect(await product('MON-001')).toMatchObject({ category: 'Monitores' })
  expect(await product('BAD-001')).toBeNull()

  await page.getByRole('link', { name: 'Ver productos' }).click()
  await expect(page).toHaveURL('/products?dateBy=updated&date=today&sort=updated')
  await expect(
    page.getByRole('region', { name: 'Lista de productos' }).getByText('Laptop gamer').filter({ visible: true }),
  ).toBeVisible()
})

test('solo Código y Precio: actualiza los precios y no toca lo demás', async ({ page }) => {
  await seed()
  await login(page)
  await page.goto('/products/import')
  await upload(
    page,
    await workbook(
      [
        ['lap-001', '1,250.50'],
        ['IMP-001', 'S/ 600'],
      ],
      ['Código', 'Precio con IGV (S/)'],
    ),
  )
  await expect(
    page.getByText(
      'Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios. El resto de los datos se mantiene.',
    ),
  ).toBeVisible()
  await importAndConfirm(page, 'Importar 2 productos')
  expect(await product('LAP-001')).toEqual({
    name: 'Laptop básica',
    description: 'Core i3',
    price: '1250.50',
    category: 'Laptops',
  })
  expect(await product('IMP-001')).toMatchObject({ name: 'Impresora láser', price: '600.00' })
})

test('la hoja «Para revertir» del comprobante deja los productos como estaban', async ({ page }) => {
  await seed()
  await login(page)
  await page.goto('/products/import')
  await upload(page, await workbook([['LAP-001', 'Laptop básica 2', 'Core i5', 'Laptops', 1416]]))
  await importAndConfirm(page, 'Importar 1 producto')
  const receipt = await download(page, 'Descargar comprobante')
  expect(await product('LAP-001')).toMatchObject({ name: 'Laptop básica 2', price: '1416.00' })

  await page.getByRole('button', { name: 'Hacer otra carga' }).click()
  await upload(page, await readFile((await receipt.path())!), receipt.suggestedFilename())
  await expect(page.getByRole('heading', { name: 'Esto es lo que va a pasar' })).toBeFocused()
  await importAndConfirm(page, 'Importar 1 producto')
  expect(await product('LAP-001')).toEqual({
    name: 'Laptop básica',
    description: 'Core i3',
    price: '1180.00',
    category: 'Laptops',
  })
})

test('un archivo que no sirve explica qué hacer y deja elegir otro', async ({ page }) => {
  await seed()
  await login(page)
  await page.goto('/products/import')
  const alert = page.getByRole('alert').filter({ hasText: /\S/ })

  await upload(page, Buffer.from('codigo,precio\nLAP-001,10'), 'productos.csv')
  await expect(alert).toHaveText(
    'Ese archivo no es un Excel .xlsx. Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)".',
  )

  await upload(page, await workbook([['Laptop', 10]], ['Nombre', 'Precio']))
  await expect(alert).toHaveText('Falta la columna Código: es la que identifica cada producto.')
  await expect(page.getByRole('button', { name: /Arrastra tu Excel/ })).toBeEnabled()
})
```

- [ ] **Step 2: Ejecutarlas**

Run: `pnpm exec playwright test tests/e2e/catalog-import.spec.ts`
Expected: PASS en `desktop` y en `mobile` (10 pruebas). Si alguna falla, el fallo es de la pantalla o del servicio: se depura con superpowers:systematic-debugging, sin aflojar la prueba.

- [ ] **Step 3: Revisar las capturas**

Abre `test-results/catalog-import-*/pasos.png`, `vista-previa.png` y `resultado.png` de `desktop` y `mobile`.

Expected:
- ningún texto cortado ni encimado;
- la barra fija no tapa la paginación ni el último bloque;
- en móvil la barra ocupa dos filas cortas;
- los pasos 1 y 2 se ven equilibrados en PC.

Lo que no se vea bien se corrige con una prueba que lo atrape (como en la fase 1) y se apunta como `Ruling:` en el registro.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/catalog-import.spec.ts
git commit -m "test: cover the bulk import end to end on desktop and mobile"
```

---

### Task 15: Documentación y verificación completa

**Files:**
- Modify: `docs/setup.md`, `docs/deployment.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la guía de uso y de publicación de la carga masiva.

- [ ] **Step 1: Documentar la carga masiva**

En `docs/setup.md`, añade al final:

```markdown
## Carga masiva desde Excel

En **Productos → Carga masiva** (`/products/import`) se crean y actualizan muchos productos a la vez:

1. Descarga la plantilla (productos nuevos) o tu catálogo (para cambiar los que ya tienes).
2. Complétalo en Excel. Solo la columna **Código** es obligatoria: si el código ya existe, se actualiza ese producto; las columnas que no vengan se quedan como están.
3. Súbelo y revisa la vista previa: qué se crea, qué cambia, qué se ignora y por qué.
4. Importa. Es todo o nada: si algo falla, no se guarda nada. Nunca se borran productos.

Al terminar se descarga un **comprobante**. Su hoja «Para revertir» trae los valores anteriores de los productos actualizados: súbela en Carga masiva para dejarlos como estaban.

Límites: archivos `.xlsx` de hasta 4 MB y 5 000 productos (`src/features/catalog/import/options.ts`).
```

En `docs/deployment.md`:
- En la lista de migraciones, añade `supabase/migrations/202610030001_product_import.sql`: las funciones `product_import_plan`, `preview_product_import` e `import_products`, solo para usuarios con sesión.
- En las comprobaciones después de publicar, añade:

```markdown
- **Carga masiva:** en `/products/import`, descarga la plantilla y sube un archivo de prueba con un producto nuevo. La vista previa debe mostrarlo como «Nuevo». No lo importes en producción si no es un producto real.
```

- [ ] **Step 2: Verificación completa**

Run:
- `pnpm validate`
- `pnpm test:integration`
- `pnpm test:e2e`

Expected: PASS en todo. `pnpm validate` incluye lint, tipos, formato, pruebas unitarias y de componentes en UTC, y el build de producción.

- [ ] **Step 3: Comprobar qué lleva cada lado**

Run:
- `node -e "const t=require('./.next/server/app/(private)/products/import/page.js.nft.json');const f=t.files.join('\n');console.log(/exceljs/.test(f), /ventronix-logo-proforma/.test(f))"`
- `grep -rl "xl/worksheets" .next/static/chunks | wc -l`

Expected:
- `true true`: la función de la ruta lleva ExcelJS y el logotipo;
- `0`: ExcelJS no llega al navegador; la pantalla solo envía el archivo.

- [ ] **Step 4: Commit**

```bash
git add docs/setup.md docs/deployment.md
git commit -m "docs: explain the bulk import and its deployment checks"
```

---

## Revisiones del plan

Cinco pasadas sobre el plan completo, cada una con un enfoque. Lo encontrado ya está aplicado en las tareas indicadas. Lo descartado va al final, con su motivo.

### Revisión 1: cobertura de la spec, tipos e interfaces

| Hallazgo | Cambio | Tareas |
| --- | --- | --- |
| `templateTitles` vivía en `template.ts`, que carga ExcelJS y es solo del servidor, pero la guía del paso 2 muestra los mismos títulos en el navegador. | Pasa a `import/options.ts`; la plantilla, los Excel de la importación y la guía la importan de ahí. `TEMPLATE_COLUMNS` desaparece: era igual a `IMPORT_COLUMNS`. | 2, 5, 6, 11 |
| Los pasos usaban `count`, `plural` y `fileSize`, que nacían en una tarea posterior. | Se intercambian: la tarea 10 crea `format.ts` y la vista previa, y la 11 los pasos. | 10, 11 |
| `SummaryCards` recibía `RowStatus` (con «omitida») y la tabla usaba `RowTab`. | `ROW_TABS` y `RowTab` nacen en la tarea 10 y los dos componentes los comparten. | 10, 12 |
| `VisualSummary` declaraba un tipo igual a `PriceTrend`. | Usa `PriceTrend`. | 10 |
| Cuando la pantalla importa las acciones del servidor, la prueba de la tarea 9 cargaría Supabase y ExcelJS. | La tarea 11 simula las seis acciones en esa prueba, así que la tarea 13 ya no la toca. | 11 |
| Una respuesta preparada con `mockResolvedValueOnce` que nadie consumía podía pasar a la prueba siguiente. | `vi.resetAllMocks()` después de cada prueba. | 11, 13 |
| La spec pide `bodySizeLimit: '4mb'`, pero según la documentación de Next 16 el límite cuenta también lo que añade el FormData. | `'4.5mb'`, lo que admite Vercel; el archivo sigue limitado a 4 MB. Se corrige la spec. | 8 |
| Cobertura de la spec. | §6.1–§6.11, §8, §9.1–§9.4, §10–§13 y §15 tienen tarea y prueba. | — |

### Revisión 2: en el lugar de quien gestiona el catálogo

Recorrido revisado:
1. entra desde Productos y elige qué quiere hacer;
2. descarga, completa en Excel y sube;
3. revisa, decide las categorías e importa;
4. descarga el comprobante, ve los productos y, si hace falta, revierte.

| Situación | Antes | Ahora | Tareas |
| --- | --- | --- | --- |
| Sube su catálogo completo (2 000 filas) con 5 precios cambiados. | La tabla se abría en «Todas»: los 5 cambios quedaban entre 1 995 filas sin cambios. | Se abre en Con errores, Para revisar, Se actualizan, Nuevos y, por último, Todas. | 12 |
| Edita «Valor sin IGV (S/)» del reporte creyendo que es el precio. | Se ignoraba en silencio: todo salía «Sin cambios». | Aviso: «La columna «Valor sin IGV (S/)» no se importa: los precios se cambian en «Precio con IGV (S/)».» | 2, 3, 7, 13 |
| Hay filas «Para revisar». | Solo la tarjeta decía que se importan igual. | Un aviso ámbar dice que se importarán igual y, como la importación es todo o nada, que una fila incorrecta se corrige en el Excel. | 12, 13 |
| Escribe mal un precio. | «Precio: el precio no puede pasar de…» | «Precio: no puede pasar de 9,999,999,999.99.»: los mensajes ya no repiten la columna. Lo mismo con «Debe ser mayor que cero.», «Tiene más de dos decimales.», los decimales del código y las fórmulas sin calcular. | 2, 4 |
| Suelta el archivo fuera de la zona, o encima de la vista previa. | El navegador lo abría o lo descargaba. | Se ignora en todas las etapas de la pantalla. | 11, 13 |
| Quiere otro archivo desde la vista previa. | Dos botones con nombres distintos («Cambiar archivo» y «Elegir otro archivo») para lo mismo. | Uno solo, «Elegir otro archivo», en la barra. «Cambiar archivo» queda en el chip del paso 3, que abre el selector. | 13 |
| Pulsa una tarjeta del resumen. | La pestaña cambiaba lejos, fuera de la vista. | Además lleva a la tabla, sin animación si se pidió menos movimiento. | 13 |
| Descarga su catálogo con más de 5 000 productos. | El archivo no se podría subir entero. | Aviso: dividir el archivo antes de subirlo. | 11 |
| Lee los títulos de los pasos. | «Complétala» y «Súbela», mientras el paso 1 decía «el archivo». | «Complétalo» (o «Cambia lo que necesites» si actualiza) y «Súbelo». | 11 |
| Espera la importación. | — | La barra dice «Guardando: no cierres esta página.» y el navegador avisa si intenta salir. | 12, 13 |

### Revisión 3: rendimiento y escalabilidad

| Punto | Decisión | Tareas |
| --- | --- | --- |
| La búsqueda filtra hasta 5 000 filas en cada tecla. | `useDeferredValue`: escribir nunca se traba y la tabla se pone al día después. | 12 |
| Tabla. | 50 filas por página; solo se monta la pestaña activa; la cifra de cada pestaña sale de `counts`, sin filtrar. | 12 |
| Base de datos. | Una llamada por vista previa y una por importación, por conjuntos. Los nombres repetidos se buscan con una agregación y un hash join; las categorías, por su índice de expresión. | 1 |
| Prueba de escala. | Prueba de integración nueva: 5 000 filas leídas, revisadas e importadas en menos de 15 s. La spec espera menos de 3 s por paso; el margen evita fallos en equipos lentos, y un recorrido fila por fila tardaría minutos. | 7 |
| Peso de las respuestas. | La vista previa de 5 000 filas ronda 1,5–2 MB de JSON, bajo los 4,5 MB de Vercel. El comprobante llega en la misma respuesta de la importación. | 7, 8 |
| Navegador. | ExcelJS nunca llega al navegador: la tarea 15 comprueba que ningún chunk lo trae. | 15 |
| Tiempo límite de la base. | Supabase corta las consultas de `authenticated` a los 8 s; 5 000 filas tardan mucho menos, y la prueba de escala lo vigila. | 1, 7 |
| Límites. | `IMPORT_MAX_ROWS`, `IMPORT_MAX_BYTES` y `PRICE_CHANGE_WARNING` en un solo archivo, para ajustarlos si el negocio crece. | 2 |

### Revisión 4: robustez, casos límite y seguridad

| Caso | Qué pasaba | Cambio | Tareas |
| --- | --- | --- | --- |
| Sube la hoja «Para revertir» justo después de importar con «No incluyen IGV». | La opción seguía marcada y sumaba el 18 % a los precios anteriores. | Cada archivo nuevo empieza con las opciones por defecto. | 13 |
| Se corta la red mientras importa. | «No se importó nada…», aunque la base pudo haber guardado. | Un mensaje honesto y una nueva revisión del archivo: lo ya importado sale «Sin cambios». «No se importó nada» queda para cuando la base revirtió. | 13 |
| La app se actualiza con la pantalla abierta. | Las acciones viejas fallan y el mensaje solo hablaba de la conexión. | El mensaje añade «si sigue fallando, recarga la página». | 13 |
| Códigos copiados de una web o un PDF (`LAP-001` con un espacio de ancho cero). | Se veían iguales, pero creaban otro producto. | Se quitan los caracteres invisibles y las tildes se unen a su letra (NFC). | 2 |
| Corrige en el archivo de errores un código como «00123». | Excel podía convertirlo en 123. | La columna Código va como texto, igual que en la plantilla. | 6 |
| Una categoría llamada «constructor» o «toString». | Se leía el prototipo del mapa de decisiones. | Solo cuentan las decisiones enviadas (`Object.hasOwn`). | 7 |
| La sesión vence a mitad del recorrido. | Tras el error se pedía otra vez la vista previa, con un segundo error igual. | Solo se vuelve a revisar con CONFLICT o VALIDATION. | 13 |

Casos ya cubiertos, comprobados en esta revisión:
- respuestas que llegan en otro orden, o un archivo nuevo mientras se revisa el anterior: un contador ignora las respuestas viejas (tarea 13);
- dos importaciones a la vez: el error 23505 no guarda nada y da un mensaje claro (tareas 1 y 7);
- categoría de destino borrada antes de importar: CONFLICT y nueva revisión (tareas 7 y 13);
- doble clic en «Importar»: el botón se desactiva y la importación es idempotente (tareas 1 y 12);
- fórmulas en los textos: se escriben como texto (tarea 6);
- un ZIP enorme al descomprimir: 4 MB, 5 000 filas y solo la cuenta dueña sube archivos (tareas 3 y 8).

### Revisión 5: accesibilidad, móvil, diseño y pruebas

| Punto | Cambio o comprobación | Tareas |
| --- | --- | --- |
| Barra fija en el teléfono. | Con tres botones de texto ocupaba cuatro filas. Ahora los secundarios muestran solo su icono (el nombre sigue para los lectores de pantalla y como `title`): dos filas cortas. | 12 |
| Desbordes. | Las e2e comprueban, en PC y en móvil, que nada se sale de la pantalla en los pasos, la vista previa y el resultado. | 14 |
| Revisión visual. | Las e2e guardan capturas de cada etapa en `test-results/` y un paso las revisa a ojo, como en la fase 1. | 14 |
| Foco y anuncios. | El foco va al título de la vista previa y al del resultado, con `scroll-mt` para la cabecera del móvil. «Leyendo…», «Revisando N filas…» y la barra van en regiones vivas; los errores de archivo, con `role="alert"`. | 11, 12, 13 |
| Color. | Estados con icono y texto, barras con su cifra, etiquetas «nueva» y «¿parecida?». | 10, 12 |
| Movimiento. | Giros, fundido y check solo con `motion-safe`. | 10–13 |
| Teclado. | Pestañas con flechas (Radix). Los títulos de la maqueta son botones con su regla en `aria-describedby`. La zona de carga es un `button` real. | 11, 12 |
| Pruebas. | Cada capa con las suyas: <ul><li>unitarias: celdas, lector, validación, categorías, plantilla, archivos y textos;</li><li>integración: SQL, servicio y 5 000 filas;</li><li>componentes: cada pieza y el recorrido completo;</li><li>e2e en PC y en móvil.</li></ul> | 1–14 |

### Considerado y descartado por ahora

| Idea | Por qué no ahora |
| --- | --- |
| Guardar en el servidor el archivo ya leído, para no reenviarlo con cada opción. | Un Excel típico pesa 100–400 KB y cada revisión tarda menos de un segundo. Haría falta un almacenamiento temporal; se revisa si los archivos crecen. |
| Leer el Excel en el navegador. | Metería ExcelJS (~1 MB) en el navegador, y el servidor tendría que leerlo igual: no se confía en el navegador. |
| Más de 5 000 filas en varias tandas. | Rompe el «todo o nada». El aviso de dividir el archivo cubre el caso. |
| Excluir filas sueltas desde la vista previa. | Rompe el «todo o nada» y complica el comprobante. Se corrige en el Excel, y el aviso lo explica. |
| Historial de importaciones. | Exige una tabla nueva (spec §16); el comprobante cumple esa función. |
| Comprobar el tamaño descomprimido del ZIP. | Solo la cuenta dueña sube archivos, y el límite de 4 MB acota el riesgo. |
| La intención en la URL, con nuqs. | La pantalla depende de un archivo en memoria: la URL no podría restaurarla. |
