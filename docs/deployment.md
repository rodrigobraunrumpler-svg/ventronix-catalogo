# Despliegue y operación

Guía para publicar el catálogo en Vercel con un proyecto de Supabase de producción, y para operarlo después. La instalación local y las pruebas están en [setup.md](setup.md).

> **Estado:** preparado y probado en local, sin ejecutar fuera. Aplicar las migraciones en el Supabase de producción, crear allí la cuenta y publicar en Vercel son pasos externos que se ejecutan solo con autorización expresa.

## Qué se despliega

- **Vercel** ejecuta la app Next.js: páginas, Server Actions y `proxy.ts`. No hay un backend aparte.
- **Supabase** aporta Auth (una sola cuenta con correo y contraseña) y Postgres con RLS.
- La app solo necesita dos variables públicas. La clave secreta de Supabase nunca llega a Vercel: solo se usa en `pnpm owner:create`, desde tu equipo.

## Costes

Comprobados el 29-09-2026. Precios en USD, sin impuestos.

| Servicio | Plan  | Precio                                 | Lo que importa aquí                                                                                 |
| -------- | ----- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Vercel   | Hobby | 0                                      | Solo uso personal y no comercial.                                                                   |
| Vercel   | Pro   | 20 al mes por asiento de desarrollador | Necesario para uso comercial. El consumo de una sola persona es bajo.                               |
| Supabase | Free  | 0                                      | Se pausa tras 1 semana sin actividad, sin copias automáticas y con 2 proyectos activos como máximo. |
| Supabase | Pro   | desde 25 al mes                        | Incluye copias diarias, que se conservan 7 días.                                                    |

Vercel considera comercial cualquier despliegue que genere ingresos a alguien que participa en el proyecto, incluido quien cobra por escribir el código. El catálogo de un negocio entra en ese caso, así que Hobby no sirve.

- **Mínimo, 20 USD al mes:** Vercel Pro y Supabase Free. Hay que hacer copias manuales (sección 4) y asumir la pausa por inactividad.
- **Con precios reales cargados, 45 USD al mes:** Vercel Pro y Supabase Pro, con copias diarias y sin pausas.

Revisa el consumo en el panel de Vercel durante el primer mes.

