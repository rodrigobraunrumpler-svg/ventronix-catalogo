# Catálogo privado y proformas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar primero un catálogo privado de categorías y productos para una persona en Vercel, y conducir las siguientes entregas hasta proforma, documento y envío por WhatsApp sin inventar requisitos.

**Architecture:** Una aplicación Next.js con App Router y módulos de autenticación y catálogo. Supabase proporciona Auth y PostgreSQL con RLS; TanStack Query consulta datos y ejecuta mutaciones mediante Server Actions que validan con Zod. Proformas, generación de documentos e integración de WhatsApp se incorporan después de sus definiciones, como responsabilidades separadas.

**Tech Stack:** Next.js 16, Node.js 24.x, TypeScript, pnpm, Tailwind CSS, shadcn/ui, Supabase/PostgreSQL, React Hook Form, Zod, TanStack Query, nuqs, fetch, Sonner, date-fns, ESLint, Prettier, Husky, lint-staged, Vitest, React Testing Library y Playwright.

## Global Constraints

Restricciones textuales del [contexto original](../../../PROJECT_CONTEXT.md):

- «No crear un backend independiente.»
- «No agregar Axios.»
- «No utilizar Moment.js.»
- «Ningún secreto debe exponerse al cliente.»
- «Los datos recibidos por Server Actions deben validarse también en el servidor mediante schemas de Zod.»
- «NO inventar todavía el diseño ni el modelo definitivo de la proforma.»
- «Las proformas NO se deben persistir como historial permanente en el MVP.»
- «No modificar el catálogo de productos desde una proforma.»
- «Mantener el sistema simple hasta que exista una necesidad real de complejidad.»

Restricciones de la conversación: una persona, catálogo privado, alojamiento en Vercel. No se requieren un catálogo público, administración de usuarios ni más campos de producto.

Diseño que complementa este plan: [Diseño del catálogo](../specs/2026-09-29-catalogo-design.md). Su tabla de supuestos distingue propuestas de requisitos confirmados. PEN sigue siendo una hipótesis de moneda, no una decisión comercial confirmada.

---

## 1. Cómo ejecutar y qué queda cubierto

Este es el plan maestro de entregas y el desglose técnico del catálogo. Las tareas 1–8 describen la primera aplicación utilizable; las tareas 9–11 son entregas de definición con resultados concretos que permiten escribir los planes de implementación de proformas, documentos y WhatsApp con requisitos reales.

No ejecutar las etapas de definición como si ya existieran modelos o plantillas aprobadas. Las referencias a archivos de fases futuras describen artefactos de esas fases, no archivos creados durante esta planificación.

Estado inicial observado: el workspace contiene `PROJECT_CONTEXT.md` y metadatos del entorno; no hay `package.json`, aplicación ni Git operativo. No reemplazar `.git`, `.agents` ni `.codex`. Al iniciar implementación, detectar de nuevo si el entorno proporciona un checkout/worktree; usarlo si existe. Si Git sigue sin estar disponible, mantener los cambios revisables sin fingir commits.

No se necesitan nuevas preguntas sobre cantidad de usuarios o alojamiento. Las decisiones propuestas se documentan y las correcciones posteriores se aplican a la tarea afectada.

## 2. Entregas y dependencias

| Entrega | Tareas | Resultado verificable |
| --- | --- | --- |
| A. Base y reglas | 1–2 | Aplicación base, validaciones y esquema reproducible. |
| B. Acceso privado | 3 | Solo la cuenta autorizada puede consultar y modificar datos. |
| C. Categorías | 4 | Crear, editar y eliminar categorías vacías. |
| D. Productos | 5–6 | Catálogo con formularios, búsqueda, filtro y paginación. |
| E. Viabilidad de WhatsApp | 7, en paralelo con C–D | Informe de compatibilidad y decisión técnica fundamentada. |
| F. Catálogo publicado | 8 | Flujos probados y despliegue privado revisado. |
| G. Proformas | 9 | Diseño funcional, ejemplos de cálculo y plan específico. |
| H. Documento | 10 | Plantilla validada y plan de generación/descarga. |
| I. WhatsApp | 11 | Proveedor y flujo de envío definidos para su implementación. |

Dependencia principal: `1 → 2 → 3 → 4 → 5 → 6 → 8`. La tarea 7 puede avanzar después de la 1 sin bloquear el catálogo. Después: `9 → 10 → 11`, utilizando también el resultado de la 7.

Cada tarea de implementación termina con revisión de sus criterios y comprobaciones pertinentes. Hacer commits pequeños cuando exista un repositorio operativo. La ejecución con subagentes puede separar unidades independientes; migraciones, contratos compartidos e integración se coordinan de forma secuencial.

## 3. Mapa de archivos de la primera entrega

