# Puesta en marcha

Guía para instalar y ejecutar el catálogo en local. El contexto del proyecto está en [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md); el diseño y el plan, en `docs/superpowers/`.

## Requisitos

- Node.js 24 (`.nvmrc`) y pnpm 10 (versión fijada en `packageManager`).
- Git, para los hooks de calidad (Husky + lint-staged).
- Docker, para ejecutar Supabase en local a partir de la tarea 2.

## Instalación

```bash
pnpm install          # también activa los hooks de Git (script prepare)
```

## Variables de entorno

La app solo necesita la URL y la clave publicable de Supabase (`.env.example`). Ningún archivo con valores reales se versiona.

| Archivo                  | Cuándo se usa                            | Apunta a                            |
| ------------------------ | ---------------------------------------- | ----------------------------------- |
| `.env.development.local` | `pnpm dev` y las pruebas e2e             | Supabase local (`supabase status`)  |
| `.env.local`             | `pnpm build` / `pnpm start` en tu equipo | Proyecto de Supabase de producción  |
| Variables de Vercel      | Despliegues                              | Proyecto de producción o de preview |

En desarrollo, Next.js da prioridad a `.env.development.local`, así que `pnpm dev` nunca toca los datos reales.

## Arranque

```bash
pnpm dev
```

Abre `http://localhost:3000`; la raíz redirige a `/products`.

## Comandos

| Comando                 | Qué hace                                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm lint`             | ESLint sobre todo el proyecto.                                            |
| `pnpm typecheck`        | Genera los tipos de rutas de Next.js y ejecuta `tsc --noEmit`.            |
| `pnpm format`           | Formatea con Prettier.                                                    |
| `pnpm format:check`     | Comprueba el formato sin modificar archivos.                              |
| `pnpm test`             | Pruebas unitarias y de componentes (Vitest).                              |
| `pnpm test:integration` | Pruebas contra el Supabase de pruebas; requiere el entorno de la tarea 2. |
| `pnpm test:e2e`         | Pruebas de extremo a extremo con Playwright (escritorio y móvil).         |
| `pnpm validate`         | Lint, tipos, formato, pruebas y build de producción.                      |

`pnpm test:e2e` necesita el navegador de Playwright una sola vez (`pnpm exec playwright install chromium`), el Supabase local en marcha y `.env.development.local`. Sus cuentas de prueba se crean solas en el Supabase local.

## Supabase local (desarrollo y pruebas)

El desarrollo y las pruebas de integración usan un Supabase local en Docker, nunca el proyecto de producción: las pruebas borran datos.

```bash
# Arranca base de datos, Auth, API REST y gateway (sin servicios que el catálogo no usa)
pnpm exec supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

pnpm exec supabase db reset   # recrea la base local y aplica supabase/migrations
pnpm test:integration         # pruebas contra la base local
pnpm exec supabase stop       # detiene los contenedores
```

Las pruebas de integración se conectan a `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. `TEST_DATABASE_URL` permite cambiarla, pero solo acepta `localhost` o `127.0.0.1`. Las claves locales se leen de `supabase status` en cada ejecución; no se guardan en el repositorio.

Tras cambiar una migración, regenera los tipos con `pnpm db:types`.

Para `pnpm dev` y las e2e, crea `.env.development.local` con los valores locales:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY de `pnpm exec supabase status`>
```

## Cuenta de acceso

La aplicación tiene una sola cuenta. No hay registro público: la cuenta se crea por administración y solo accede si tiene `app_metadata.catalog_access = 'owner'`. Esa marca no se puede cambiar desde la sesión del usuario; `user_metadata` no concede acceso.

Crear la cuenta o volver a asignarle la marca (local o producción):

```bash
SUPABASE_URL=<url del proyecto> \
SUPABASE_SECRET_KEY=<clave secreta del proyecto> \
OWNER_EMAIL=<correo> OWNER_PASSWORD=<contraseña> \
pnpm owner:create
```

La clave secreta se escribe solo en ese comando: nunca en archivos del repositorio ni en variables `NEXT_PUBLIC_`. `OWNER_PASSWORD` solo hace falta al crear la cuenta.

En el proyecto de producción, además:

- Desactiva el registro de usuarios: Authentication → Sign In / Providers → «Allow new users to sign up».
- Mantén desactivado el inicio de sesión anónimo.

**Recuperación:** desde el panel de Supabase (Authentication → Users → la cuenta) se puede fijar una contraseña nueva. No hay flujo de correo de recuperación en esta entrega.

**Revocar el acceso:** quitar la marca impide nuevas sesiones, pero una sesión ya abierta conserva su token hasta que caduca (1 hora por defecto). Para cortarla al momento, cierra también sus sesiones desde el panel o elimina la cuenta.

## Hooks de Git

El hook `pre-commit` ejecuta lint-staged: ESLint y Prettier sobre los archivos preparados. No se usa Commitlint mientras no se adopte Conventional Commits.
