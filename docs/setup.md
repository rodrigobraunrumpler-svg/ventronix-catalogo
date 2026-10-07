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

## Consulta de RUC

La ventana «Completar proforma» consulta SUNAT con [Decolecta](https://decolecta.com) al escribir un RUC de 11 dígitos. La clave va en `DECOLECTA_TOKEN`, solo del servidor (nunca con `NEXT_PUBLIC_`), en `.env.development.local` o en `.env.local`. Sin ella, la consulta dice que no está disponible y los datos se escriben a mano. El plan gratuito da 1 000 consultas al mes.

Las pruebas e2e no usan el servicio real: Playwright arranca la app con `RUC_PROVIDER=stub`, que responde con datos de prueba (`20000000001` activo, `20000000010` de baja y no habido, `20000000036` sin servicio; cualquier otro RUC válido, no encontrado). Ese proveedor nunca se usa en producción.

## Documento PDF

«Descargar PDF» genera la proforma en el servidor con `@react-pdf/renderer`, con la plantilla del prototipo. Usa las fuentes de `src/features/proforma/document/fonts` (Plus Jakarta Sans y JetBrains Mono, licencia OFL incluida) y el logotipo de `public/brand/ventronix-wordmark.png`. El PDF no se guarda en ningún sitio.

## WhatsApp automático

Con el WhatsApp de la empresa vinculado, «Enviar por WhatsApp» manda la proforma sola desde ese número ([spec](superpowers/specs/2026-09-30-whatsapp-automatico-design.md)). Usa [Baileys](https://github.com/WhiskeySockets/Baileys), una conexión no oficial: la app queda como un dispositivo vinculado, igual que WhatsApp Web.

1. Genera una clave con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` y guárdala como `WHATSAPP_SESSION_KEY` en `.env.local` (solo servidor, nunca con `NEXT_PUBLIC_`). Cifra la sesión en la base: si la cambias, hay que volver a vincular.
2. En «Empresa» → WhatsApp → «Vincular WhatsApp», escribe el celular de la empresa y, en el teléfono, el código que aparece (WhatsApp → Dispositivos vinculados → Vincular con el número de teléfono).

Sin clave, «Enviar por WhatsApp» abre el chat con el mensaje, como antes. Las pruebas e2e usan `WHATSAPP_PROVIDER=stub`, que vincula y «envía» sin salir a WhatsApp (el 911111111 hace de celular sin WhatsApp); también borran la vinculación de la base local.

## Arranque

```bash
pnpm dev
```

Abre `http://localhost:3000`; la raíz redirige a `/products`.

## Comandos

| Comando                 | Qué hace                                                                      |
| ----------------------- | ----------------------------------------------------------------------------- |
| `pnpm lint`             | ESLint sobre todo el proyecto.                                                |
| `pnpm typecheck`        | Genera los tipos de rutas de Next.js y ejecuta `tsc --noEmit`.                |
| `pnpm format`           | Formatea con Prettier.                                                        |
| `pnpm format:check`     | Comprueba el formato sin modificar archivos.                                  |
| `pnpm test`             | Pruebas unitarias y de componentes (Vitest).                                  |
| `pnpm test:integration` | Pruebas contra el Supabase de pruebas; requiere el entorno de la tarea 2.     |
| `pnpm test:e2e`         | Pruebas de extremo a extremo con Playwright (escritorio y móvil).             |
| `pnpm validate`         | Lint, tipos, formato, pruebas y build de producción.                          |
| `pnpm db:push`          | Aplica las migraciones al Supabase de producción (ver `deployment.md`).       |
| `pnpm demo:seed`        | Añade 100 productos de prueba (códigos `DEMO-…`) al Supabase de `.env.local`. |
| `pnpm demo:clean`       | Borra esos productos y las categorías de prueba que queden vacías.            |

`pnpm demo:seed` y `pnpm demo:clean` entran con `OWNER_EMAIL` y `OWNER_PASSWORD` de `.env.local`: sirven para ver cómo se arman las proformas con un catálogo grande y dejarlo limpio después. Solo tocan productos cuyo código empieza por `DEMO-`.

`pnpm test:e2e` necesita el navegador de Playwright una sola vez (`pnpm exec playwright install chromium`), el Supabase local en marcha y `.env.development.local`. Sus cuentas de prueba se crean solas en el Supabase local. Arranca su propio `pnpm dev` en el puerto 4100, así que nunca usa la app del puerto 3000, aunque tengas `pnpm start` abierto con el Supabase real. Next permite un solo `pnpm dev` por carpeta: si tienes uno abierto, ciérralo antes de lanzar las e2e.

## Supabase local (desarrollo y pruebas)

El desarrollo y las pruebas de integración usan un Supabase local en Docker, nunca el proyecto de producción: las pruebas borran datos.

```bash
# Arranca base de datos, Auth, API REST, Storage (fotos) y gateway, sin servicios que no se usan
pnpm exec supabase start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

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

Las variables también pueden ir en `.env.local`; las que escribas en el comando tienen prioridad. La clave secreta nunca va en archivos del repositorio ni en variables `NEXT_PUBLIC_`: si la pusiste en `.env.local`, bórrala al terminar. `OWNER_PASSWORD` es obligatorio al crear la cuenta; si la cuenta ya existe y lo omites, solo se reasigna la marca.

En el proyecto de producción, además:

- Desactiva el registro de usuarios: Authentication → Sign In / Providers → «Allow new users to sign up».
- Mantén desactivado el inicio de sesión anónimo.

**Recuperación (contraseña olvidada):** ejecuta el mismo comando con el correo de la cuenta y la contraseña nueva en `OWNER_PASSWORD`; el script la fija y mantiene la marca. No hay flujo de recuperación por correo en esta entrega.

**Revocar el acceso:** elimina la cuenta en el panel de Supabase (Authentication → Users). Así ya no puede iniciar sesión ni renovar la sesión, pero el token de acceso ya emitido sigue siendo válido hasta que caduca (1 hora por defecto).

## Hooks de Git

El hook `pre-commit` ejecuta lint-staged: ESLint y Prettier sobre los archivos preparados. No se usa Commitlint mientras no se adopte Conventional Commits.

## Carga masiva desde Excel

En **Productos → Carga masiva** (`/products/import`) se crean y actualizan muchos productos a la vez:

1. Descarga la plantilla (productos nuevos) o tu catálogo (para cambiar los que ya tienes).
2. Complétalo en Excel. Solo la columna **Código** es obligatoria: si el código ya existe, se actualiza ese producto; las columnas que no vengan se quedan como están.
3. Súbelo y revisa la vista previa: qué se crea, qué cambia, qué se ignora y por qué.
4. Importa. Es todo o nada: si algo falla, no se guarda nada. Nunca se borran productos.

Al terminar se descarga un **comprobante**. Su hoja «Para revertir» trae los valores anteriores de los productos actualizados: súbela en Carga masiva para dejarlos como estaban.

Límites: archivos `.xlsx` de hasta 4 MB y 5 000 productos (`src/features/catalog/import/options.ts`).