```text
src/
  app/
    layout.tsx                         # Tipografía, idioma y providers
    page.tsx                           # Entrada y redirección
    globals.css                        # Tokens de diseño
    login/page.tsx                     # Composición de pantalla de acceso
    (private)/
      layout.tsx                       # Acceso y navegación
      error.tsx                        # Recuperación de errores
      loading.tsx                      # Carga de navegación
      products/page.tsx                # Pantalla única: categorías + productos
  components/
    ui/                                # Componentes shadcn utilizados
    app-shell.tsx                      # Navegación y contenedor responsive
    app-providers.tsx                  # QueryClient, NuqsAdapter y Sonner
  features/
    auth/
      schemas.ts
      actions.ts
      components/login-form.tsx
      components/sign-out-button.tsx
    catalog/
      types.ts                         # DTO y contratos del catálogo
      schemas.ts                       # Entradas de categorías/productos
      search-params.ts                  # Parsers de URL y validación
      query-keys.ts                     # Claves e invalidación coherentes
      money.ts                         # Normalización y presentación
      search-pattern.ts                # Patrón de búsqueda literal seguro
      categories/
        queries.ts                     # Lecturas y opciones
        actions.ts                     # Mutaciones de servidor
        repository.ts                  # Acceso servidor a PostgreSQL
        hooks.ts
        theme.ts                       # Color determinista por ID
        components/category-panel.tsx  # Tarjeta Categorías y filtro
        components/category-form.tsx   # Diálogo crear/renombrar
        components/delete-category-dialog.tsx
      products/
        queries.ts
        actions.ts
        repository.ts
        hooks.ts
        components/product-list.tsx
        components/product-filters.tsx
        components/product-form.tsx
        components/product-sheet.tsx   # Panel lateral de alta/edición
        components/delete-product-dialog.tsx
  lib/
    auth/require-owner.ts               # Autorización servidor reutilizable
    supabase/client.ts
    supabase/server.ts
    supabase/proxy.ts
    supabase/database.types.ts          # Generado desde migraciones
    action-result.ts                   # Resultado serializable
    env.ts                             # Validación de configuración
    utils.ts                           # Utilidad visual cn de shadcn
  proxy.ts                             # Renovación SSR de sesión
supabase/
  migrations/
    202609290001_catalog.sql
    202609290002_catalog_access.sql
tests/
  setup.ts
  unit/catalog-schemas.test.ts
  unit/catalog-search.test.ts
  unit/catalog-money.test.ts
  components/login-form.test.tsx
  components/category-form.test.tsx
  components/product-form.test.tsx
  integration/catalog-database.test.ts
  integration/catalog-access.test.ts
  integration/catalog-actions.test.ts
  e2e/auth.spec.ts
  e2e/catalog.spec.ts
docs/
  setup.md
  deployment.md
  decisions/whatsapp-vercel-feasibility.md
```

Solo crear archivos conforme sus tareas los necesiten. No crear carpetas vacías de proformas, PDF o WhatsApp ni instalar sus librerías anticipadamente.

## 4. Contratos que deben mantener las tareas

El plan utiliza nombres uniformes para que una tarea pueda consumir el resultado de otra. Este bloque fija la forma de datos; no añade columnas al esquema.

`src/lib/action-result.ts`:

```ts
export type ActionErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'CATEGORY_IN_USE'
  | 'NOT_FOUND'
  | 'UNEXPECTED'

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        code: ActionErrorCode
        message: string
        fieldErrors?: Record<string, string[]>
      }
    }
```

`src/features/catalog/types.ts`:

```ts
export type Category = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type CategoryOption = Pick<Category, 'id' | 'name'>
export type CategoryInput = { name: string }

export type ProductInput = {
  code: string
  name: string
  description: string | null
  category_id: string
  unit_price: string
}

export type Product = ProductInput & {
  id: string
  created_at: string
  updated_at: string
}

export type ProductListItem = Product & { category_name: string }
export type ProductFilters = {
  search: string
  category: string | null
  page: number
}

export type ProductPage = {
  items: ProductListItem[]
  total: number
  page: number
  pageSize: 20
}
```

`src/features/catalog/query-keys.ts`:

```ts
import type { ProductFilters } from './types'

export const catalogKeys = {
  all: ['catalog'] as const,
  categories: ['catalog', 'categories'] as const,
  categoryOptions: ['catalog', 'category-options'] as const,
  products: ['catalog', 'products'] as const,
  productList: (filters: ProductFilters) =>
    ['catalog', 'products', 'list', filters] as const,
  product: (id: string) => ['catalog', 'products', 'detail', id] as const,
}
```

Las Actions aceptan `unknown` en su frontera y devuelven `ActionResult`; nunca confían en que un tipo TypeScript valide una petición.

El tipo de contexto de autorización se exporta desde `src/lib/auth/require-owner.ts`, junto al helper. `Database` se genera en la tarea 3 desde las migraciones:

```ts
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type AuthorizedContext = {
  user: User
  supabase: SupabaseClient<Database>
}
```

| Módulo | Interfaces producidas |
| --- | --- |
| Auth servidor | `requireOwner(): Promise<AuthorizedContext>`; contexto con `user` verificado y cliente Supabase de esa sesión. |
| Auth Actions | `signIn(input: unknown): Promise<ActionResult<null>>`; `signOut(): Promise<ActionResult<null>>`. |
| Categorías consultas | `listCategories(): Promise<Category[]>`; `listCategoryOptions(): Promise<CategoryOption[]>`. |
| Categorías Actions | `createCategory(input: unknown): Promise<ActionResult<Category>>`; `updateCategory(id: unknown, input: unknown): Promise<ActionResult<Category>>`; `deleteCategory(id: unknown): Promise<ActionResult<null>>`. |
| Productos consultas | `listProducts(filters: ProductFilters): Promise<ProductPage>`; `getProduct(id: string): Promise<ProductListItem \| null>`. |
| Productos Actions | `createProduct(input: unknown): Promise<ActionResult<Product>>`; `updateProduct(id: unknown, input: unknown): Promise<ActionResult<Product>>`; `deleteProduct(id: unknown): Promise<ActionResult<null>>`. |