Fuentes: [plan Hobby de Vercel](https://vercel.com/docs/plans/hobby), [uso comercial en Vercel](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) y [precios de Supabase](https://supabase.com/pricing).

## 1. Supabase de producción

Usa el proyecto que ya creaste. No ejecutes las pruebas contra él, porque borran datos.

### Ajustes de Auth

1. Desactiva el registro y deja desactivado el acceso anónimo, como indica [setup.md](setup.md#cuenta-de-acceso). El proveedor Email debe seguir activo: sin él no se puede iniciar sesión.
2. En Authentication → URL Configuration, pon en Site URL la URL de producción (el dominio de Vercel o el tuyo). La app no envía correos ni usa redirecciones, pero Supabase usa ese valor en sus correos de Auth.

### Migraciones

Se aplican en orden desde la raíz del repositorio, sin `supabase login` ni `link`:

```bash
pnpm db:push
```

El script pide la cadena de conexión de la base y la contraseña, que no se muestra ni se guarda. La cadena se copia en Supabase, en el botón **Connect → Session pooler**: empieza por `postgresql://` y no es la URL de la API de `.env.local`.

Antes de aplicar nada, el script comprueba que la cadena sea del mismo proyecto que `.env.local` y muestra las migraciones pendientes (`--dry-run`). Solo las aplica si escribes «si». Para no pegar la cadena cada vez, guárdala en `.env.local` como `DATABASE_URL`. Con `[YOUR-PASSWORD]` dentro, la contraseña se pide cada vez; completa, queda en `.env.local`, que no se versiona. No la pongas en Vercel: la app no la usa.

Por debajo usa `supabase db push`, que solo aplica las migraciones de `supabase/migrations` que el proyecto aún no tiene registradas: nunca las repite ni borra datos. La primera vez aplica las tres del catálogo (tablas, acceso y búsqueda).

Nunca ejecutes `supabase db reset --linked` ni edites una migración ya aplicada. Cada cambio de esquema va en una migración nueva.

### Cuenta

Crea la cuenta con `pnpm owner:create`, usando la URL de producción y la clave secreta del proyecto (Project Settings → API Keys). El procedimiento completo está en [setup.md](setup.md#cuenta-de-acceso). Escribe la clave solo en ese comando; no la guardes en archivos.

## 2. Vercel

1. Importa el repositorio en Vercel, que detecta Next.js y pnpm. La versión de Node (24.x) la toma de `engines` en `package.json`.
2. En Settings → Environment Variables, añade estas dos variables **solo en el entorno Production**:

   | Variable                               | Valor                                 |
   | -------------------------------------- | ------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | URL del proyecto de producción        |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable (`sb_publishable_…`) |
   | `DECOLECTA_TOKEN`                      | Clave de api.decolecta.com (RUC)      |
   | `WHATSAPP_SESSION_KEY`                 | Clave de la sesión de WhatsApp        |

   No añadas la clave secreta de Supabase ni ninguna otra variable. `DECOLECTA_TOKEN` y `WHATSAPP_SESSION_KEY` son opcionales y solo las lee el servidor: sin la primera, el RUC del cliente se escribe a mano; sin la segunda, «Enviar por WhatsApp» abre el chat. `WHATSAPP_SESSION_KEY` debe ser la misma con la que se vinculó el número (si vinculas desde tu equipo con `pnpm start`, la de tu `.env.local`); si cambia, hay que volver a vincular.

3. Despliega la rama `main`. A partir de ahí, cada merge a `main` se publica en producción.
4. Opcional: añade tu dominio en Settings → Domains y actualiza la Site URL en Supabase.
5. Configura la región de Functions de Vercel cerca de la de tu proyecto de Supabase: cada página consulta Auth desde el servidor.

### Previews sin datos reales

Las variables solo existen en Production. Por eso los despliegues de preview (ramas y pull requests) no pueden leer ni modificar el catálogo real: fallan al cargar, y es intencionado. Si más adelante quieres previews con datos, crea un segundo proyecto de Supabase para pruebas, con sus migraciones y su propia cuenta, y pon sus valores en el entorno Preview. Nunca uses las variables de producción en Preview.

## 3. Comprobación después de publicar

Antes de publicar esta versión, haz una copia de seguridad (sección 4) y aplica las migraciones nuevas con `pnpm db:push`: búsqueda sin tildes, datos de la empresa y numeración de proformas.

Usa datos de prueba fáciles de reconocer, por ejemplo la categoría «Prueba despliegue» y el producto `PRUEBA-001`, y bórralos al terminar.

- [ ] `/products` sin sesión lleva a `/login`.
- [ ] La cuenta inicia sesión, y una contraseña incorrecta muestra el mensaje genérico.
- [ ] Crear, editar, buscar, filtrar y borrar funcionan; una categoría con productos no se puede borrar.
- [ ] Cerrar sesión vuelve a `/login`, y el botón «atrás» no muestra el catálogo.
- [ ] En «Empresa», los datos se guardan y la vista previa los muestra.
- [ ] En Productos, «Añadir», «Completar proforma» y «Generar proforma» asignan el número siguiente, y un RUC real completa la razón social.
- [ ] En una proforma generada, «Descargar PDF» baja el documento con el logotipo y los datos de la empresa, y «Enviar por WhatsApp» abre el chat del cliente con el mensaje.
- [ ] Con WhatsApp vinculado en «Empresa», «Enviar por WhatsApp» manda la proforma a un celular tuyo y llega con el PDF y el mensaje. Vincular espera hasta 2 minutos (`maxDuration` de 150 s en «Empresa») y enviar, hasta 1 (60 s en Productos): entra en el plan Pro.
- [ ] El código del navegador no contiene ninguna clave secreta. Con las variables de producción en `.env.local`, ejecuta:
      `pnpm build && (grep -rEo 'sb_secret_[A-Za-z0-9_-]{20,}' .next/static || echo "sin claves secretas")`

## 4. Copias de seguridad y recuperación

Supabase Free no hace copias automáticas. Haz una antes de cada migración y, con uso real, una vez por semana. Guárdalas fuera del repositorio, porque contienen datos del negocio.

```bash
mkdir -p ~/respaldos-catalogo
pnpm exec supabase db dump --linked -s public -f ~/respaldos-catalogo/$(date +%F)-esquema.sql
pnpm exec supabase db dump --linked -s public --data-only -f ~/respaldos-catalogo/$(date +%F)-datos.sql
```

Estos comandos necesitan el proyecto enlazado una vez (`pnpm exec supabase login` y `pnpm exec supabase link --project-ref <ref>`), o cambiar `--linked` por `--db-url "<cadena con la contraseña>"`. El esquema también está en `supabase/migrations`. La cuenta no entra en la copia: si hiciera falta, se recrea con `pnpm owner:create`.

**Restaurar los datos**, por ejemplo tras un borrado por error:

1. Haz primero una copia del estado actual; así la restauración también se puede deshacer.
2. Restaura con `psql` (en Ubuntu o WSL: `sudo apt install postgresql-client`) y la cadena de conexión del botón «Connect» del panel de Supabase (Session pooler):

```bash
psql "<cadena de conexión>" --single-transaction -v ON_ERROR_STOP=1 \
  -c 'truncate public.products, public.categories' \
  -f ~/respaldos-catalogo/<fecha>-datos.sql
```

Todo ocurre en una transacción: si algo falla, no cambia nada. Este procedimiento se probó en la base local: se borraron 2 productos por error y la restauración recuperó todos los datos.

Con Supabase Pro, las copias diarias se restauran desde la sección Backups del panel.

## 5. Publicar cambios

1. Trabaja en una rama y abre un pull request. Vercel crea un preview, que no tiene datos (ver la sección 2).
2. Si el cambio incluye una migración, sigue este orden:
   1. Haz una copia de seguridad.
   2. Revisa `db push --dry-run`.
   3. Aplica `db push` **antes** de fusionar.

   Durante unos minutos la base nueva convivirá con el código anterior. Por eso cada migración debe ser compatible con la versión publicada: primero se añade y después se quita.

3. Fusiona en `main` y Vercel publica en producción.
4. Si la versión nueva falla, vuelve a la anterior desde Deployments en Vercel (Instant Rollback). Esto revierte el código, pero no la base.

## 6. Operación diaria

- **Entrar:** usa la URL de producción con la única cuenta. La sesión se mantiene en el navegador hasta que cierras sesión.
- **Pausa por inactividad (Supabase Free):** si nadie usa el catálogo durante una semana, Supabase pausa el proyecto y la app deja de cargar. Reactívalo desde el panel de Supabase; tarda unos minutos.
- **Variables:** las `NEXT_PUBLIC_` se incrustan al compilar. Si cambias una en Vercel, vuelve a desplegar para que el cambio surta efecto.
- **Rotar claves:** si la clave secreta pudo filtrarse, crea una nueva y revoca la anterior en Project Settings → API Keys. Si rotas la publicable, actualiza la variable en Vercel y vuelve a desplegar.
- **WhatsApp desvinculado:** si el teléfono pasa unos 14 días sin internet o cierras el dispositivo desde WhatsApp, «Enviar por WhatsApp» avisa y hay que volver a vincular en «Empresa». Mientras tanto, «Abrir el chat» sigue funcionando.
- **Contraseña olvidada o acceso a revocar:** sigue [setup.md](setup.md#cuenta-de-acceso).

## 7. Moneda

La base guarda el precio como un número, sin moneda, y la interfaz lo muestra en soles («S/», PEN). El plan trata la moneda como una hipótesis: confírmala antes de cargar precios reales. Si fuera otra, se cambia en la presentación antes de cargar datos.

## Pendiente de autorización

- [ ] Ajustes de Auth y `db push` en el Supabase de producción.
- [ ] `pnpm owner:create` contra producción, que ejecutas tú con tu clave secreta.
- [ ] Contratar Vercel Pro y publicar.
- [ ] Comprobación después de publicar (sección 3).
- [ ] Confirmar la moneda (sección 7).
