# Puesta en marcha

Guía para instalar y ejecutar el catálogo en local. El contexto del proyecto está en [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md); el diseño y el plan, en `docs/superpowers/`.

## Requisitos

- Node.js 24 (`.nvmrc`) y pnpm 10 (versión fijada en `packageManager`).
- Git, para los hooks de calidad (Husky + lint-staged).
- Docker, para ejecutar Supabase en local a partir de la tarea 2.

## Instalación

```bash
pnpm install          # también activa los hooks de Git (script prepare)
cp .env.example .env.local
```

Completa `.env.local` con la URL y la clave publicable de Supabase. Los valores reales nunca se versionan.

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

`pnpm test:e2e` necesita el navegador de Playwright una sola vez: `pnpm exec playwright install chromium`.

## Hooks de Git

El hook `pre-commit` ejecuta lint-staged: ESLint y Prettier sobre los archivos preparados. No se usa Commitlint mientras no se adopte Conventional Commits.