Las consultas devuelven datos o lanzan errores interpretables por TanStack Query. Las mutaciones devuelven errores serializables; comprobar `ok` antes de invalidar, navegar o mostrar éxito. No mezclar redirecciones de Next.js con un `catch` que las convierta en error genérico.

## Tarea 1. Aplicación base, herramientas y navegación

**Archivos:** `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.env.example`, `.husky/pre-commit`, `components.json`, `vitest.config.ts`, `playwright.config.ts`, `tests/setup.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/app-providers.tsx`, `src/components/app-shell.tsx`, `docs/setup.md`.

**Consume:** el contexto, este diseño y el entorno de ejecución disponible.

**Produce:** aplicación Next.js arrancable, providers, navegación, scripts comunes y herramientas de pruebas.

- [ ] Detectar el repositorio/worktree y las versiones instaladas. Preservar los documentos y metadatos del workspace. Si el generador rechaza la carpeta por no estar vacía, generar en una carpeta temporal y trasladar únicamente archivos de aplicación revisados.
- [ ] Crear Next.js 16 estable con TypeScript estricto, App Router, carpeta `src`, alias `@/*`, Tailwind y ESLint. Fijar Node `24.x` y registrar la versión exacta de pnpm en `packageManager`. Mantener lockfile.
- [ ] Añadir solo dependencias de esta entrega: shadcn/ui y sus componentes necesarios, TanStack Query, React Hook Form y resolvers, Zod, nuqs, Supabase JS/SSR, Sonner y date-fns. Añadir herramientas de calidad y pruebas del stack. No instalar librerías de PDF, WhatsApp, ORM ni gestores globales de estado.
- [ ] Configurar providers con un QueryClient estable en cliente y NuqsAdapter de App Router; definir idioma `es`, estilos base, foco visible y menú lateral con el único destino Productos. Aplicar la dirección visual del diseño (apartado 7): Plus Jakarta Sans y JetBrains Mono con `next/font`, tokens de color como variables del tema de shadcn/ui e íconos lucide-react.
- [ ] Configurar los scripts siguientes; `test:integration` solo se ejecuta con el entorno de pruebas descrito en `docs/setup.md`. `validate` se mantiene independiente de credenciales externas.

```json
{
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "next typegen && tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run --project unit --project components",
    "test:integration": "vitest run --project integration",
    "test:e2e": "playwright test",
    "validate": "pnpm lint && pnpm typecheck && pnpm format:check && pnpm test && pnpm build",
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,tsx,js,mjs}": ["eslint --fix", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

- [ ] Configurar Vitest con proyectos `unit`, `components` e `integration`, separados por las rutas del mapa. `components` usa jsdom y `tests/setup.ts` carga `@testing-library/jest-dom/vitest`; unit e integration usan Node. No añadir pruebas vacías para simular cobertura.
- [ ] Configurar Playwright con ejecución de la aplicación local y proyectos Chromium de escritorio y móvil. El entorno y datos de E2E serán exclusivos de pruebas.
- [ ] Habilitar Husky/lint-staged cuando el checkout tenga Git. Documentar la condición si sigue sin haberlo. Incorporar Commitlint solo si se adopta Conventional Commits, sin bloquear la app por una convención aún inexistente.
- [ ] Documentar instalación, variables, arranque y comandos en `docs/setup.md`.

**Verificar:** `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, `pnpm dev`. Esperado: salida cero de las comprobaciones disponibles, página base visible y navegación utilizable a 1440 y 390 px. Ejecutar suites cuando las tareas siguientes hayan incorporado sus pruebas reales.

**Cierre:** base reproducible sin datos ficticios de negocio en producción. Commit sugerido: `chore: initialize catalog application`.

## Tarea 2. Reglas, schemas y migración del catálogo

**Archivos:** `src/features/catalog/types.ts`, `schemas.ts`, `money.ts`, `query-keys.ts`, `src/lib/action-result.ts`, `supabase/migrations/202609290001_catalog.sql`, `tests/unit/catalog-schemas.test.ts`, `tests/unit/catalog-money.test.ts`, `tests/integration/catalog-database.test.ts`.

**Consume:** herramientas de la tarea 1 y supuestos de la especificación.

**Produce:** DTO del apartado 4; `categorySchema`, `productSchema`, `unitPriceSchema`, `idSchema`; esquema de datos con invariantes reproducibles.

- [ ] Escribir primero pruebas de negocio para nombres vacíos, código normalizado, descripción vacía, UUID inválido y precio. Ejecutarlas y comprobar que fallan por la ausencia de implementación.
- [ ] Implementar schemas puros importables en cliente y servidor. Separar valor de formulario y salida normalizada cuando Zod transforme datos. No aceptar timestamps ni ID de creación desde el formulario.

Ejemplo concreto de contrato de precio y su prueba, para evitar conversiones ambiguas:

```ts
// src/features/catalog/money.ts
import { z } from 'zod'

export const unitPriceSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/, 'Usa hasta dos decimales, sin miles')
  .transform((value) => {
    const [whole, fraction = ''] = value.replace(',', '.').split('.')
    return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`
  })
  .refine((value) => BigInt(value.replace('.', '')) > BigInt(0), {
    message: 'El precio debe ser mayor que cero',
  })
```

```ts
// tests/unit/catalog-money.test.ts
import { describe, expect, it } from 'vitest'
import { unitPriceSchema } from '@/features/catalog/money'

describe('precio unitario', () => {
  it.each([
    ['125', '125.00'],
    [' 125,5 ', '125.50'],
    ['0001.05', '1.05'],
    ['0.01', '0.01'],
    ['9999999999.99', '9999999999.99'],
  ])('normaliza %s', (input, expected) => {
    expect(unitPriceSchema.parse(input)).toBe(expected)
  })

  it.each(['', '0', '0.00', '-1', '1.999', '1,000.00', '1e3', 'NaN', '10000000000'])
    ('rechaza %s', (input) => {
      expect(unitPriceSchema.safeParse(input).success).toBe(false)
    })
})
```

- [ ] Crear las dos tablas con los campos exactos del contexto. Para `unit_price`, usar `numeric` con `CHECK (unit_price > 0 AND unit_price < 10000000000 AND unit_price = round(unit_price, 2))`, además de `NOT NULL`. Esto rechaza fracciones fuera de dos decimales sin redondearlas antes de validar.
- [ ] Crear UUID por defecto, timestamps y trigger de actualización de `updated_at`. Limitar nombres a 120, código a 64 y descripción a 2000 caracteres; aplicar `btrim` para validación de campos obligatorios. Exigir código igual a su forma `upper(btrim(code))`.
- [ ] Crear índice único de categoría normalizada, unicidad de código, FK con `ON DELETE RESTRICT` e índice de categoría. No añadir un campo `active`, borrado lógico ni nuevas tablas.
- [ ] Aplicar la migración sobre una base vacía de pruebas. Verificar restricciones con consultas directas, incluyendo dos inserciones concurrentes del mismo código: una puede tener éxito y la otra debe fallar sin sobrescribir.
- [ ] Probar duplicados al crear y editar, límite decimal, precio cero/negativo, categoría inexistente, eliminación restringida y modificación de `updated_at`.

**Verificar:** `pnpm test -- tests/unit/catalog-schemas.test.ts tests/unit/catalog-money.test.ts` y `pnpm test:integration -- tests/integration/catalog-database.test.ts`. Esperado: casos de normalización y restricciones pasan; migración recreable sin pasos manuales ocultos.

**Cierre:** reglas iguales en UI, servidor y base de datos en lo que corresponde a cada capa. Commit sugerido: `feat: define catalog data rules`.

## Tarea 3. Acceso privado, clientes Supabase y RLS

**Archivos:** `src/lib/env.ts`, `src/lib/supabase/client.ts`, `server.ts`, `proxy.ts`, `database.types.ts`, `src/proxy.ts`, `src/lib/auth/require-owner.ts`, `src/features/auth/schemas.ts`, `actions.ts`, `components/login-form.tsx`, `components/sign-out-button.tsx`, `src/app/login/page.tsx`, `src/app/page.tsx`, `src/app/(private)/layout.tsx`, `supabase/migrations/202609290002_catalog_access.sql`, `.env.example`, `tests/components/login-form.test.tsx`, `tests/integration/catalog-access.test.ts`, `tests/e2e/auth.spec.ts`, `docs/setup.md`.

**Consume:** tablas de la tarea 2 y un Supabase de desarrollo/pruebas.

**Produce:** `requireOwner`, `signIn` y `signOut` del apartado 4; permisos que protegen también acceso directo a datos.

- [ ] Escribir pruebas de acceso para sesión ausente, usuario autorizado, usuario autenticado sin autorización y usuario que falsifica `user_metadata.catalog_access`. Ninguno de los tres casos no autorizados puede leer o modificar filas.
- [ ] Crear clientes SSR/navegador con URL y clave publicable. Validar configuración en sus fronteras; no introducir una clave administrativa en variables públicas. Generar `database.types.ts` desde el esquema migrado.
- [ ] Crear administrativamente la única cuenta de uso, asignar `app_metadata.catalog_access = 'owner'` y deshabilitar signup/anónimo. Documentar el procedimiento y recuperación administrativa. Las credenciales se configuran fuera del código.
- [ ] Implementar `requireOwner` con módulo `server-only`, `getUser()` y comprobación de metadata. El resultado contiene usuario y cliente autenticado de esa solicitud. No autorizar con datos de `getSession()` sin verificar.
- [ ] Renovar cookies de sesión con el adaptador SSR y `proxy.ts`. Evitar caché pública de respuestas autenticadas. Verificar usuario en el layout y en cada Action; no confiar solo en la navegación protegida.
- [ ] Crear políticas SQL por operación. Retirar permisos de `anon`; conceder CRUD de las tablas a `authenticated` condicionado a la marca administrativa. Aplicar `USING` en lectura/borrado, `WITH CHECK` en inserción y ambos en actualización.

Predicado compartido por las políticas de ambas tablas:

```sql
(select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner'
```

- [ ] Implementar login y logout con errores genéricos, formulario accesible y estados de envío. Deshabilitar doble envío. Limpiar QueryClient al salir.
- [ ] Probar que un token autorizado no da acceso por sí mismo a interfaces administrativas; la marca solo se asigna desde administración. Documentar que revocar la marca no elimina inmediatamente todos los JWT ya emitidos.
- [ ] Comprobar navegación directa a `/products`, acceso a Supabase sin sesión, sesión caducada y cierre de sesión seguido de navegación atrás.

**Verificar:** `pnpm test -- tests/components/login-form.test.tsx`, `pnpm test:integration -- tests/integration/catalog-access.test.ts`, `pnpm test:e2e -- tests/e2e/auth.spec.ts`. Esperado: solo la cuenta marcada accede; errores no exponen datos ni secretos.

**Cierre:** catálogo protegido en UI, servidor y base de datos. Commit sugerido: `feat: restrict catalog to owner account`.

## Tarea 4. Gestión completa de categorías

**Archivos:** `src/features/catalog/categories/queries.ts`, `actions.ts`, `repository.ts`, `hooks.ts`, `theme.ts`, `components/category-panel.tsx`, `components/category-form.tsx`, `components/delete-category-dialog.tsx`, `src/app/(private)/products/page.tsx`, `tests/components/category-form.test.tsx`, `tests/integration/catalog-actions.test.ts`, `tests/e2e/catalog.spec.ts`.

**Consume:** `categorySchema`, `ActionResult`, `requireOwner`, tablas y `catalogKeys`.

**Produce:** interfaces de categorías del apartado 4 y tarjeta Categorías usable en `/products`. Esta tarea crea la pantalla con la tarjeta; la tabla de productos llega en las tareas 5 y 6.

- [ ] Escribir pruebas de formulario: nombre vacío, normalización de espacios, envío satisfactorio y nombre duplicado devuelto por servidor. Comprobar foco y mensaje asociado al campo.
- [ ] Implementar consultas de lista y opciones, ordenadas por nombre e ID. Las categorías son administrables; no hardcodear las categorías de ejemplo del contexto.
- [ ] Implementar repositorio y Actions: verificar identidad, validar ID/entrada, ejecutar con sesión de usuario y comprobar filas afectadas. Mapear unicidad a `CONFLICT`, FK al borrar a `CATEGORY_IN_USE`, ausencia a `NOT_FOUND` y fallos no esperados a mensaje genérico.
- [ ] Implementar la tarjeta Categorías en `/products`: «Todos los productos», lista con contador, filtro por clic que actualiza `category` en la URL, crear/renombrar en diálogo y confirmación de borrado con el nombre de la categoría. Las acciones aparecen al pasar el cursor, al enfocar o al seleccionar la fila. Bloquear la acción durante el envío y conservar el valor cuando falla.
- [ ] Asignar a cada categoría un color de una paleta fija con contraste AA, derivado de su ID en `theme.ts`. No añadir columnas de color ni de ícono.
- [ ] Invalidar categorías, opciones y consultas de productos afectadas por cambios de nombre. Mostrar toast de éxito solo si la Action devuelve `ok: true`.
- [ ] Añadir estado vacío inicial y error recuperable. Probar categoría ocupada con una fixture de producto en la base de pruebas.

**Verificar:** `pnpm test -- tests/components/category-form.test.tsx`, `pnpm test:integration -- tests/integration/catalog-actions.test.ts`, `pnpm test:e2e -- tests/e2e/catalog.spec.ts`. Esperado: crear, editar y borrar categoría vacía funciona; borrar una ocupada muestra explicación sin perder productos.

**Cierre:** gestión de categorías lista para ser consumida por productos. Commit sugerido: `feat: manage product categories`.

## Tarea 5. Alta, edición y eliminación de productos

**Archivos:** `src/features/catalog/products/queries.ts`, `actions.ts`, `repository.ts`, `hooks.ts`, `components/product-form.tsx`, `components/product-sheet.tsx`, `components/delete-product-dialog.tsx`, `tests/components/product-form.test.tsx`, `tests/integration/catalog-actions.test.ts`.

**Consume:** schemas, DTO, `requireOwner`, opciones de categorías y claves del catálogo.

**Produce:** mutaciones de producto y `getProduct` del apartado 4; formularios reutilizables.

- [ ] Escribir pruebas de campos obligatorios, descripción opcional, precio con coma/punto, código duplicado, error de servidor y ausencia de categorías. Distinguir el borrador del formulario de la entrada normalizada.
- [ ] Implementar lecturas y repositorio con proyección de precio como texto (`unit_price::text`). Validar el resultado y normalizarlo a dos decimales. Evitar recibir el precio como número para convertirlo luego a string.
- [ ] Implementar Actions con autenticación, Zod y manejo de errores: duplicado de código, categoría borrada antes de guardar, UUID inválido, producto inexistente y error inesperado.
- [ ] Comprobar filas afectadas al actualizar o eliminar. No informar éxito si el registro ya no existe. No sobrescribir un producto al detectar código duplicado.
- [ ] Implementar el formulario en un panel lateral (`Sheet`) que se abre desde `/products` para crear o editar; su estado no va en la URL. Conservar el borrador en errores; no sobrescribir campos modificados por un refetch. Desactivar guardar mientras está enviando.
- [ ] Mostrar cada error junto a su campo (`aria-invalid` y `aria-describedby`) y enfocar el primero con error.
- [ ] Si aún no existe ninguna categoría, ofrecer crearla desde el formulario con el diálogo de nueva categoría; no inventar una categoría por defecto.
- [ ] Confirmar eliminación con código y nombre. Invalidar lista/detalle, mostrar feedback y cerrar el panel al completar alta o edición, conservando búsqueda, categoría y página.

**Verificar:** `pnpm test -- tests/components/product-form.test.tsx` y `pnpm test:integration -- tests/integration/catalog-actions.test.ts`. Esperado: datos válidos guardados sin errores de precisión, errores corregibles visibles y cero cambios de esquema fuera del contexto.

**Cierre:** un producto puede crearse, consultarse para editar, actualizarse y eliminarse. Commit sugerido: `feat: manage catalog products`.

## Tarea 6. Listado, búsqueda, filtros y paginación

**Archivos:** `src/features/catalog/search-params.ts`, `search-pattern.ts`, `products/queries.ts`, `products/hooks.ts`, `products/components/product-list.tsx`, `products/components/product-filters.tsx`, `src/app/(private)/products/page.tsx`, `src/app/(private)/error.tsx`, `src/app/(private)/loading.tsx`, `tests/unit/catalog-search.test.ts`, `tests/e2e/catalog.spec.ts`.

**Consume:** productos/categorías persistidos, `ProductFilters`, `ProductPage` y `catalogKeys`.

**Produce:** catálogo consultable y estado de URL restaurable.

- [ ] Escribir pruebas de parámetros: página mínima 1, UUID de categoría válido, búsqueda limitada y valores de URL inválidos. Normalizar parámetros inválidos a defaults documentados sin bloquear la pantalla.
- [ ] Implementar parsers tipados con `nuqs`: `search` vacío, `category` nulo y `page` 1 por defecto. Mantener URL y query key sincronizadas; resetear página al cambiar filtros.
- [ ] Implementar `listProducts`: búsqueda literal por código o nombre, filtro por categoría, count total, rango de 20 elementos y orden estable nombre/ID. No descargar todo el catálogo para paginar en el navegador.
- [ ] Escapar caracteres de patrón y de la gramática PostgREST al construir la búsqueda; probar `%`, `_`, comas, paréntesis, comillas y barras. No interpolar texto sin escapar en una condición `or`. Si el SDK no permite construirla de forma segura, usar una función SQL con parámetros y `SECURITY INVOKER`, documentando la decisión y manteniendo RLS.
- [ ] Implementar debounce de 300 ms. Evitar que respuestas antiguas reemplacen resultados de filtros actuales usando claves distintas y cancelación cuando el cliente lo permita.
- [ ] Mostrar nombre, código, descripción abreviada, categoría y precio junto a la tarjeta Categorías, que controla el filtro de categoría. Usar tabla en PC y presentación móvil legible; mantener acciones accesibles con teclado.
- [ ] Distinguir catálogo vacío, búsqueda sin resultados, carga (filas esqueleto) y fallo de conexión (con «Reintentar»). Ofrecer crear producto o limpiar filtros según corresponda.
- [ ] Ajustar la página después de borrar el último producto de la última página. Invalidar correctamente los nombres de categoría renombrada en el listado.

**Verificar:** `pnpm test -- tests/unit/catalog-search.test.ts`, `pnpm test:e2e -- tests/e2e/catalog.spec.ts`. Probar al menos 21 registros desechables, combinación de búsqueda/categoría, atrás/adelante, recarga, renombrar categoría y último borrado de página.

**Cierre:** búsqueda y navegación consistentes en PC y móvil. Commit sugerido: `feat: add catalog search and pagination`.

## Tarea 7. Viabilidad temprana de WhatsApp en Vercel

**Archivo de entrega:** `docs/decisions/whatsapp-vercel-feasibility.md`. Un experimento, si hace falta, se mantiene aislado de las dependencias de producción y no añade módulos a la app.

**Consume:** restricciones del contexto, documentación oficial de Vercel y de las librerías candidatas.

**Produce:** decisión respaldada por evidencia; no constituye todavía la integración final.

- [ ] Comparar Baileys y whatsapp-web.js según ejecución en Vercel, sesión, reconexión, tamaño de dependencias, almacenamiento de credenciales y mantenimiento. No dar por elegido un proveedor antes de la comparación.
- [ ] Registrar límites actuales de Functions y necesidades de la librería. Distinguir WebSocket cliente/servidor y persistencia de credenciales/duración del proceso.
- [ ] Diseñar una prueba con restauración de sesión tras una invocación nueva, dos solicitudes cercanas, expiración/desconexión y resultado incierto del envío. No asumir que guardar credenciales evita estos problemas.
- [ ] Hacer comprobaciones locales y simuladas sin contactar destinatarios reales. Preparar para revisión el ensayo real: cuenta usada, destinatario, documento inocuo y operación concreta. Solo ejecutarlo cuando exista autorización explícita para enviar ese mensaje.
- [ ] Registrar éxito, fallo o limitación no comprobada; una prueba no realizada no cuenta como evidencia de compatibilidad. Si hacen falta almacenamiento externo, proveedor gestionado o cambio de alojamiento, explicar la modificación antes de incorporarla.
- [ ] Entregar recomendación y sus condiciones. Mantener el catálogo independiente del resultado. No sustituir automáticamente el envío directo previsto por envío manual, URL pública ni API oficial.

**Cierre:** informe que permita decidir una arquitectura realista antes de implementar WhatsApp. Si el experimento externo no está autorizado, se entrega su protocolo y se conserva expresamente el estado «no comprobado».

## Tarea 8. Validación integral y preparación del despliegue

**Archivos:** `tests/e2e/auth.spec.ts`, `tests/e2e/catalog.spec.ts`, `playwright.config.ts`, `docs/setup.md`, `docs/deployment.md`, `.env.example`.

**Consume:** tareas 1–6 completas. La conclusión de WhatsApp no bloquea la publicación del catálogo.

**Produce:** primera entrega usable y procedimiento de despliegue repetible.

- [ ] Completar el flujo E2E: iniciar sesión → crear categoría → crear producto → buscar/filtrar → editar → comprobar borrado restringido de categoría → borrar producto → borrar categoría → cerrar sesión.
- [ ] Ejecutar pruebas de acceso sin sesión y con usuario autenticado no autorizado contra el Supabase de pruebas. Comprobar que un cambio en `user_metadata` no concede acceso.
- [ ] Ejecutar `pnpm validate`, `pnpm test:integration` y `pnpm test:e2e`. Registrar comandos y resultados; si falta un servicio o credencial, identificar qué comprobación queda sin ejecutar, sin marcarla como aprobada.
- [ ] Revisar manualmente teclado/foco, formularios a 390 px, listado a 1440 px, errores y recarga con filtros. Confirmar PEN o corregir moneda antes de cargar precios reales.
- [ ] Preparar variables de Vercel, runtime Node 24.x, dominios de Auth y separación entre preview/pruebas y producción. Evitar que un preview de pruebas modifique el catálogo real.
- [ ] Preparar el proyecto Supabase de producción y la aplicación ordenada de migraciones. Documentar copia de seguridad y procedimiento de recuperación antes de cambios futuros; no ejecutar resets en producción.
- [ ] Preparar el despliegue concreto y su coste operativo. Usar autorizaciones existentes al publicarlo; si falta autorización para una contratación o cambio externo, presentar el resultado verificable y pedirla solo para ese paso.
- [ ] Después del despliegue autorizado, comprobar inicio/cierre de sesión, acceso bloqueado sin sesión, consultas, alta/edición/borrado con datos de prueba identificables y secretos ausentes del bundle cliente.
- [ ] Documentar operación cotidiana, recuperación administrativa de la cuenta, gestión de variables y publicación de cambios. No crear almacenamiento de PDF ni tablas de proformas.

**Cierre:** catálogo privado funcional; checklist respaldada por resultados reales. Commit sugerido: `test: verify private catalog release`.

## Tarea 9. Definir y planificar las proformas

**Archivos de entrega:** `docs/specs/proformas.md` y `docs/plans/proformas.md`.

**Consume:** catálogo operativo y referencia comercial aportada por el usuario.

**Produce:** especificación y plan propios que permiten implementar sin inventar campos.

- [ ] Partir del punto de entrada validado en el prototipo: casillas de selección en la tabla de productos y barra «Generar proforma» sobre la tabla. No implementarlo antes de cerrar esta definición.
- [ ] Recoger una referencia real y acordar qué campos representa: empresa, cliente, numeración, fechas, moneda, impuestos, descuentos, condiciones y vigencia. Una imagen no autoriza incorporar todo lo que aparezca en ella.
- [ ] Definir reglas de cantidad/precio y redondeo. Acordar ejemplos concretos con sus resultados: un producto, varios productos, cantidades límite y los descuentos/impuestos que realmente se decidan.
- [ ] Definir captura de valores al seleccionar producto, edición del borrador y comportamiento ante cambios posteriores del catálogo. Nunca actualizar el catálogo desde la proforma.
- [ ] Definir duración del borrador y aviso ante pérdida de cambios. Mantenerlo temporal; no añadir historial, tablas, URLs públicas ni persistencia en navegador sin requisito.
- [ ] Preparar diseño de pantalla, contrato de datos y pruebas de cálculo a partir de esos acuerdos.
- [ ] Redactar el plan específico con archivos, código de los cálculos acordados, pruebas y criterios de aceptación. Implementar solo después de cerrar ese diseño con el usuario.

**Cierre de definición:** campos, reglas y ejemplos completos. **Cierre posterior de implementación:** una proforma temporal calculada correctamente con datos seleccionados, sin alterar el catálogo.

## Tarea 10. Definir y planificar el documento

**Archivos de entrega:** `docs/specs/documento-proforma.md` y `docs/plans/documento-proforma.md`.

**Consume:** contrato definitivo de proforma y referencia visual validada.

**Produce:** plantilla, decisión de generación y plan propio.

- [ ] Cerrar tamaño de página, encabezado, pie, campos visibles, tipografía, tablas y comportamiento con varias páginas.
- [ ] Evaluar librería solo contra esa plantilla y los límites de ejecución/tamaño de Vercel. No decidir ahora una librería o motor de navegador.
- [ ] Definir el generador desacoplado de UI y WhatsApp: datos completos de proforma como entrada, documento descargable como salida y errores explícitos.
- [ ] Preparar ejemplos con descripciones extensas, tildes, múltiples páginas y totales. Verificar que el contenido y las cifras coincidan con la proforma.
- [ ] Definir descarga y representación para compartir. Imagen únicamente si se requiere; no almacenar PDFs de forma permanente.
- [ ] Redactar el plan específico con plantilla, generación, descarga y pruebas del contenido.

**Cierre de definición:** documento aprobado y estrategia compatible. **Cierre posterior de implementación:** PDF correcto, reutilizable por descarga y envío.

## Tarea 11. Definir e integrar el envío por WhatsApp

**Archivos de entrega de definición:** `docs/specs/whatsapp.md`, `docs/plans/whatsapp.md`, actualización de `docs/deployment.md`.

**Consume:** informe de tarea 7, datos de proforma y generador de tarea 10.

**Produce:** contrato `WhatsAppProvider`, estrategia autorizada de sesión/secretos y plan de envío.

- [ ] Elegir proveedor con evidencia del experimento y las restricciones actuales. Si cambia la estrategia inicial no oficial, registrar el acuerdo antes de implementar.
- [ ] Definir `SendDocumentInput`, `SendDocumentResult` y `WhatsAppProvider.sendDocument` a partir del documento real, tamaño máximo, destinatario y estados que pueda confirmar el proveedor.
- [ ] Diseñar Action que verifique usuario, valide entrada, genere documento y lo entregue al proveedor. La UI no conoce la librería seleccionada ni sus secretos.
- [ ] Definir almacenamiento y recuperación de sesión y credenciales, separado del documento temporal. No añadir tablas ni proveedores de almacenamiento sin explicar ese cambio.
- [ ] Definir resultado de envío y reintentos: una respuesta aceptada por el proveedor no garantiza entrega al destinatario; un timeout puede dejar un resultado incierto. No reintentar automáticamente de forma que duplique mensajes.
- [ ] Preparar prueba integral con autorización expresa de cuenta/destinatario y documento. Verificar también desconexión, fallo de generación y prevención de doble clic.
- [ ] Documentar uso, recuperación de sesión y procedimiento ante fallo del proveedor.

**Cierre de definición:** integración implementable sin acoplar proformas al proveedor. **Cierre posterior de implementación:** flujo autorizado completo, crear producto → seleccionar → crear proforma → generar documento → enviar/compartir.

## 5. Comprobación de cobertura del contexto

| Secciones de PROJECT_CONTEXT.md | Dónde quedan cubiertas |
| --- | --- |
| 1, 3, 5, 24, 27: alcance y simplicidad | Restricciones globales; diseño 2–4; tareas 1, 9–11. |
| 2, 23, 26: stack, dependencias y calidad | Tarea 1; contratos; scripts; no instalar librerías futuras. |
| 4, 16: modelo y migraciones | Tarea 2 y permisos de tarea 3. |
| 6, 7: productos y categorías | Tareas 4–6. |
| 8, 9: proformas y valores seleccionados | Tarea 9. |
| 10: PDF desacoplado | Tarea 10. |
| 11, 12: proveedor WhatsApp | Tareas 7 y 11. |
| 13, 14: envío directo y persistencia | Restricciones globales; tareas 9–11. |
| 15, 21, 22: secretos y responsabilidades | Diseño 4–6; tareas 3–5 y 11. |
| 17, 18: TanStack Query y URL | Contratos y tareas 4–6. |
| 19, 20: UX y responsive | Diseño 7–9; tareas 1, 4–6 y 8. |
| 25: roadmap | Tabla de entregas y dependencias. |

## 6. Información externa necesaria en su momento

Estos datos no impiden tener este plan; se incorporan cuando la tarea correspondiente los necesite.

| Información | Momento |
| --- | --- |
| Proyecto Supabase de pruebas y variables | Conectar datos y ejecutar integración. |
| Correo de la única cuenta; contraseña configurada de forma privada | Aprovisionar acceso. |
| Confirmación/corrección de moneda | Antes de cargar precios reales y cerrar catálogo. |
| Cuenta/proyecto Vercel y configuración de producción | Preparar el despliegue. |
| Referencia y reglas de proforma | Tarea 9. |
| Aprobación de plantilla | Tarea 10. |
| Cuenta y destinatario autorizado para ensayo de WhatsApp | Prueba externa de tarea 7 o tarea 11. |

No solicitar secretos dentro de archivos versionados ni incluirlos en este documento.

## 7. Estado de esta planificación

- [x] Leer el contexto completo y registrar la decisión de una persona/Vercel.
- [x] Separar requisitos confirmados, supuestos de trabajo y etapas de definición.
- [x] Definir arquitectura, modelo, contratos, entregas, pruebas y dependencias.
- [x] Cubrir las 27 secciones del contexto sin inventar el modelo de proforma.
- [ ] Ejecutar las tareas del catálogo.
- [ ] Definir e implementar proformas, documento y WhatsApp en sus etapas.

Los comandos de pruebas de este plan son verificaciones a ejecutar durante implementación. No se han ejecutado pruebas de aplicación ni se afirma que exista todavía una aplicación funcional.
