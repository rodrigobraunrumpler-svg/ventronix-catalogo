# Proformas: mensaje editable, productos libres, historial y fotos — Implementation Plan

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:executing-plans (ejecución inline: el usuario pidió no usar subagentes). Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Goal:** Que preparar, enviar y volver a enviar una proforma sea rápido aunque los productos no estén en el catálogo, y que ninguna proforma enviada se pierda: mensaje de WhatsApp editable, productos libres, historial con «Corregir», páginas, filtros, Excel y reenvío, y fotos opcionales en el catálogo, en los productos libres y en el PDF.

**Architecture:** Cuatro entregas, cada una publicable por separado (spec §2):

- **A. Mensaje editable.** Una columna en `company_profile` y una pestaña «Mensaje» en Empresa. El texto lo arma una sola función, `whatsappMessage(plantilla, datos)`, que usan el envío, el chat y el reenvío.
- **B. Productos libres y «Nueva proforma».** Cada línea del borrador tiene su propio `id`: las del catálogo usan el id del producto; las libres, `libre-<uuid>`, sin producto ni precio de catálogo. La pantalla `/proformas` abre la misma ventana de hoy.
- **C. Historial.** Tabla `proformas` (una fila por número, para siempre). El servidor la guarda o actualiza cada vez que entrega un PDF que no es borrador; la copia (`document`) es la entrada del documento más los datos de la empresa de ese día, y con ella se vuelve a generar el PDF. La base filtra, cuenta, suma y pagina (`search_proformas`, `export_proformas`). La URL guarda búsqueda, fechas y página.
- **D. Fotos.** Bucket privado `images` con políticas para la cuenta dueña. El navegador reduce la foto a 600 px en JPEG, más una miniatura de 200 px, y las sube con la sesión. El servidor solo acepta referencias `products/<uuid>.jpg` y `lines/<uuid>.jpg`, descarga las miniaturas al armar el PDF y las dibuja en la columna «FOTO».

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres, Storage, RLS), Zod 4, React Hook Form, TanStack Query 5, nuqs 2, @react-pdf/renderer 4.9, ExcelJS 4.4.0, date-fns con `@date-fns/tz`, Vitest + Testing Library, Playwright.

**Spec:** [Proformas: productos libres, historial, fotos y mensaje editable](../specs/2026-10-06-proformas-libres-historial-fotos-design.md) (aprobada el 06-10-2026). Maqueta: [Proformas: maqueta de la nueva fase](https://claude.ai/artifact/EBXHNm17egfCJnVCJZJb5T).

## Global Constraints

- **Textos:** los de la spec (§4) y la maqueta, en español; dicen qué pasó y qué hacer, sin disculpas.
- **Mensaje de WhatsApp:** uno para la empresa, hasta **500** caracteres, con `{cliente}`, `{numero}`, `{total}`, `{vence}` y `{empresa}` (sin importar mayúsculas, tildes ni espacios: `{Número}` vale). Vacío = el mensaje de hoy: «Hola, {cliente}. Le envío la proforma {numero} por {total}, válida hasta el {vence}. Quedamos atentos. — {empresa}».
- **Producto libre:** descripción obligatoria (hasta 120), código opcional (hasta 64; en el PDF, «—»), cantidad de 1 a 9 999, precio mayor que cero con hasta dos decimales y foto opcional. **Nunca se guarda en el catálogo.**
- **Historial:**
  - se guarda para siempre y no se borra;
  - 20 por página, contadas en la base;
  - búsqueda por nombre (sin tildes ni mayúsculas), RUC, DNI, celular o N° de proforma (con un número, esa va primero);
  - fechas en días de Lima;
  - búsqueda, fechas y página en la URL;
  - «Corregir» conserva el número y actualiza la misma fila.
- **Copia guardada:** la entrada del documento (`draft: false`, con número y fecha fijados) y los datos de la empresa de ese día. El PDF del historial se vuelve a generar desde la copia; el mensaje es el de Empresa de hoy, con los datos de la copia.
- **Fotos:**
  - se eligen en JPG, PNG o WebP y se guardan en JPEG de 600 px por el lado mayor, con una miniatura de 200 px, calidad 0,82;
  - bucket privado `images`, sin borrar archivos;
  - rutas `products/<uuid>.jpg` y `lines/<uuid>.jpg` (más `<uuid>.thumb.jpg`): el bucket solo acepta esas y el servidor solo guarda referencias a la de 600 px.
- **PDF con fotos:** columna «FOTO» con las miniaturas, solo con el interruptor activo y alguna línea con foto; debajo de la tabla, «Imágenes referenciales.»; hasta 2,5 MB de fotos por PDF. Sin fotos, el PDF queda exactamente como hoy.
- **Excel:** tope de 10 000 filas, como Productos (`EXPORT_MAX_ROWS`).
- **Base de datos:**
  - migraciones nuevas que solo añaden;
  - funciones `security invoker` con `set search_path = ''`;
  - permisos solo para `authenticated`;
  - RLS para la cuenta dueña: `(select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner'`.
- **Dinero:** céntimos `bigint` o texto exacto; nunca coma flotante.
- **Fechas:** date-fns con `{ in: lima }` (`src/lib/dates.ts`).
- **Seguridad:** ningún secreto en el navegador; la subida de fotos usa la sesión de la cuenta. El navegador no decide totales ni rutas: el servidor recalcula y valida.
- **Pruebas:**
  - TDD;
  - Vitest en UTC;
  - integración solo contra el Supabase local (con Storage desde la tarea 15);
  - e2e en PC y en móvil.
- **Commits:**
  - en `main`, con una sola línea de asunto: sin cuerpo y sin `Co-Authored-By`;
  - archivos añadidos por nombre;
  - sin push.
- **Para publicar cada entrega:**
  1. copia de seguridad;
  2. `pnpm db:push` (lo ejecuta el usuario);
  3. push;
  4. en Vercel, **Create Deployment → `main`**.

## Decisiones del plan

1. **Cada línea tiene su `id`.** En las del catálogo es el id del producto (así `findLine(draft, product.id)` sigue igual); en las libres, `libre-<uuid>`. `productId` y `catalogPrice` son `null` en las libres. Los borradores guardados antes se leen: la línea sin `id` toma el de su producto.
2. **«Descripción» del producto libre es su nombre:** un campo de una línea, de hasta 120 caracteres, como en la maqueta. En el PDF sale en negrita, como el nombre de un producto.
3. **El formulario «Añadir producto libre» queda abierto y vacío tras añadir,** con el foco en Descripción: una proforma puede llevar 30 productos libres seguidos. Cada uno se confirma con «Añadiste «…»» y, desde el primero, «Cancelar» pasa a «Cerrar».
4. **«Nueva proforma» en Proformas empieza una vacía:**
   - si la proforma en curso ya se generó (tiene número), está en el historial y se reemplaza sin preguntar;
   - si tiene productos sin generar, pregunta antes: «Seguir con la actual» o «Empezar una nueva». Nada se borra sin que se elija.

   La barra de la proforma (la de Productos) también se ve en Proformas, y la ventana es la de hoy, «Completar proforma» (spec §4.3).
5. **«Seguir eligiendo productos» solo aparece desde Productos:** en Proformas no hay lista a la que volver.
6. **Se guarda en el servidor cada vez que sale un PDF que no es borrador** (al generar y al enviar), con un *upsert* por número.
   - «Corregir» y volver a generar actualiza la misma fila.
   - La vista previa (borrador) nunca se guarda.
   - Si no se puede guardar, el PDF no se entrega: «No pudimos guardar la proforma en el historial. Inténtalo de nuevo.».
7. **`include_photos` va dentro de `document`** (`input.includePhotos`) y no en una columna propia: ni la lista ni el Excel lo usan. La spec §5 lo lista como columna; es la única diferencia con el modelo de datos.
8. **Reenviar:** el servidor arma el PDF y el mensaje (plantilla de Empresa de hoy, datos de la copia, firma de la empresa de ese día) y los devuelve juntos. Así la vista previa del mensaje y lo que se envía coinciden.
9. **Cliente desde el historial:**
   - al completar un RUC o DNI válido, la proforma más reciente con ese documento completa solo los campos vacíos;
   - un RUC se consulta también en SUNAT, en paralelo, solo para mantener el aviso de baja o no habido;
   - sus datos rellenan el formulario únicamente si no hay historial.
10. **El editor del mensaje muestra el texto original cuando no hay uno guardado:** se ve qué se envía y se edita desde ahí. «Volver al mensaje original» lo vuelve a poner.
11. **Las fotos se muestran con URL firmadas de una hora,** pedidas con la sesión, una por foto (`usePhotoUrl`): añadir una línea no vuelve a pedir ni a descargar las demás. Con `next/image` y `unoptimized`, como indica la guía de Next para imágenes con autenticación.
12. **Una foto que no se puede leer al armar el PDF se deja fuera:** la fila sale sin foto y el PDF se genera igual. Solo se dibujan archivos que empiezan como JPEG, y como mucho 2,5 MB de fotos por PDF (unas 200 miniaturas): una respuesta de Vercel no pasa de 4,5 MB.
13. **La foto se sube al elegirla,** antes de «Guardar» o «Añadir». Si se cancela, el archivo queda huérfano; es aceptable porque no se borran archivos (spec §5).
14. **`filter_products` se vuelve a crear para devolver `image_path`:** al añadir un producto de la lista a la proforma se copia su foto. El JSON de `search_products` gana un campo; el código publicado lo ignora.
15. **El bucket se crea con `id`, `name` y `public`, sin límites de tamaño ni de tipo.** Esas columnas las añade el servicio de Storage y pueden faltar al recrear la base local. El tipo y el tamaño los garantiza el navegador (JPEG reducido), y la política del bucket exige el nombre `<uuid>.jpg` o `<uuid>.thumb.jpg` en una de las dos carpetas.
16. **«Productos» en el historial es la cantidad de líneas** de la proforma.
17. **`Pagination` y `EmptyState` pasan a `src/components/`;** la cabecera de los reportes Excel, a `excel/theme.ts`. Las usan Productos y Proformas.
18. **Cada foto se sube también en 200 px** (`<uuid>.thumb.jpg`), del mismo archivo leído una vez. El PDF y las líneas de la proforma usan la miniatura y la ficha del producto, la de 600 px: el PDF pesa unas cinco veces menos y se genera, envía y descarga antes.
19. **Datos del mensaje tolerantes:** `{Número}`, `{ CLIENTE }` y `{numero}` son el mismo dato. Lo que va entre llaves y no es un dato se deja tal cual, y el editor lo avisa.
20. **Búsqueda también por N° de proforma y por celular** (sin espacios). Con un número, esa proforma va primero; después, de la más reciente a la más antigua.
21. **«Vencida»:** la lista lo marca cuando la validez ya pasó y «Reenviar» lo advierte. Se calcula con el día de hoy en Lima; no es un estado guardado (los estados siguen fuera de alcance).
22. **El PDF de cada proforma se reutiliza un minuto en el navegador:** «Ver PDF», «Descargar PDF» y «Reenviar» comparten la consulta `historyKeys.document(id)`. Un doble clic no genera dos PDF.
23. **El nombre del cliente muestra todas sus proformas:** busca su RUC o DNI (o su nombre, si no tiene) y quita el filtro de fecha.
24. **Ya generada: «Quedó guardada en el historial»**, con el enlace a Proformas si se generó desde Productos.
25. **La foto elegida se ve al instante,** con una copia local, mientras se reduce y se sube. Si el navegador no puede leerla, lo dice («No pudimos leer esta foto…»), distinto de un fallo de conexión.
26. **Una prueba congela la copia tal como se guarda hoy:** las proformas se guardan para siempre, así que un campo nuevo de la entrada del documento o de la empresa necesita un valor por defecto. Si no lo tiene, la prueba falla.

## Review Focus

1. **Borradores viejos en el navegador:** líneas sin `id`, sin `imagePath` y sin `includePhotos` (de antes de esta fase) se siguen abriendo, editando y generando. Pruebas en las tareas 3 y 18.
2. **«Corregir» y dos pestañas:**
   - el mismo número actualiza la misma fila, con la fecha original;
   - la vista previa nunca guarda;
   - enviar vuelve a guardar sin duplicar.

   Pruebas en la tarea 8.
3. **Búsqueda y fechas del historial:** `%`, `_` y `\` como texto literal, tildes y mayúsculas, un documento a medias, y una proforma de las 23:30 de Lima (que en UTC ya es el día siguiente). Pruebas en la tarea 7.
4. **Rutas de fotos manipuladas:** fuera de `products/` o `lines/`, `../`, `.png`, un nombre que no es un uuid, otra cuenta o sin sesión. Las rechazan el bucket y los schemas. Pruebas en las tareas 15, 16 y 18.
5. **Proformas largas:** un producto libre sin código y con nombre largo entre muchas filas con foto (diseño compacto) sale con «—» y la tabla no se desborda; más fotos que el tope dejan fuera las sobrantes sin romper el PDF. Pruebas en las tareas 3 y 18.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
| --- | --- | --- |
| `supabase/migrations/202610060001_whatsapp_message.sql` | Columna `whatsapp_message` | 1 |
| `src/features/company/schemas.ts`, `queries.ts` | Mensaje en el schema; forma de lo guardado | 1, 8 |
| `src/features/proforma/document/format.ts` | `whatsappMessage(plantilla, datos)` y el mensaje original | 1 |
| `src/features/proforma/document/service.ts` | Devuelve la empresa; guarda en el historial; fotos | 1, 8, 18 |
| `src/features/proforma/document/send.ts` | Mensaje de Empresa; `deliverByWhatsApp` | 1, 9 |
| `src/features/company/components/message-editor.tsx` | Pestaña «Mensaje» | 2 |
| `src/features/company/components/company-form.tsx` | Quinta pestaña | 2 |
| `src/features/proforma/draft.ts` | Líneas con `id`, productos libres, fotos | 3, 4, 18 |
| `src/features/proforma/components/proforma-free-line.tsx` | Formulario «Añadir producto libre» | 4, 19 |
| `src/features/proforma/components/proforma-lines.tsx` | Claves por línea, «Producto libre», miniaturas | 3, 4, 19 |
| `src/app/(private)/proformas/page.tsx` | Ruta Proformas | 5 |
| `src/features/proforma/history/components/proformas-screen.tsx` | Pantalla Proformas | 5, 10, 11, 12 |
| `src/features/proforma/history/components/new-proforma-prompt.tsx` | Pregunta de «Nueva proforma» con una sin generar | 5 |
| `src/features/proforma/components/proforma-ready.tsx` | Mensaje de Empresa, «Quedó guardada en el historial», chat bloqueado | 1, 8, 12 |
| `src/components/app-shell.tsx` | «Proformas» en el menú | 5 |
| `next.config.ts` | Fuentes y logotipo del PDF en `/proformas` | 5 |
| `src/components/pagination.tsx`, `empty-state.tsx` | Compartidos por Productos y Proformas | 6 |
| `src/features/catalog/products/components/date-filter.tsx`, `list-options.ts` | Filtro de fecha sin «¿Qué fecha?» | 6 |
| `supabase/migrations/202610060002_proforma_history.sql` | Tabla `proformas` y sus funciones | 7 |
| `src/features/proforma/history/snapshot.ts` | Forma de la copia | 8 |
| `src/features/proforma/history/repository.ts` | Guardar o actualizar por número | 8 |
| `src/features/proforma/history/service.ts` | PDF y mensaje desde la copia; reenvío | 9 |
| `src/features/proforma/history/actions.ts` | Ver, reenviar y Excel | 9, 11 |
| `src/features/proforma/history/queries.ts` | Lista, Excel y cliente | 10, 11, 13 |
| `src/features/proforma/history/search-params.ts`, `hooks.ts` | URL, caché y acciones del navegador | 10, 13 |
| `src/features/proforma/history/components/history-filters.tsx`, `history-results.tsx` | Filtros, tabla, tarjetas y páginas | 10, 12 |
| `src/features/proforma/history/export-request.ts`, `excel.ts` | Filtros, nombre y reporte del Excel | 11 |
| `src/features/proforma/history/components/resend-dialog.tsx` | Ventana «Reenviar» | 12 |
| `src/features/proforma/components/chat-blocked.tsx` | Aviso de pestaña de WhatsApp bloqueada | 12 |
| `src/features/proforma/components/proforma-client.tsx` | Cliente desde el historial | 13 |
| `supabase/migrations/202610060003_photos.sql` | Bucket, políticas y `products.image_path` | 15 |
| `src/lib/photos.ts`, `src/components/photo-field.tsx` | Reducir, subir y mostrar fotos | 16 |
| `src/features/catalog/**` (schemas, types, queries, form, detail) | Foto del producto | 17 |
| `src/features/proforma/document/input.ts`, `model.ts`, `photos.ts`, `pdf.tsx` | Columna «FOTO» | 18 |
| `src/features/proforma/components/proforma-summary.tsx` | Interruptor «Incluir fotos en el PDF» | 19 |
| `docs/deployment.md`, `docs/setup.md` | Migraciones y Supabase local con Storage | 2, 14, 15, 20 |

---

## Parte A — Mensaje de WhatsApp editable

### Task 1: Columna del mensaje y mensaje con datos

**Files:**
- Create: `supabase/migrations/202610060001_whatsapp_message.sql`
- Modify:
  - `src/lib/supabase/database.types.ts` (generado)
  - `src/features/company/schemas.ts`
  - `src/features/company/queries.ts`
  - `src/features/proforma/document/format.ts`
  - `src/features/proforma/document/service.ts`
  - `src/features/proforma/document/send.ts`
  - `src/features/proforma/components/proforma-ready.tsx`
  - `tests/support/company.ts`
- Test: `tests/unit/document-format.test.ts`, `tests/unit/company-schemas.test.ts`, `tests/integration/company-profile.test.ts`, `tests/integration/whatsapp-service.test.ts`, `tests/components/proforma-ready.test.tsx`

**Interfaces:**
- Produces:
  - `company_profile.whatsapp_message text null` (hasta 500);
  - `CompanyProfile.whatsapp_message: string | null` y `companyProfileSchema.shape.whatsapp_message` (vacío → `null`);
  - en `format.ts`:
    - `DEFAULT_WHATSAPP_MESSAGE: string`;
    - `WHATSAPP_MESSAGE_LIMIT = 500`;
    - `MESSAGE_FIELDS: readonly { token: string; label: string }[]`;
    - `whatsappMessage(template: string | null, data: { clientName; numberLabel; total; validUntil; sender }): string`: reconoce los datos sin importar mayúsculas, tildes ni espacios (`{Número}`, `{ CLIENTE }`);
    - `unknownMessageFields(template: string): string[]`: lo que va entre llaves y no es un dato, sin repetir;
  - `renderProformaDocument(...)` → `ActionResult<{ model: DocumentModel; pdf: Buffer; company: CompanyProfile }>`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/document-format.test.ts`: añade `DEFAULT_WHATSAPP_MESSAGE`, `MESSAGE_FIELDS` y `unknownMessageFields` a la importación de `@/features/proforma/document/format` y reemplaza el bloque `describe('WhatsApp', …)` por:

```ts
describe('mensaje de WhatsApp', () => {
  const data = {
    clientName: 'Cliente de ejemplo S.A.C.',
    numberLabel: 'N° 0001',
    total: 'S/ 8,114.00',
    validUntil: '07/10/2026',
    sender: 'Ventronix',
  }

  it('sin mensaje en Empresa usa el original, sin doble punto', () => {
    const expected =
      'Hola, Cliente de ejemplo S.A.C. Le envío la proforma N° 0001 por S/ 8,114.00, válida hasta el 07/10/2026. Quedamos atentos. — Ventronix'
    expect(whatsappMessage(null, data)).toBe(expected)
    expect(whatsappMessage('   ', data)).toBe(expected)
  })

  it('reemplaza los datos del mensaje de Empresa y deja tal cual lo demás', () => {
    expect(
      whatsappMessage(
        'Buen día, {cliente}. Adjunto la {numero} por {total} ({vence}). {precio} — {empresa}',
        data,
      ),
    ).toBe(
      'Buen día, Cliente de ejemplo S.A.C. Adjunto la N° 0001 por S/ 8,114.00 (07/10/2026). {precio} — Ventronix',
    )
  })

  it('reconoce los datos aunque se escriban con mayúsculas, tildes o espacios', () => {
    expect(whatsappMessage('Hola {Cliente}, su {Número} por { TOTAL }.', data)).toBe(
      'Hola Cliente de ejemplo S.A.C., su N° 0001 por S/ 8,114.00.',
    )
  })

  it('dice qué va entre llaves y no es un dato, sin repetirlo', () => {
    expect(unknownMessageFields('Hola {cliente}: {precio}, {Fecha} y {precio}')).toEqual([
      '{precio}',
      '{Fecha}',
    ])
    expect(unknownMessageFields(DEFAULT_WHATSAPP_MESSAGE)).toEqual([])
  })

  it('el mensaje original usa todos los datos', () => {
    for (const field of MESSAGE_FIELDS) expect(DEFAULT_WHATSAPP_MESSAGE).toContain(field.token)
  })

  it('abre el chat del celular peruano con el mensaje', () => {
    expect(whatsappLink('987 654 321', 'Hola, ¿qué tal?')).toBe(
      'https://wa.me/51987654321?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F',
    )
  })
})
```

`tests/unit/company-schemas.test.ts`, dentro de `describe('companyProfileSchema', …)`:

```ts
  it('el mensaje de WhatsApp vacío vuelve al original y tiene hasta 500 caracteres', () => {
    expect(companyProfileSchema.parse({ ...valid, whatsapp_message: '  ' }).whatsapp_message).toBe(
      null,
    )
    expect(
      companyProfileSchema.parse({ ...valid, whatsapp_message: ' Hola {cliente} ' })
        .whatsapp_message,
    ).toBe('Hola {cliente}')
    expect(issues({ ...valid, whatsapp_message: 'x'.repeat(501) })).toEqual([
      'whatsapp_message: Usa como máximo 500 caracteres.',
    ])
  })
```

`tests/integration/company-profile.test.ts`: en «empiezan vacíos…» añade `whatsapp_message: null` al `toMatchObject`, y al final del `describe`:

```ts
  it('guarda el mensaje de WhatsApp; la base no admite más de 500 caracteres', async () => {
    const message = 'Hola {cliente}, le envío la {numero}.'
    expect(
      await saveCompanyProfileRow(supabase, { ...input, whatsapp_message: message }),
    ).toMatchObject({ ok: true, data: { whatsapp_message: message } })
    expect(await getCompanyProfile(supabase)).toMatchObject({ whatsapp_message: message })
    expect(
      await sqlState(
        db.query("update public.company_profile set whatsapp_message = repeat('x', 501)"),
      ),
    ).toBe('23514')
  })
```

`tests/integration/whatsapp-service.test.ts`: añade `import type { SendDocumentInput, WhatsAppProvider } from '@/features/whatsapp/provider'` y, dentro de `describe('proforma por WhatsApp', …)`:

```ts
  it('el mensaje es el de Empresa, con los datos de la proforma', async () => {
    await db.query(
      "update public.company_profile set trade_name = 'Ventronix', whatsapp_message = 'Hola {cliente}: su {numero} por {total} vence el {vence}. {empresa}'",
    )
    const sent: SendDocumentInput[] = []
    const provider: WhatsAppProvider = {
      ...stubWhatsAppProvider(supabase),
      sendDocument: async (document) => {
        sent.push(document)
        return { ok: true }
      },
    }
    expect(await sendProformaDocument(supabase, proforma(), provider)).toMatchObject({ ok: true })
    expect(sent[0].caption).toBe(
      'Hola Cliente de ejemplo S.A.C.: su N° 0001 por S/ 2,590.00 vence el 07/10/2026. Ventronix',
    )
  })
```

`tests/components/proforma-ready.test.tsx`:
- añade `import type { CompanyProfile } from '@/features/company/schemas'`;
- cambia `renderReady` para recibir un tercer parámetro `profile: Partial<CompanyProfile> = {}`, y pásalo como `profile: { ...completeCompany, trade_name: 'Ventronix', ...profile }`;
- añade la prueba:

```ts
  it('abre el chat con el mensaje de Empresa', async () => {
    seed()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const { user } = renderReady(undefined, undefined, {
      whatsapp_message: 'Hola {cliente}, su {numero} por {total}.',
    })
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/51900000000?text=${encodeURIComponent('Hola Cliente de ejemplo S.A.C., su N° 0001 por S/ 2,590.00.')}`,
      '_blank',
    )
  })
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/document-format.test.ts tests/unit/company-schemas.test.ts`
Expected: FAIL. `DEFAULT_WHATSAPP_MESSAGE` no existe, `whatsappMessage(null, data)` no es la firma actual y el schema no conoce `whatsapp_message` (el `issues` de 501 caracteres sale vacío).

- [ ] **Step 3: Escribir la migración, aplicarla y regenerar los tipos**

`supabase/migrations/202610060001_whatsapp_message.sql`:

```sql
-- Mensaje que acompaña al PDF por WhatsApp (spec de proformas libres, historial y fotos §3 y §4.6).
-- Nulo: el mensaje original. Los datos entre llaves ({cliente}, {numero}…) los pone la app al enviar.
-- Los permisos y las políticas de la tabla ya cubren la columna nueva.
alter table public.company_profile
  add column whatsapp_message text check (char_length(whatsapp_message) <= 500);
```

Run: `pnpm exec supabase migration up && pnpm db:types && pnpm exec prettier --write src/lib/supabase/database.types.ts`
Expected: «Applying migration 202610060001_whatsapp_message.sql…» sin errores; `database.types.ts` incluye `whatsapp_message: string | null` en `company_profile`.

- [ ] **Step 4: Implementar**

`src/features/company/schemas.ts`: al final de `companyProfileSchema`, después de `wallets`:

```ts
  // Vacío: el mensaje original (spec de proformas libres §3). Hasta 500 caracteres.
  whatsapp_message: optionalText(500),
```

y en `CompanyProfile`, antes de `updated_at`:

```ts
  whatsapp_message: string | null
```

`src/features/company/queries.ts`:

```ts
export const companyColumns =
  'legal_name, trade_name, ruc, address, phones, email, payment_terms, return_policy, default_validity_days, bank_accounts, wallets, whatsapp_message, updated_at'
```

`tests/support/company.ts`: en `emptyCompany`, antes de `updated_at`, añade `whatsapp_message: null,`.

`src/features/proforma/document/format.ts`: reemplaza el tipo `WhatsappMessageInput` y la función `whatsappMessage` por:

```ts
// Mensaje que acompaña al PDF (spec de proformas libres §3 y §4.6): el de Empresa o, si está vacío,
// el de siempre. Los datos van entre llaves.
export const DEFAULT_WHATSAPP_MESSAGE =
  'Hola, {cliente}. Le envío la proforma {numero} por {total}, válida hasta el {vence}. Quedamos atentos. — {empresa}'

export const WHATSAPP_MESSAGE_LIMIT = 500

// Los datos que se pueden insertar, en el orden de los botones de Empresa.
export const MESSAGE_FIELDS = [
  { token: '{cliente}', label: 'Cliente' },
  { token: '{numero}', label: 'N° de proforma' },
  { token: '{total}', label: 'Total' },
  { token: '{vence}', label: 'Válida hasta' },
  { token: '{empresa}', label: 'Empresa' },
] as const

type WhatsappMessageInput = {
  clientName: string
  numberLabel: string
  total: string
  validUntil: string
  sender: string
}

// Un dato entre llaves, quizá seguido de punto. Mayúsculas, tildes y espacios no importan:
// «{Número}» y «{ numero }» son {numero} (plan, decisión 19).
const FIELD_PATTERN = /\{([^{}\n]{1,20})\}(\.?)/g
const fieldKey = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

// Lo que no es un dato queda tal cual. Un dato seguido de punto no lo duplica: «S.A.C.».
export function whatsappMessage(template: string | null, data: WhatsappMessageInput) {
  const values = new Map([
    ['cliente', data.clientName.trim()],
    ['numero', data.numberLabel],
    ['total', data.total],
    ['vence', data.validUntil],
    ['empresa', data.sender],
  ])
  return (template?.trim() || DEFAULT_WHATSAPP_MESSAGE).replace(
    FIELD_PATTERN,
    (whole: string, text: string, dot: string) => {
      const value = values.get(fieldKey(text))
      if (value === undefined) return whole
      return dot ? `${value.replace(/\.+$/, '')}.` : value
    },
  )
}

// Lo que va entre llaves y no es un dato: se enviaría tal cual, y el editor de Empresa lo avisa.
export function unknownMessageFields(template: string) {
  const known = new Set(MESSAGE_FIELDS.map((field) => field.token.slice(1, -1)))
  const unknown = [...template.matchAll(FIELD_PATTERN)]
    .map(([, text]) => text)
    .filter((text) => !known.has(fieldKey(text)))
  return [...new Set(unknown)].map((text) => `{${text}}`)
}
```

`src/features/proforma/document/service.ts`: importa `import type { CompanyProfile } from '@/features/company/schemas'`, cambia el tipo de retorno de `renderProformaDocument` a `Promise<ActionResult<{ model: DocumentModel; pdf: Buffer; company: CompanyProfile }>>` y su último `return` a:

```ts
  return { ok: true, data: { model, pdf: await renderProformaPdf(model), company } }
```

`src/features/proforma/document/send.ts`: cambia `const { model, pdf } = document.data` por `const { model, pdf, company } = document.data` y la llamada del pie por `whatsappMessage(company.whatsapp_message, { … })` con los mismos datos de hoy.

`src/features/proforma/components/proforma-ready.tsx`: la llamada pasa a `whatsappMessage(profile?.whatsapp_message ?? null, { … })` con los mismos datos.

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/document-format.test.ts tests/unit/company-schemas.test.ts && pnpm exec vitest run --project components tests/components/proforma-ready.test.tsx && pnpm exec vitest run --project integration tests/integration/company-profile.test.ts tests/integration/whatsapp-service.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS en todo; sin errores de tipos ni de lint.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202610060001_whatsapp_message.sql src/lib/supabase/database.types.ts src/features/company/schemas.ts src/features/company/queries.ts src/features/proforma/document/format.ts src/features/proforma/document/service.ts src/features/proforma/document/send.ts src/features/proforma/components/proforma-ready.tsx tests/support/company.ts tests/unit/document-format.test.ts tests/unit/company-schemas.test.ts tests/integration/company-profile.test.ts tests/integration/whatsapp-service.test.ts tests/components/proforma-ready.test.tsx
git commit -m "feat: send proformas with the company's own WhatsApp message"
```

---

### Task 2: Pestaña «Mensaje» en Empresa

**Files:**
- Create: `src/features/company/components/message-editor.tsx`
- Modify: `src/features/company/components/company-form.tsx`, `docs/deployment.md`
- Test: `tests/components/company-form.test.tsx`, `tests/e2e/company.spec.ts`

**Interfaces:**
- Consumes: `DEFAULT_WHATSAPP_MESSAGE`, `WHATSAPP_MESSAGE_LIMIT`, `MESSAGE_FIELDS`, `whatsappMessage` (tarea 1); `companyProfileSchema.shape.whatsapp_message` (tarea 1).
- Produces: `MessageEditor({ field, value, error, sender, onChange })`; la pestaña `mensaje` de `CompanyForm`.

- [ ] **Step 1: Escribir las pruebas**

`tests/components/company-form.test.tsx`: añade `import { DEFAULT_WHATSAPP_MESSAGE } from '@/features/proforma/document/format'` y, al final del archivo:

```tsx
describe('mensaje de WhatsApp', () => {
  it('muestra el mensaje original y cómo lo recibe el cliente, con datos de ejemplo', async () => {
    const { user } = renderForm({ ...completeCompany, trade_name: 'Ventronix' })
    await user.click(tab(/Mensaje/))
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue(DEFAULT_WHATSAPP_MESSAGE)
    expect(
      screen.getByText(
        'Hola, Inversiones Nuevo Sol S.A.C. Le envío la proforma N° 0049 por S/ 6,760.00, válida hasta el 13/10/2026. Quedamos atentos. — Ventronix',
      ),
    ).toBeVisible()
    expect(screen.getByText(`${DEFAULT_WHATSAPP_MESSAGE.length} / 500`)).toBeVisible()
  })

  it('inserta un dato donde está el cursor y guarda el mensaje', async () => {
    const { onSubmit, user } = renderForm(completeCompany)
    await user.click(tab(/Mensaje/))
    const text = screen.getByLabelText('Texto del mensaje')
    await user.clear(text)
    await user.type(text, 'Adjunto su proforma por ')
    const fields = within(screen.getByRole('group', { name: 'Insertar dato' }))
    await user.click(fields.getByRole('button', { name: 'Total' }))
    expect(text).toHaveValue('Adjunto su proforma por {total}')
    expect(screen.getByText('Adjunto su proforma por S/ 6,760.00')).toBeVisible()
    await user.click(save())
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ whatsapp_message: 'Adjunto su proforma por {total}' }),
      ),
    )
  })

  it('avisa si algo entre llaves no es un dato', async () => {
    const { user } = renderForm(completeCompany)
    await user.click(tab(/Mensaje/))
    const text = screen.getByLabelText('Texto del mensaje')
    await user.clear(text)
    await user.click(text)
    await user.paste('Hola {cliente}, su precio es {precio}')
    expect(
      screen.getByText(
        '{precio} no es un dato y se enviará tal cual. Usa los botones para insertar los datos.',
      ),
    ).toBeVisible()
  })

  it('«Volver al mensaje original» lo recupera', async () => {
    const { user } = renderForm({ ...completeCompany, whatsapp_message: 'Hola {cliente}' })
    await user.click(tab(/Mensaje/))
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue('Hola {cliente}')
    await user.click(screen.getByRole('button', { name: 'Volver al mensaje original' }))
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue(DEFAULT_WHATSAPP_MESSAGE)
  })
})
```

`tests/e2e/company.spec.ts`: cambia la importación a `import { connect, fillCompanyProfile, resetCompanyProfile } from '../integration/db'` y añade:

```ts
test('cambia el mensaje de WhatsApp y lo conserva', async ({ page }) => {
  const db = await connect()
  try {
    await fillCompanyProfile(db)
  } finally {
    await db.end()
  }
  await login(page)
  await page.getByRole('link', { name: 'Empresa' }).click()
  // Las cinco pestañas caben, también en el teléfono.
  const tabs = page.getByRole('tablist', { name: 'Secciones de los datos de la empresa' })
  expect(await tabs.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
  await page.getByRole('tab', { name: /Mensaje/ }).click()
  const text = page.getByLabel('Texto del mensaje')
  await text.fill('Buen día, {cliente}. Adjunto la proforma ')
  await page
    .getByRole('group', { name: 'Insertar dato' })
    .getByRole('button', { name: 'N° de proforma' })
    .click()
  await expect(text).toHaveValue('Buen día, {cliente}. Adjunto la proforma {numero}')
  await expect(
    page.getByText('Buen día, Inversiones Nuevo Sol S.A.C. Adjunto la proforma N° 0049'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()

  await page.reload()
  await page.getByRole('tab', { name: /Mensaje/ }).click()
  await expect(page.getByLabel('Texto del mensaje')).toHaveValue(
    'Buen día, {cliente}. Adjunto la proforma {numero}',
  )
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project components tests/components/company-form.test.tsx`
Expected: FAIL en las tres nuevas: no hay pestaña «Mensaje».

- [ ] **Step 3: Escribir el editor del mensaje**

`src/features/company/components/message-editor.tsx`:

```tsx
'use client'

import { useRef } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  DEFAULT_WHATSAPP_MESSAGE,
  MESSAGE_FIELDS,
  unknownMessageFields,
  WHATSAPP_MESSAGE_LIMIT,
  whatsappMessage,
} from '@/features/proforma/document/format'

const listFormat = new Intl.ListFormat('es', { type: 'conjunction' })

// Datos de ejemplo de la vista previa (maqueta «Empresa · mensaje de WhatsApp»).
const EXAMPLE = {
  clientName: 'Inversiones Nuevo Sol S.A.C.',
  numberLabel: 'N° 0049',
  total: 'S/ 6,760.00',
  validUntil: '13/10/2026',
}

type MessageEditorProps = {
  field: UseFormRegisterReturn<'whatsapp_message'>
  value: string
  error?: string
  // Firma de {empresa}: como en el documento, el nombre comercial o la razón social.
  sender: string
  onChange: (value: string) => void
}

// Pestaña «Mensaje» (spec §4.6): el texto, los datos que se insertan, el contador y cómo lo recibe
// el cliente.
export function MessageEditor({ field, value, error, sender, onChange }: MessageEditorProps) {
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  // Lo que va entre llaves y no es un dato se enviaría tal cual (plan, decisión 19).
  const unknown = unknownMessageFields(value)

  // El dato entra donde está el cursor (o en lugar de lo seleccionado) y el cursor queda detrás.
  function insert(token: string) {
    const element = textarea.current
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    if (next.length > WHATSAPP_MESSAGE_LIMIT) return
    onChange(next)
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-3">
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold text-foreground">Mensaje al enviar por WhatsApp</h3>
          <p className="text-sm text-muted-foreground">
            Acompaña al PDF cuando lo envías y cuando lo reenvías desde el historial.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="company-message" className="text-sm font-medium text-foreground">
            Texto del mensaje
          </Label>
          <Textarea
            id="company-message"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'company-message-error' : 'company-message-help'}
            maxLength={WHATSAPP_MESSAGE_LIMIT}
            className="min-h-28 bg-card px-3 leading-normal"
            {...field}
            ref={(element) => {
              field.ref(element)
              textarea.current = element
            }}
          />
        </div>
        <div role="group" aria-label="Insertar dato" className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="text-[13px] text-muted-foreground">
            Insertar dato:
          </span>
          {MESSAGE_FIELDS.map((item) => (
            <Button
              key={item.token}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => insert(item.token)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {error ? (
          <p id="company-message-error" className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : (
          <p
            id="company-message-help"
            className="flex flex-wrap justify-between gap-2 text-[13px] text-muted-foreground"
          >
            <span>Los datos entre llaves se reemplazan solos al enviar.</span>
            <span className="tabular-nums">
              {value.length} / {WHATSAPP_MESSAGE_LIMIT}
            </span>
          </p>
        )}
        {unknown.length > 0 ? (
          <p role="status" className="text-xs font-medium text-amber-800">
            {listFormat.format(unknown)}{' '}
            {unknown.length === 1 ? 'no es un dato y se enviará' : 'no son datos y se enviarán'} tal
            cual. Usa los botones para insertar los datos.
          </p>
        ) : null}
        <button
          type="button"
          className="justify-self-start text-[13px] font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3"
          onClick={() => onChange(DEFAULT_WHATSAPP_MESSAGE)}
        >
          Volver al mensaje original
        </button>
      </div>

      <figure className="grid gap-2.5">
        <figcaption className="text-[13px] font-semibold text-muted-foreground">
          Así lo recibe el cliente
        </figcaption>
        <div className="grid justify-items-end rounded-[14px] bg-[#e9e4dc] p-4">
          <div className="grid max-w-[300px] gap-2 rounded-[10px] rounded-br-sm bg-[#d9fdd3] p-2 shadow-xs">
            <div className="flex items-center gap-2.5 rounded-lg bg-white/65 p-2.5">
              <span
                aria-hidden
                className="grid h-10 w-8.5 shrink-0 place-items-center rounded bg-[#d92d20] text-[9px] font-extrabold text-white"
              >
                PDF
              </span>
              <span className="min-w-0 truncate text-xs font-semibold">
                Proforma-0049-Inversiones-Nuevo-Sol-SAC.pdf
              </span>
            </div>
            <p className="mx-1 text-[13.5px] leading-normal whitespace-pre-line [overflow-wrap:anywhere]">
              {whatsappMessage(value, { ...EXAMPLE, sender })}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Vista previa con datos de ejemplo.</p>
      </figure>
    </div>
  )
}
```

- [ ] **Step 4: Añadir la pestaña al formulario**

`src/features/company/components/company-form.tsx`:
- añade `MessageCircle` a la importación de `lucide-react`, `import { DEFAULT_WHATSAPP_MESSAGE } from '@/features/proforma/document/format'` e `import { MessageEditor } from './message-editor'`;
- en `SECTIONS`, después de `pagos`:

```ts
  { value: 'mensaje', label: 'Mensaje', icon: MessageCircle, fields: ['whatsapp_message'] },
```

- en `SCALAR_FIELDS`, añade `'whatsapp_message'` al final;
- en `toFormValues`, después de `wallets`:

```ts
    // Sin mensaje guardado se ve el original: así se sabe qué se envía (plan, decisión 10).
    whatsapp_message: profile.whatsapp_message ?? DEFAULT_WHATSAPP_MESSAGE,
```

- en `complete`, añade `mensaje: false,`;
- en `Tabs.List`, cambia `grid-cols-4` por `grid-cols-5`;
- después del `Tabs.Content` de `pagos`:

```tsx
          <Tabs.Content value="mensaje" className={panel}>
            <MessageEditor
              field={register('whatsapp_message')}
              value={live.whatsapp_message ?? ''}
              error={errors.whatsapp_message?.message}
              sender={live.trade_name?.trim() || live.legal_name?.trim() || 'Ventronix'}
              onChange={(text) =>
                setValue('whatsapp_message', text, { shouldDirty: true, shouldValidate: true })
              }
            />
          </Tabs.Content>
```

`docs/deployment.md`, en la lista «Las más recientes son:», añade al final:

```md
- `202610060001_whatsapp_message.sql`: el mensaje de WhatsApp editable en Empresa. Añade una columna. **Aplícala antes de publicar el código:** la app la lee al cargar Empresa y cada proforma, y sin ella esas pantallas fallan.
```

y, en la lista de comprobaciones, antes de «Cerrar sesión…»:

```md
- [ ] **Mensaje de WhatsApp:** en Empresa › Mensaje, cambia el texto, guarda y recarga: sigue ahí. «Volver al mensaje original» lo recupera.
```

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components tests/components/company-form.test.tsx tests/components/company-screen.test.tsx && pnpm typecheck && pnpm lint && pnpm exec playwright test tests/e2e/company.spec.ts`
Expected: PASS en las pruebas de componentes y en las e2e de Empresa (PC y móvil); sin errores de tipos ni de lint.

- [ ] **Step 6: Commit**

```bash
git add src/features/company/components/message-editor.tsx src/features/company/components/company-form.tsx docs/deployment.md tests/components/company-form.test.tsx tests/e2e/company.spec.ts
git commit -m "feat: edit the WhatsApp message in a new Empresa tab"
```

---

## Parte B — Productos libres y «Nueva proforma»

### Task 3: Líneas con su propio id y productos libres en el borrador

**Files:**
- Modify:
  - `src/features/proforma/draft.ts`
  - `src/features/proforma/store.tsx`
  - `src/features/proforma/readiness.ts`
  - `src/features/proforma/components/proforma-lines.tsx`
  - `src/features/proforma/components/proforma-dialog.tsx`
  - `src/features/proforma/document/input.ts`
  - `src/features/proforma/document/model.ts`
  - `tests/support/proforma.ts`
  - `tests/components/proforma-editor.test.tsx` (línea 111)
  - `tests/components/proforma-control.test.tsx` (línea 11)
- Test: `tests/unit/proforma-draft.test.ts`, `tests/unit/proforma-readiness.test.ts`, `tests/unit/document-model.test.ts`

**Interfaces:**
- Produces:
  - `ProformaLine = { id: string; productId: string | null; code: string; name: string; description: string | null; catalogPrice: string | null; unitPrice: string; quantity: number }`;
  - por id de línea: `findLine(draft, id)`, `setQuantity(draft, id, quantity)`, `setUnitPrice(draft, id, unitPrice)`, `restorePrice(draft, id)`, `applyCatalogPrice(draft, id, price)`, `removeLine(draft, id)`;
  - `FreeLineInput = Pick<ProformaLine, 'code' | 'name' | 'unitPrice' | 'quantity'>` y `addFreeLine(draft, input, id = 'libre-<uuid>')`;
  - `useRemoveLine()` → `(id: string) => void`;
  - `firstPendingField(draft)` → `line-<id>-quantity` o `line-<id>-price`;
  - `documentInputSchema`: el código de una línea puede ir vacío; `buildDocumentModel` lo dibuja como «—»;
  - en `tests/support/proforma.ts`: `line(overrides)` (su `id` es el `productId`) y `freeLine(overrides)`.

- [ ] **Step 1: Escribir las pruebas**

`tests/support/proforma.ts`: reemplaza `line` y añade `freeLine`:

```ts
// Línea del catálogo: su id es el del producto (plan, decisión 1).
export const line = (overrides: Partial<ProformaLine> = {}): ProformaLine => {
  const productId =
    overrides.productId === undefined ? '8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c' : overrides.productId
  return {
    id: productId ?? 'libre-1',
    productId,
    code: 'LAP-001',
    name: 'Laptop de 14 pulgadas',
    description: null,
    catalogPrice: '2590.00',
    unitPrice: '2590.00',
    quantity: 1,
    ...overrides,
  }
}

// Producto libre (spec de productos libres §4.3): sin producto, sin código y sin precio de catálogo.
export const freeLine = (overrides: Partial<ProformaLine> = {}): ProformaLine =>
  line({
    id: 'libre-1',
    productId: null,
    code: '',
    name: 'Instalación en sitio',
    catalogPrice: null,
    unitPrice: '350.00',
    ...overrides,
  })
```

`tests/components/proforma-editor.test.tsx`, línea 111: `new Map([[line().id, '2490.00']])`. `tests/components/proforma-control.test.tsx`, línea 11: `id: line().id,`.

`tests/unit/proforma-draft.test.ts`:
- añade `addFreeLine` a la importación;
- en la primera prueba, añade `id: 'p1',` antes de `productId: 'p1'` en el objeto esperado;
- al final:

```ts
describe('productos libres', () => {
  const service = { code: '', name: 'Instalación en sitio', unitPrice: '350', quantity: 2 }

  it('se añaden con su código opcional, sin producto ni precio de catálogo', () => {
    expect(addFreeLine(EMPTY_DRAFT, service, 'libre-1').lines).toEqual([
      {
        id: 'libre-1',
        productId: null,
        code: '',
        name: 'Instalación en sitio',
        description: null,
        catalogPrice: null,
        unitPrice: '350',
        quantity: 2,
      },
    ])
  })

  it('cada uno es una línea propia, aunque se repita la descripción', () => {
    const draft = addFreeLine(addFreeLine(EMPTY_DRAFT, service, 'libre-1'), service, 'libre-2')
    expect(draft.lines.map((item) => item.id)).toEqual(['libre-1', 'libre-2'])
  })

  it('sin id indicado, cada línea recibe uno nuevo', () => {
    const [first, second] = addFreeLine(addFreeLine(EMPTY_DRAFT, service), service).lines
    expect(first.id).toMatch(/^libre-[0-9a-f-]{36}$/)
    expect(second.id).not.toBe(first.id)
  })

  it('se cambian y se quitan por su línea, sin tocar los del catálogo', () => {
    const draft = addFreeLine(addProduct(EMPTY_DRAFT, laptop), service, 'libre-1')
    expect(setQuantity(draft, 'libre-1', 3).lines.map((item) => item.quantity)).toEqual([1, 3])
    expect(
      restorePrice(setUnitPrice(draft, 'libre-1', '300'), 'libre-1').lines[1].unitPrice,
    ).toBe('300')
    expect(removeLine(draft, 'libre-1').lines.map((item) => item.id)).toEqual(['p1'])
  })

  it('lee los borradores anteriores, que identificaban la línea por su producto', () => {
    const old = {
      ...EMPTY_DRAFT,
      lines: [
        {
          productId: 'p1',
          code: 'LAP-001',
          name: 'Laptop',
          description: null,
          catalogPrice: '2590.00',
          unitPrice: '2590.00',
          quantity: 1,
        },
      ],
    }
    expect(draftSchema.parse(old).lines[0]).toMatchObject({ id: 'p1', productId: 'p1' })
  })
})
```

`tests/unit/proforma-readiness.test.ts`, dentro de `describe('firstPendingField', …)`:

```ts
  it('un producto libre se identifica por su línea', () => {
    const value = draft({
      lines: [line({ id: 'libre-1', productId: null, catalogPrice: null, unitPrice: '' })],
    })
    expect(firstPendingField(value)).toBe('line-libre-1-price')
  })
```

`tests/unit/document-model.test.ts`: añade `documentInputSchema` a la importación de `@/features/proforma/document/input` y `freeLine` a la de `../support/proforma`; al final:

```ts
describe('producto libre', () => {
  it('sin código sale con «—» en el documento', () => {
    const free = documentInput(
      {
        ...EMPTY_DRAFT,
        lines: [freeLine()],
        client,
        number: 1,
        issuedAt: '2026-09-30T15:00:00.000Z',
      },
      { draft: false },
    )
    expect(documentInputSchema.parse(free).lines[0].code).toBe('')
    expect(buildDocumentModel(free, company, now).rows[0]).toMatchObject({
      code: '—',
      name: 'Instalación en sitio',
      unitPrice: '350.00',
    })
  })
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/proforma-draft.test.ts tests/unit/proforma-readiness.test.ts tests/unit/document-model.test.ts`
Expected: FAIL. `addFreeLine` no existe, las líneas no tienen `id`, `firstPendingField` devuelve `line-null-price` y el schema rechaza el código vacío.

- [ ] **Step 3: Reescribir el borrador**

`src/features/proforma/draft.ts`, completo:

```ts
import { z } from 'zod'
import type { ProductListItem } from '@/features/catalog/types'
import { MAX_QUANTITY } from './totals'

// Proforma en curso (spec §6.1): una sola, en este navegador. Los datos del producto se copian al
// añadirlo; el catálogo nunca se modifica desde aquí. Un producto libre (spec de productos libres
// §4.3) existe solo en la proforma: no tiene producto ni precio de catálogo.
const lineSchema = z.preprocess(
  // Los borradores anteriores a los productos libres identificaban la línea por su producto.
  (value) =>
    value !== null && typeof value === 'object' && !('id' in value) && 'productId' in value
      ? { ...value, id: value.productId }
      : value,
  z.object({
    id: z.string(), // el del producto, o «libre-…»
    productId: z.string().nullable(), // null en un producto libre
    code: z.string(), // puede ir vacío en un producto libre
    name: z.string(),
    description: z.string().nullable(),
    catalogPrice: z.string().nullable(), // precio del catálogo al añadirlo; null si es libre
    unitPrice: z.string(), // precio de la proforma, tal como se escribe
    quantity: z.number().int().nonnegative(),
  }),
)

export const draftSchema = z.object({
  lines: z.array(lineSchema),
  client: z.object({
    name: z.string(),
    document: z.string(),
    phone: z.string(),
    address: z.string(),
    deliveryTime: z.string(),
  }),
  validityDays: z.string(), // vacío: la validez por defecto de la empresa
  discountPercent: z.string(),
  shipping: z.string(),
  number: z.number().int().positive().nullable(), // asignado al generar
  // Fecha al generar (ISO). Los borradores anteriores no la tienen: se lee como null.
  issuedAt: z.string().nullable().default(null),
  updatedAt: z.string(),
})

export type ProformaLine = z.infer<typeof lineSchema>
export type ProformaDraft = z.infer<typeof draftSchema>
export type ProformaClient = ProformaDraft['client']
type Conditions = Pick<ProformaDraft, 'validityDays' | 'discountPercent' | 'shipping'>
type ProductData = Pick<ProductListItem, 'id' | 'code' | 'name' | 'description' | 'unit_price'>

export const EMPTY_DRAFT: ProformaDraft = {
  lines: [],
  client: { name: '', document: '', phone: '', address: '', deliveryTime: '' },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  number: null,
  issuedAt: null,
  updatedAt: '',
}

// Una línea del catálogo tiene el id de su producto: buscarla por producto es buscarla por línea.
export const findLine = (draft: ProformaDraft, id: string) =>
  draft.lines.find((line) => line.id === id)

function mapLine(
  draft: ProformaDraft,
  id: string,
  change: (line: ProformaLine) => ProformaLine,
): ProformaDraft {
  return { ...draft, lines: draft.lines.map((line) => (line.id === id ? change(line) : line)) }
}

// Añadir un producto que ya está suma una unidad, hasta el máximo.
export function addProduct(draft: ProformaDraft, product: ProductData): ProformaDraft {
  if (findLine(draft, product.id)) {
    return mapLine(draft, product.id, (line) => ({
      ...line,
      quantity: Math.min(line.quantity + 1, MAX_QUANTITY),
    }))
  }
  const line: ProformaLine = {
    id: product.id,
    productId: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    catalogPrice: product.unit_price,
    unitPrice: product.unit_price,
    quantity: 1,
  }
  return { ...draft, lines: [...draft.lines, line] }
}

// Lo que se escribe en «Añadir producto libre» (spec de productos libres §4.3).
export type FreeLineInput = Pick<ProformaLine, 'code' | 'name' | 'unitPrice' | 'quantity'>

// Cada producto libre es una línea nueva, aunque repita la descripción de otro.
export function addFreeLine(
  draft: ProformaDraft,
  input: FreeLineInput,
  id = `libre-${crypto.randomUUID()}`,
): ProformaDraft {
  const line: ProformaLine = {
    ...input,
    id,
    productId: null,
    description: null,
    catalogPrice: null,
  }
  return { ...draft, lines: [...draft.lines, line] }
}

export const setQuantity = (draft: ProformaDraft, id: string, quantity: number) =>
  mapLine(draft, id, (line) => ({ ...line, quantity }))

export const setUnitPrice = (draft: ProformaDraft, id: string, unitPrice: string) =>
  mapLine(draft, id, (line) => ({ ...line, unitPrice }))

// Un producto libre no tiene precio de catálogo al que volver.
export const restorePrice = (draft: ProformaDraft, id: string) =>
  mapLine(draft, id, (line) =>
    line.catalogPrice === null ? line : { ...line, unitPrice: line.catalogPrice },
  )

// «Actualizar» (spec §4.5): el precio actual del catálogo pasa a ser el de la línea.
export const applyCatalogPrice = (draft: ProformaDraft, id: string, price: string) =>
  mapLine(draft, id, (line) => ({ ...line, catalogPrice: price, unitPrice: price }))

export const removeLine = (draft: ProformaDraft, id: string): ProformaDraft => ({
  ...draft,
  lines: draft.lines.filter((line) => line.id !== id),
})

// «Deshacer» devuelve la línea a su sitio, salvo que se haya vuelto a añadir mientras tanto.
export function restoreLine(
  draft: ProformaDraft,
  line: ProformaLine,
  index: number,
): ProformaDraft {
  if (findLine(draft, line.id)) return draft
  const lines = [...draft.lines]
  lines.splice(Math.min(index, lines.length), 0, line)
  return { ...draft, lines }
}

export const patchClient = (
  draft: ProformaDraft,
  patch: Partial<ProformaClient>,
): ProformaDraft => ({
  ...draft,
  client: { ...draft.client, ...patch },
})

export const patchConditions = (
  draft: ProformaDraft,
  patch: Partial<Conditions>,
): ProformaDraft => ({
  ...draft,
  ...patch,
})

// El número y la fecha se fijan juntos al generar: «Corregir» conserva ambos (spec §6.3).
export const setNumber = (
  draft: ProformaDraft,
  number: number,
  issuedAt: string,
): ProformaDraft => ({ ...draft, number, issuedAt })

export const unitCount = (draft: ProformaDraft) =>
  draft.lines.reduce((sum, line) => sum + line.quantity, 0)

export const unitsText = (quantity: number) =>
  `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`

// Aviso para lectores de pantalla con las unidades de una línea de esta proforma.
export const quantityMessage = (draft: ProformaDraft, item: { id: string; name: string }) =>
  `${item.name}: ${unitsText(findLine(draft, item.id)?.quantity ?? 0)} en la proforma`

// Clave del borrador en el navegador (prefijo de src/lib/drafts.ts, que se borra al cerrar sesión).
export const PROFORMA_DRAFT_KEY = 'proforma'
```

- [ ] **Step 4: Usar el id de la línea en el resto**

`src/features/proforma/store.tsx`, `useRemoveLine`:

```ts
// Quitar una línea no pide confirmación: avisa con «Deshacer» (spec §4.2).
export function useRemoveLine() {
  const { draft, update } = useProforma()
  return (id: string) => {
    const index = draft.lines.findIndex((line) => line.id === id)
    if (index === -1) return
    const line = draft.lines[index]
    update((current) => removeLine(current, id))
    toast(`Quitaste ${line.name}`, {
      duration: UNDO_MS,
      action: {
        label: 'Deshacer',
        onClick: () => update((current) => restoreLine(current, line, index)),
      },
    })
  }
}
```

`src/features/proforma/readiness.ts`, en `firstPendingField`: `line-${line.id}-quantity` y `line-${line.id}-price`.

`src/features/proforma/components/proforma-lines.tsx`:
- en la lista:

```tsx
          {draft.lines.map((line) => (
            <LineRow
              key={line.id}
              line={line}
              // Un producto libre no se compara con el catálogo (spec de productos libres §4.3).
              currentPrice={line.productId ? prices?.get(line.productId) : undefined}
              missing={
                prices !== undefined && line.productId !== null && !prices.has(line.productId)
              }
            />
          ))}
```

- en `LineRow`, `const id = \`line-${line.id}\``; cada `setQuantity`, `restorePrice`, `setUnitPrice`, `applyCatalogPrice` y `removeLine` recibe `line.id`;
- el precio de catálogo solo existe en las líneas del catálogo; cambia `const edited = …` y su bloque por:

```tsx
  const catalogPrice = line.catalogPrice
```

```tsx
          {catalogPrice !== null && cents !== parseCents(catalogPrice) ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">Catálogo S/ {formatPrice(catalogPrice)}</span>
              <button
                type="button"
                className={cn(inlineAction, 'text-xs')}
                onClick={() => update((current) => restorePrice(current, line.id))}
              >
                Restaurar
              </button>
            </span>
          ) : null}
```

`src/features/proforma/components/proforma-dialog.tsx`:

```ts
  const prices = useCurrentPrices(
    draft.lines.flatMap((line) => (line.productId ? [line.productId] : [])),
    open,
  )
```

`src/features/proforma/document/input.ts`, en la línea: `code: z.string().trim().max(64),` (un producto libre puede no tener código).

`src/features/proforma/document/model.ts`, en `rows`: `code: line.code || '—',`.

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/proforma-draft.test.ts tests/unit/proforma-readiness.test.ts tests/unit/document-model.test.ts && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS en todo (`pnpm test` incluye las pruebas de componentes de la proforma, que siguen igual).

- [ ] **Step 6: Commit**

```bash
git add src/features/proforma/draft.ts src/features/proforma/store.tsx src/features/proforma/readiness.ts src/features/proforma/components/proforma-lines.tsx src/features/proforma/components/proforma-dialog.tsx src/features/proforma/document/input.ts src/features/proforma/document/model.ts tests/support/proforma.ts tests/unit/proforma-draft.test.ts tests/unit/proforma-readiness.test.ts tests/unit/document-model.test.ts tests/components/proforma-editor.test.tsx tests/components/proforma-control.test.tsx
git commit -m "feat: give each proforma line its own id and allow free lines"
```

---

### Task 4: Formulario «Añadir producto libre»

**Files:**
- Create: `src/features/proforma/components/proforma-free-line.tsx`
- Modify: `src/features/proforma/draft.ts`, `src/features/proforma/components/proforma-lines.tsx`, `src/features/proforma/components/proforma-product-search.tsx`
- Test: `tests/components/proforma-editor.test.tsx`

**Interfaces:**
- Consumes: `addFreeLine`, `FreeLineInput` (tarea 3); `priceError` (`readiness.ts`).
- Produces:
  - `freeLineSchema` (entrada `{ name, code, quantity: string, unitPrice }`; salida con `quantity: number`) y `FreeLineValues = z.input<typeof freeLineSchema>`, en `draft.ts`;
  - `FreeLineForm({ onClose })`, que confirma cada producto añadido («Añadiste «…»») y, desde el primero, ofrece «Cerrar» en vez de «Cancelar»;
  - en `ProformaLines`, el botón «Añadir producto libre» (`aria-expanded`) y la etiqueta «Producto libre» de cada línea libre.

- [ ] **Step 1: Escribir las pruebas**

`tests/components/proforma-editor.test.tsx`: añade `freeLine` a la importación de `../support/proforma` y, dentro de `describe('ProformaEditor', …)`:

```tsx
  describe('productos libres', () => {
    const freeForm = () => within(screen.getByRole('form', { name: 'Añadir producto libre' }))

    it('se añaden sin el catálogo, con su etiqueta, y el formulario queda listo para otro', async () => {
      seedProforma({ client: withClient })
      const { user } = renderEditor()
      await user.click(screen.getByRole('button', { name: 'Añadir producto libre' }))
      const form = freeForm()
      expect(
        form.getByText('Para productos que no están en el catálogo. No se guardan en él.'),
      ).toBeVisible()
      await user.type(form.getByLabelText('Descripción'), 'Instalación en sitio')
      await user.clear(form.getByLabelText('Cantidad'))
      await user.type(form.getByLabelText('Cantidad'), '2')
      await user.type(form.getByLabelText('Precio con IGV (S/)'), '350')
      await user.click(form.getByRole('button', { name: 'Añadir a la proforma' }))
      expect(screen.getByText('Producto libre')).toBeVisible()
      expect(screen.getByLabelText('Cantidad de Instalación en sitio')).toHaveValue('2')
      expect(screen.getByLabelText('Precio unitario de Instalación en sitio')).toHaveValue('350')
      expect(form.getByLabelText('Descripción')).toHaveValue('')
      expect(form.getByLabelText('Descripción')).toHaveFocus()
      expect(form.getByRole('status')).toHaveTextContent('Añadiste «Instalación en sitio».')
      expect(form.getByRole('button', { name: 'Cerrar' })).toBeVisible()
      expect(generate()).toBeEnabled()
    })

    it('pide la descripción y un precio válido antes de añadir', async () => {
      seedProforma({})
      const { user } = renderEditor()
      await user.click(screen.getByRole('button', { name: 'Añadir producto libre' }))
      const form = freeForm()
      await user.type(form.getByLabelText('Precio con IGV (S/)'), '0')
      await user.click(form.getByRole('button', { name: 'Añadir a la proforma' }))
      expect(await form.findByText('Escribe la descripción.')).toBeVisible()
      expect(
        form.getByText('Escribe un precio mayor que cero, con hasta dos decimales.'),
      ).toBeVisible()
      expect(screen.getByText(/La proforma está vacía/)).toBeVisible()
    })

    it('«Cancelar» lo cierra y devuelve el foco al botón', async () => {
      seedProforma({})
      const { user } = renderEditor()
      const toggle = screen.getByRole('button', { name: 'Añadir producto libre' })
      await user.click(toggle)
      await user.click(freeForm().getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('form', { name: 'Añadir producto libre' })).not.toBeInTheDocument()
      expect(toggle).toHaveFocus()
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
    })

    it('no avisa de precio cambiado ni de «Ya no está en el catálogo»', () => {
      seedProforma({ lines: [freeLine({ unitPrice: '300' })] })
      renderEditor({ prices: new Map() })
      expect(screen.getByText('Producto libre')).toBeVisible()
      expect(screen.queryByText(/Ya no está en el catálogo/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Restaurar' })).not.toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project components tests/components/proforma-editor.test.tsx`
Expected: FAIL en las cuatro nuevas: no hay botón «Añadir producto libre» ni etiqueta «Producto libre».

- [ ] **Step 3: Escribir el schema y el formulario**

`src/features/proforma/draft.ts`: añade `import { priceError } from './readiness'` y, después de `addFreeLine`:

```ts
// «Añadir producto libre» (spec de productos libres §4.3): las reglas de una línea del catálogo,
// con la descripción obligatoria y el código opcional.
export const freeLineSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Escribe la descripción.')
    .max(120, 'Usa como máximo 120 caracteres.'),
  code: z.string().trim().max(64, 'Usa como máximo 64 caracteres.'),
  quantity: z
    .string()
    .trim()
    .refine((value) => /^\d{1,4}$/.test(value) && Number(value) >= 1, 'De 1 a 9 999.')
    .transform(Number),
  unitPrice: z
    .string()
    .trim()
    .refine(
      (value) => priceError(value) === null,
      'Escribe un precio mayor que cero, con hasta dos decimales.',
    ),
})

export type FreeLineValues = z.input<typeof freeLineSchema>
```

(`readiness.ts` solo importa tipos de `draft.ts`: no hay ciclo en tiempo de ejecución.)

`src/features/proforma/components/proforma-free-line.tsx`:

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { addFreeLine, freeLineSchema, type FreeLineValues } from '../draft'
import { useProforma } from '../store'
import { TAX_CONFIG } from '../tax'

const EMPTY: FreeLineValues = { name: '', code: '', quantity: '1', unitPrice: '' }
const PRICE_LABEL = TAX_CONFIG.mode.startsWith('included')
  ? 'Precio con IGV (S/)'
  : 'Precio unitario (S/)'

function Field({
  id,
  label,
  optional,
  error,
  className,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-[13px] font-semibold text-foreground">
          {label}
        </Label>
        {optional ? <span className="text-[13px] text-muted-foreground">(opcional)</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// Productos que no están en el catálogo (spec de productos libres §4.3). Tras añadir uno, el
// formulario queda vacío y abierto para el siguiente (plan, decisión 3).
export function FreeLineForm({ onClose }: { onClose: () => void }) {
  const id = useId()
  const { update } = useProforma()
  const [added, setAdded] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(freeLineSchema), defaultValues: EMPTY })

  const add = handleSubmit((values) => {
    update((draft) => addFreeLine(draft, values))
    // Confirma cada uno: la línea nueva puede quedar fuera de la vista, debajo del formulario.
    setAdded(values.name)
    reset(EMPTY)
    setFocus('name')
  })

  const a11y = (field: keyof FreeLineValues) => ({
    id: `${id}-${field}`,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined,
  })

  return (
    <form
      id="free-line-form"
      aria-label="Añadir producto libre"
      noValidate
      onSubmit={add}
      className="mb-3 grid gap-3 rounded-[14px] border border-dashed border-[#9cc96a] bg-[#fafdf6] p-4"
    >
      <p className="text-[13px] text-muted-foreground">
        Para productos que no están en el catálogo. No se guardan en él.
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Field id={`${id}-name`} label="Descripción" error={errors.name?.message}>
          <Input
            {...a11y('name')}
            // Se abre al pedirlo: se escribe enseguida (como «Corregir» en proforma-ready.tsx).
            autoFocus
            maxLength={120}
            autoComplete="off"
            className="bg-card"
            {...register('name')}
          />
        </Field>
        <Field id={`${id}-code`} label="Código" optional error={errors.code?.message}>
          <Input
            {...a11y('code')}
            maxLength={64}
            autoComplete="off"
            placeholder="Sin código"
            className="bg-card font-mono"
            {...register('code')}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <Field
          id={`${id}-quantity`}
          label="Cantidad"
          error={errors.quantity?.message}
          className="w-28"
        >
          <Input
            {...a11y('quantity')}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            className="bg-card tabular-nums"
            {...register('quantity')}
          />
        </Field>
        <Field
          id={`${id}-unitPrice`}
          label={PRICE_LABEL}
          error={errors.unitPrice?.message}
          className="w-44"
        >
          <Input
            {...a11y('unitPrice')}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            className="bg-card text-right tabular-nums"
            {...register('unitPrice')}
          />
        </Field>
      </div>
      {added ? (
        <p role="status" className="text-[13px] font-medium text-ring">
          Añadiste «{added}». Escribe el siguiente o cierra el formulario.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          Añadir a la proforma
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          {added ? 'Cerrar' : 'Cancelar'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Añadir el botón, el formulario y la etiqueta a las líneas**

`src/features/proforma/components/proforma-product-search.tsx`: el contenedor pasa de `className="relative mb-3"` a `className="relative"` (el margen lo pone la fila que lo contiene).

`src/features/proforma/components/proforma-lines.tsx`:
- añade `PencilLine` a la importación de `lucide-react`, `useRef` a la de `react` e `import { FreeLineForm } from './proforma-free-line'`;
- en `ProformaLines`, después de `const { draft } = useProforma()`:

```tsx
  const [freeOpen, setFreeOpen] = useState(false)
  const freeToggle = useRef<HTMLButtonElement>(null)
```

- reemplaza `<ProformaProductSearch searchProducts={searchProducts} />` por:

```tsx
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="min-w-0 flex-[1_1_280px]">
          <ProformaProductSearch searchProducts={searchProducts} />
        </div>
        <Button
          ref={freeToggle}
          variant="outline"
          aria-expanded={freeOpen}
          aria-controls={freeOpen ? 'free-line-form' : undefined}
          className={cn('h-11 px-3.5', freeOpen && 'border-ring bg-[#f6fbef]')}
          onClick={() => setFreeOpen(!freeOpen)}
        >
          <PencilLine aria-hidden />
          Añadir producto libre
        </Button>
      </div>
      {freeOpen ? (
        <FreeLineForm
          onClose={() => {
            setFreeOpen(false)
            freeToggle.current?.focus()
          }}
        />
      ) : null}
```

- el texto de la proforma vacía pasa a: «La proforma está vacía. Busca productos del catálogo aquí arriba o añade un producto libre.»;
- en `LineRow`, el código solo se muestra si hay uno y las líneas libres llevan su etiqueta. Reemplaza el `<span>` del código por:

```tsx
          {line.code ? (
            <span className="rounded-md border bg-background px-1.5 font-mono text-xs text-secondary-foreground">
              {line.code}
            </span>
          ) : null}
          {line.productId === null ? (
            <span className="rounded-full bg-[#eef7e2] px-2 text-[11px] font-bold text-[#3f7d0a]">
              Producto libre
            </span>
          ) : null}
```

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components tests/components/proforma-editor.test.tsx tests/components/proforma-panel.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS; sin errores de tipos ni de lint.

- [ ] **Step 6: Commit**

```bash
git add src/features/proforma/draft.ts src/features/proforma/components/proforma-free-line.tsx src/features/proforma/components/proforma-lines.tsx src/features/proforma/components/proforma-product-search.tsx tests/components/proforma-editor.test.tsx
git commit -m "feat: add free products to a proforma without the catalog"
```

---

### Task 5: Pantalla Proformas con «Nueva proforma»

**Files:**
- Create:
  - `src/app/(private)/proformas/page.tsx`
  - `src/features/proforma/history/components/proformas-screen.tsx`
  - `src/features/proforma/history/components/new-proforma-prompt.tsx`
  - `tests/components/new-proforma-prompt.test.tsx`
  - `tests/e2e/proformas.spec.ts`
- Modify:
  - `src/components/app-shell.tsx`
  - `next.config.ts`
  - `src/features/proforma/components/proforma-dialog.tsx`
  - `src/features/proforma/components/proforma-editor.tsx`
  - `src/features/proforma/components/proforma-lines.tsx`
  - `src/features/catalog/components/catalog-screen.tsx`
- Test: `tests/components/proforma-editor.test.tsx`, `tests/components/new-proforma-prompt.test.tsx`, `tests/e2e/proformas.spec.ts`

**Interfaces:**
- Consumes: `FreeLineForm` y las líneas libres (tareas 3 y 4); `ProformaBar` (la de Productos).
- Produces:
  - la ruta `/proformas` (`maxDuration = 60`) y «Proformas» en el menú, entre Productos y Empresa;
  - `ProformasScreen()`: cabecera, «Nueva proforma» y la barra de la proforma en curso;
  - `NewProformaPrompt({ open, summary, onKeep, onStartNew, onClose })`: la pregunta antes de borrar una proforma sin generar (plan, decisión 4);
  - `ProformaDialog({ open, onClose, onContinue? })` y `ProformaEditorProps.onContinue?`: sin `onContinue` no se muestra «Seguir eligiendo productos».

- [ ] **Step 1: Escribir las pruebas**

`tests/components/new-proforma-prompt.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewProformaPrompt } from '@/features/proforma/history/components/new-proforma-prompt'

function renderPrompt() {
  const handlers = { onKeep: vi.fn(), onStartNew: vi.fn(), onClose: vi.fn() }
  render(<NewProformaPrompt open summary="3 productos · S/ 1,234.00" {...handlers} />)
  const dialog = within(screen.getByRole('alertdialog', { name: '¿Empezar una proforma nueva?' }))
  return { ...handlers, dialog, user: userEvent.setup() }
}

describe('NewProformaPrompt', () => {
  it('explica qué se perdería y deja el foco en la opción segura', () => {
    const { dialog } = renderPrompt()
    expect(
      dialog.getByText(
        'Tienes una proforma sin generar (3 productos · S/ 1,234.00). Si empiezas otra, esa se borra.',
      ),
    ).toBeVisible()
    expect(dialog.getByRole('button', { name: 'Seguir con la actual' })).toHaveFocus()
  })

  it('«Seguir con la actual» la conserva', async () => {
    const { dialog, onKeep, onStartNew, user } = renderPrompt()
    await user.click(dialog.getByRole('button', { name: 'Seguir con la actual' }))
    expect(onKeep).toHaveBeenCalledTimes(1)
    expect(onStartNew).not.toHaveBeenCalled()
  })

  it('«Empezar una nueva» avisa a quien la abrió', async () => {
    const { dialog, onKeep, onStartNew, user } = renderPrompt()
    await user.click(dialog.getByRole('button', { name: 'Empezar una nueva' }))
    expect(onStartNew).toHaveBeenCalledTimes(1)
    expect(onKeep).not.toHaveBeenCalled()
  })
})
```

`tests/components/proforma-editor.test.tsx`, dentro de `describe('ProformaEditor', …)`:

```tsx
  it('sin lista a la que volver no ofrece «Seguir eligiendo productos»', () => {
    seedProforma({ lines: [line()] })
    renderEditor({ onContinue: undefined })
    expect(
      screen.queryByRole('button', { name: 'Seguir eligiendo productos' }),
    ).not.toBeInTheDocument()
  })
```

`tests/e2e/proformas.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  connect,
  fillCompanyProfile,
  resetCatalog,
  resetCompanyProfile,
  resetWhatsAppSession,
} from '../integration/db'
import { pdfText } from '../support/pdf-text'
import { login } from './session'

// La empresa con lo obligatorio, la numeración desde 1 y el catálogo vacío.
async function seed() {
  const db = await connect()
  try {
    await resetCatalog(db)
    await resetCompanyProfile(db)
    await resetWhatsAppSession(db)
    await fillCompanyProfile(db)
    await db.query('alter sequence public.proforma_number_seq restart with 1')
  } finally {
    await db.end()
  }
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Completar proforma' })

async function addFreeLine(
  page: Page,
  line: { name: string; code?: string; quantity?: string; price: string },
) {
  const form = dialog(page).getByRole('form', { name: 'Añadir producto libre' })
  await form.getByLabel('Descripción').fill(line.name)
  if (line.code) await form.getByLabel('Código').fill(line.code)
  if (line.quantity) await form.getByLabel('Cantidad').fill(line.quantity)
  await form.getByLabel('Precio con IGV (S/)').fill(line.price)
  await form.getByRole('button', { name: 'Añadir a la proforma' }).click()
}

test('arma y genera una proforma solo con productos libres, desde Proformas', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await expect(page).toHaveURL(/\/proformas$/)
  // Desde la tarea 10, con el historial vacío, el estado vacío también la ofrece.
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await expect(panel.getByRole('button', { name: 'Seguir eligiendo productos' })).toHaveCount(0)

  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await addFreeLine(page, {
    name: 'Cable HDMI de 3 metros',
    code: 'HDMI-3',
    quantity: '2',
    price: '25',
  })
  await expect(panel.getByText('Producto libre', { exact: true })).toHaveCount(2)
  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()
  await expect(panel.getByText('Cliente de prueba · Total S/ 400.00')).toBeVisible()

  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Descargar PDF' }).click()
  const text = pdfText(readFileSync(await (await download).path()))
  expect(text).toContain('Instalación en sitio')
  expect(text).toContain('HDMI-3')
  expect(text).toContain('—')
})

test('«Nueva proforma» pregunta antes de borrar una proforma sin generar', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  const start = page.getByRole('button', { name: 'Nueva proforma' }).first()
  await start.click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await page.keyboard.press('Escape')
  // La proforma en curso se ve en su barra, como en Productos.
  await expect(page.getByRole('region', { name: 'Proforma' })).toContainText('1 producto')

  await start.click()
  const prompt = page.getByRole('alertdialog', { name: '¿Empezar una proforma nueva?' })
  await expect(prompt).toContainText('1 producto · S/ 350.00')
  await prompt.getByRole('button', { name: 'Seguir con la actual' }).click()
  await expect(panel.getByLabel('Cantidad de Instalación en sitio')).toBeVisible()
  await page.keyboard.press('Escape')

  await start.click()
  await prompt.getByRole('button', { name: 'Empezar una nueva' }).click()
  await expect(panel.getByText(/La proforma está vacía/)).toBeVisible()
})
```

- [ ] **Step 2: Ejecutar las pruebas de componentes y ver que fallan**

Run: `pnpm exec vitest run --project components tests/components/proforma-editor.test.tsx tests/components/new-proforma-prompt.test.tsx`
Expected: FAIL: «Seguir eligiendo productos» se muestra siempre y `new-proforma-prompt` no existe.

- [ ] **Step 3: Hacer opcional «Seguir eligiendo productos»**

`src/features/proforma/components/proforma-editor.tsx`, en `ProformaEditorProps`:

```ts
  // Solo desde Productos: en Proformas no hay lista a la que volver (plan, decisión 5).
  onContinue?: () => void
```

`src/features/proforma/components/proforma-lines.tsx`: la prop pasa a `onContinue?: () => void` y el botón solo se dibuja si existe:

```tsx
        {onContinue ? (
          <button type="button" className={cn(inlineAction, 'text-[13px]')} onClick={onContinue}>
            Seguir eligiendo productos
          </button>
        ) : null}
```

`src/features/proforma/components/proforma-dialog.tsx`: la firma pasa a `ProformaDialog({ open, onClose, onContinue }: { open: boolean; onClose: () => void; onContinue?: () => void })` y `ProformaPanel` recibe `onContinue={onContinue}`.

`src/features/catalog/components/catalog-screen.tsx`:

```tsx
        <ProformaDialog
          open={proformaOpen}
          onClose={() => setProformaOpen(false)}
          onContinue={() => setProformaOpen(false)}
        />
```

- [ ] **Step 4: Crear la pantalla, la ruta y el menú**

`src/features/proforma/history/components/new-proforma-prompt.tsx`:

```tsx
'use client'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

// «Nueva proforma» con una sin generar (spec de productos libres §4.3): se elige, nada se borra solo.
// El foco empieza en «Seguir con la actual», la opción que no pierde nada.
export function NewProformaPrompt({
  open,
  summary,
  onKeep,
  onStartNew,
  onClose,
}: {
  open: boolean
  // «3 productos · S/ 1,234.00»
  summary: string
  onKeep: () => void
  onStartNew: () => void
  onClose: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Empezar una proforma nueva?</AlertDialogTitle>
          <AlertDialogDescription>
            Tienes una proforma sin generar ({summary}). Si empiezas otra, esa se borra.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeep}>Seguir con la actual</AlertDialogCancel>
          <Button variant="destructive" onClick={onStartNew}>
            Empezar una nueva
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

`src/features/proforma/history/components/proformas-screen.tsx`:

```tsx
'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ProformaBar } from '../../components/proforma-bar'
import { ProformaDialog } from '../../components/proforma-dialog'
import { EMPTY_DRAFT } from '../../draft'
import { formatCents } from '../../money'
import { ProformaProvider, useProforma } from '../../store'
import { totalsFromText } from '../../totals'
import { NewProformaPrompt } from './new-proforma-prompt'

// Pantalla Proformas (spec de productos libres §4.2 y §4.3): armar una proforma sin pasar por el
// catálogo. El historial llega en la tarea 10.
export function ProformasScreen() {
  return (
    <ProformaProvider>
      <ProformasContent />
    </ProformaProvider>
  )
}

function ProformasContent() {
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const { draft, update } = useProforma()
  const products = draft.lines.length
  const totals = totalsFromText(draft)

  function openEmpty() {
    update(() => EMPTY_DRAFT)
    setOpen(true)
  }

  // «Nueva proforma» empieza una vacía. Una ya generada está guardada y se reemplaza; una sin
  // generar no se borra sin preguntar (plan, decisión 4).
  function startNew() {
    if (draft.number === null && products > 0) setAsking(true)
    else openEmpty()
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Proformas</h1>
          <p className="text-sm text-muted-foreground">
            Arma una proforma con productos del catálogo o escritos a mano.
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus aria-hidden />
          Nueva proforma
        </Button>
      </div>
      <ProformaBar onComplete={() => setOpen(true)} />
      <ProformaDialog open={open} onClose={() => setOpen(false)} />
      <NewProformaPrompt
        open={asking}
        summary={`${products} ${products === 1 ? 'producto' : 'productos'} · S/ ${totals ? formatCents(totals.total) : '—'}`}
        onKeep={() => setOpen(true)}
        onStartNew={() => {
          setAsking(false)
          openEmpty()
        }}
        onClose={() => setAsking(false)}
      />
    </div>
  )
}
```

`src/app/(private)/proformas/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { ProformasScreen } from '@/features/proforma/history/components/proformas-screen'

export const metadata: Metadata = { title: 'Proformas' }

// Enviar o reenviar por WhatsApp conecta, envía y guarda la sesión (spec de WhatsApp §3).
export const maxDuration = 60

export default function ProformasPage() {
  return <ProformasScreen />
}
```

`src/components/app-shell.tsx`: añade `FileText` a la importación de `lucide-react` y deja `navItems` así:

```ts
// Productos (con la proforma), las proformas guardadas y los datos de la empresa que salen en ellas.
const navItems = [
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/proformas', label: 'Proformas', icon: FileText },
  { href: '/company', label: 'Empresa', icon: Building2 },
]
```

`next.config.ts`: el PDF también se arma desde `/proformas`:

```ts
// El PDF de la proforma lee sus fuentes y el logotipo del disco en el servidor: se incluyen en las
// funciones de Vercel que lo generan.
const PROFORMA_FILES = [
  './src/features/proforma/document/fonts/**',
  './public/brand/ventronix-logo-proforma.jpg',
  './public/brand/marcas.jpg',
]
```

y en `outputFileTracingIncludes`: `'/products': PROFORMA_FILES,` y `'/proformas': PROFORMA_FILES,` (se conserva `'/products/import'`).

- [ ] **Step 5: Ejecutar las pruebas, los tipos, el lint y las e2e**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm exec playwright test tests/e2e/proformas.spec.ts tests/e2e/proforma.spec.ts`
Expected: PASS en todo, en PC y en móvil. En la e2e nueva, el PDF lleva «Instalación en sitio», «HDMI-3» y «—», y «Nueva proforma» pregunta antes de borrar la que no se generó.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(private)/proformas/page.tsx" src/features/proforma/history/components/proformas-screen.tsx src/features/proforma/history/components/new-proforma-prompt.tsx tests/components/new-proforma-prompt.test.tsx src/components/app-shell.tsx next.config.ts src/features/proforma/components/proforma-dialog.tsx src/features/proforma/components/proforma-editor.tsx src/features/proforma/components/proforma-lines.tsx src/features/catalog/components/catalog-screen.tsx tests/components/proforma-editor.test.tsx tests/e2e/proformas.spec.ts
git commit -m "feat: start a new proforma from the Proformas screen"
```

---

## Parte C — Historial de proformas

### Task 6: Páginas, estados vacíos y filtro de fecha compartidos

Refactor sin cambios para quien usa Productos: lo que el historial necesita igual que Productos pasa a un lugar común.

**Files:**
- Create: `src/components/pagination.tsx`, `src/components/empty-state.tsx`
- Modify:
  - `src/features/catalog/products/components/product-list.tsx`
  - `src/features/catalog/products/components/date-filter.tsx`
  - `src/features/catalog/list-options.ts`
- Test: `tests/components/pagination.test.tsx` (nuevo), `tests/components/date-filter.test.tsx`, `tests/unit/catalog-list-options.test.ts`

**Interfaces:**
- Produces:
  - `Pagination({ page, totalPages, label, summary, onPage })`;
  - `EmptyState({ icon, title, text, action, tone? })`, el mismo de la lista de productos;
  - `describeDateRange(filter: Pick<DateFilter, 'date' | 'from' | 'to'>): string | null` («Últimos 7 días», «01/09/2026 – 15/09/2026», «Desde el 01/09/2026»);
  - `labelDateRange(label, filter)` («Fecha: últimos 7 días»); `describeDateFilter` queda igual por fuera;
  - `DateFilterControl` acepta un `value` sin `dateBy`: entonces no muestra «¿Qué fecha?».

- [ ] **Step 1: Escribir las pruebas**

`tests/components/pagination.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from '@/components/pagination'

describe('Pagination', () => {
  it('muestra qué filas se ven y cambia de página con los números, Anterior y Siguiente', async () => {
    const onPage = vi.fn()
    render(
      <Pagination
        page={2}
        totalPages={9}
        label="Páginas de proformas"
        summary="Proformas 21–40 de 171"
        onPage={onPage}
      />,
    )
    const nav = within(screen.getByRole('navigation', { name: 'Páginas de proformas' }))
    expect(screen.getByText('Proformas 21–40 de 171')).toBeVisible()
    expect(nav.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')
    const user = userEvent.setup()
    await user.click(nav.getByRole('button', { name: 'Página 9' }))
    await user.click(nav.getByRole('button', { name: 'Página anterior' }))
    await user.click(nav.getByRole('button', { name: 'Página siguiente' }))
    expect(onPage.mock.calls).toEqual([[9], [1], [3]])
  })

  it('en la primera y en la última no deja salirse', () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={2} label="Páginas" summary="" onPage={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    rerender(<Pagination page={2} totalPages={2} label="Páginas" summary="" onPage={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
  })
})
```

`tests/components/date-filter.test.tsx`, dentro de `describe('DateFilterControl', …)`:

```tsx
  it('sin «qué fecha» (el historial) solo pide el rango', async () => {
    const onChange = vi.fn()
    render(
      <DateFilterControl
        value={{ date: 'month', from: null, to: null }}
        today={today}
        onChange={onChange}
      />,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Fecha: Este mes' }))
    expect(screen.queryByText('¿Qué fecha?')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Hoy' }))
    expect(onChange).toHaveBeenCalledWith({ date: 'today', from: null, to: null })
  })
```

`tests/unit/catalog-list-options.test.ts`: añade `describeDateRange` y `labelDateRange` a la importación y, al final:

```ts
describe('describeDateRange', () => {
  it.each([
    [{ date: '7d', from: null, to: null }, 'Últimos 7 días'],
    [{ date: 'custom', from: '2026-09-01', to: '2026-09-15' }, '01/09/2026 – 15/09/2026'],
    [{ date: 'custom', from: '2026-09-01', to: null }, 'Desde el 01/09/2026'],
    [{ date: 'custom', from: null, to: '2026-09-15' }, 'Hasta el 15/09/2026'],
    [{ date: 'custom', from: '2026-09-15', to: '2026-09-01' }, null],
    [{ date: null, from: null, to: null }, null],
  ] as const)('%o → %s', (filter, expected) => {
    expect(describeDateRange(filter)).toBe(expected)
  })

  it('con su etiqueta, el rango va en minúscula', () => {
    expect(labelDateRange('Fecha', { date: 'month', from: null, to: null })).toBe(
      'Fecha: este mes',
    )
    expect(labelDateRange('Fecha', { date: null, from: null, to: null })).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-list-options.test.ts && pnpm exec vitest run --project components tests/components/pagination.test.tsx tests/components/date-filter.test.tsx`
Expected: FAIL. `describeDateRange`, `labelDateRange` y `@/components/pagination` no existen, y sin `dateBy` el filtro sigue mostrando «¿Qué fecha?».

- [ ] **Step 3: Escribir los componentes compartidos**

`src/components/pagination.tsx`:

```tsx
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { pageList } from '@/features/catalog/search-params'
import { cn } from '@/lib/utils'

// Pie de una lista con páginas: qué filas se ven y Anterior, los números de página y Siguiente.
export function Pagination({
  page,
  totalPages,
  label,
  summary,
  onPage,
}: {
  page: number
  totalPages: number
  // Nombre de la navegación, por ejemplo «Páginas de productos».
  label: string
  summary: ReactNode
  onPage: (page: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
      <p className="text-[13px] text-muted-foreground">{summary}</p>
      <nav aria-label={label} className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft aria-hidden />
        </Button>
        {pageList(page, totalPages).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label={`Página ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={cn(item === page && 'border border-input font-bold')}
              onClick={() => onPage(item)}
            >
              {item}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página siguiente"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight aria-hidden />
        </Button>
      </nav>
    </div>
  )
}
```

`src/components/empty-state.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Lista vacía, sin resultados o con error: qué pasó y qué hacer.
export function EmptyState({
  icon,
  title,
  text,
  action,
  tone = 'neutral',
}: {
  icon: ReactNode
  title: string
  text: string
  action: ReactNode
  tone?: 'neutral' | 'error'
}) {
  return (
    <div className="grid justify-items-center gap-2 border-t px-6 py-16 text-center">
      <span
        className={cn(
          'mb-2 grid size-13 place-items-center rounded-[14px]',
          tone === 'error'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-secondary-foreground',
        )}
      >
        {icon}
      </span>
      <h3 className="text-[17px] font-bold" role={tone === 'error' ? 'alert' : undefined}>
        {title}
      </h3>
      <p className="mb-3 max-w-[360px] text-sm text-muted-foreground">{text}</p>
      {action}
    </div>
  )
}
```

`src/features/catalog/products/components/product-list.tsx`:
- borra las funciones locales `Pagination` y `EmptyState`;
- importa las compartidas (`import { EmptyState } from '@/components/empty-state'` e `import { Pagination } from '@/components/pagination'`);
- quita `pageList` y `type ReactNode` de sus importaciones, que ya no se usan;
- en `ProductList`, después de `totalPages`, añade `const page = Math.min(filters.page, totalPages)` y úsalo en `PageStepper` (`page={page}`);
- la paginación de abajo queda así:

```tsx
          <Pagination
            page={page}
            totalPages={totalPages}
            label="Páginas de productos"
            summary={`Mostrando ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + data.items.length} de ${data.total} ${data.total === 1 ? 'producto' : 'productos'}`}
            onPage={goToPageFromBottom}
          />
```

- [ ] **Step 4: Separar el rango de su etiqueta y el filtro de «qué fecha»**

`src/features/catalog/list-options.ts`: reemplaza `describeDateFilter` por:

```ts
// «Últimos 7 días», «01/09/2026 – 15/09/2026», «Desde el 01/09/2026»; null si no filtra. Un rango al
// revés no filtra (resolveDateRange), así que tampoco se describe.
export function describeDateRange(filter: Pick<DateFilter, 'date' | 'from' | 'to'>) {
  if (filter.date === null) return null
  if (filter.from && filter.to && filter.from > filter.to) return null
  if (filter.date !== 'custom') return DATE_PRESET_LABELS[filter.date]
  if (filter.from && filter.to) return `${formatDay(filter.from)} – ${formatDay(filter.to)}`
  if (filter.from) return `Desde el ${formatDay(filter.from)}`
  if (filter.to) return `Hasta el ${formatDay(filter.to)}`
  return null
}

// «Fecha: este mes»: el rango detrás de su etiqueta; null si no filtra.
export function labelDateRange(label: string, filter: Pick<DateFilter, 'date' | 'from' | 'to'>) {
  const range = describeDateRange(filter)
  return range ? `${label}: ${range[0].toLowerCase()}${range.slice(1)}` : null
}

// «Registro: últimos 7 días», «Modificación: 01/09/2026 – 15/09/2026»; null si no filtra.
export const describeDateFilter = (filter: DateFilter) =>
  labelDateRange(DATE_FIELD_LABELS[filter.dateBy], filter)
```

`src/features/catalog/products/components/date-filter.tsx`:
- añade `describeDateRange` a la importación de `../../list-options`;
- antes de `DateFilterControl`:

```ts
// Sin dateBy (el historial de proformas) no se elige qué fecha: hay una sola.
type DateFilterValue = Pick<DateFilter, 'date' | 'from' | 'to'> & { dateBy?: DateField }
```

- la prop `value` pasa a `value: DateFilterValue`;
- `label` pasa a:

```ts
  const label = value.dateBy
    ? describeDateFilter({ ...value, dateBy: value.dateBy })
    : describeDateRange(value)
```

- el `fieldset` «¿Qué fecha?» se envuelve en `{value.dateBy ? ( … ) : null}`.

- [ ] **Step 5: Ejecutar las pruebas, los tipos, el lint y las e2e del catálogo**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm exec playwright test tests/e2e/catalog.spec.ts tests/e2e/catalog-list.spec.ts`
Expected: PASS en todo; las e2e siguen leyendo «Mostrando 1–50 de 52 productos».

- [ ] **Step 6: Commit**

```bash
git add src/components/pagination.tsx src/components/empty-state.tsx src/features/catalog/products/components/product-list.tsx src/features/catalog/products/components/date-filter.tsx src/features/catalog/list-options.ts tests/components/pagination.test.tsx tests/components/date-filter.test.tsx tests/unit/catalog-list-options.test.ts
git commit -m "refactor: share pagination, empty states and the date range filter"
```

---

### Task 7: Tabla `proformas` y sus funciones

**Files:**
- Create: `supabase/migrations/202610060002_proforma_history.sql`, `tests/integration/proforma-history-sql.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (generado), `tests/integration/db.ts`

**Interfaces:**
- Produces:
  - tabla `public.proformas`:
    - `id uuid`, `number integer unique`;
    - `issued_at timestamptz`, `valid_until date`;
    - `client_name`, `client_document` (`''`, 8 u 11 dígitos), `client_phone`;
    - `item_count` (1 a 300), `total numeric(12,2)`;
    - `document jsonb`, `created_at`, `updated_at`;
    - RLS de la cuenta dueña: leer, crear y actualizar; sin borrar;
  - `filter_proformas(search text, date_from date, date_to date)`: filas sin `document`, con `sort_position` (si se busca un número, esa proforma primero; después, de la más reciente a la más antigua). Busca en el nombre, el RUC o DNI, el celular y el N°;
  - `search_proformas(search, date_from, date_to, page, page_size = 20)` → `json { total, sum, all, this_month, items[] }`; `sum` y cada `total` en texto;
  - `export_proformas(search, date_from, date_to, max_rows)` → `json` (array con las mismas columnas que `items`);
  - `resetProformas(client)` en `tests/integration/db.ts`.

- [ ] **Step 1: Escribir las pruebas de integración**

`tests/integration/db.ts`, al final:

```ts
// El historial de proformas vacío (spec de productos libres §5).
export async function resetProformas(client: Client) {
  await client.query('truncate public.proformas')
}
```

`tests/integration/proforma-history-sql.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetProformas, sqlState } from './db'

const password = 'historial-clave-123'
const owner = { email: 'historial-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'historial-intruso@catalogo.test' }

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  await ensureUser({ password, ...intruder })
  supabase = await signedInClient(owner.email, password)
  outsider = await signedInClient(intruder.email, password)
})

afterAll(async () => {
  await resetProformas(db)
  await db.end()
})

beforeEach(async () => {
  await resetProformas(db)
})

type Saved = {
  number: number
  issued_at?: string
  client_name?: string
  client_document?: string
  client_phone?: string
  total?: string
  document?: object
}

function insert({
  number,
  issued_at = '2026-10-01T15:00:00Z',
  client_name = 'Cliente de prueba',
  client_document = '20000000001',
  client_phone = '987654321',
  total = '100.00',
  document = {},
}: Saved) {
  return db.query(
    `insert into public.proformas
       (number, issued_at, valid_until, client_name, client_document, client_phone, item_count,
        total, document)
     values ($1, $2, '2026-10-08', $3, $4, $5, 2, $6, $7)`,
    [number, issued_at, client_name, client_document, client_phone, total, document],
  )
}

type Page = {
  total: number
  sum: string
  all: number
  this_month: number
  items: {
    number: number
    client_name: string
    client_document: string
    item_count: number
    total: string
    valid_until: string
  }[]
}

async function search(args: Record<string, unknown> = {}, client = supabase) {
  const { data, error } = await client.rpc('search_proformas', args)
  if (error) throw error
  return data as unknown as Page
}

const numbers = (page: Page) => page.items.map((item) => item.number)

describe('search_proformas', () => {
  it('devuelve 20 por página, de la más reciente a la más antigua, con el total y la suma', async () => {
    for (let number = 1; number <= 25; number++) await insert({ number, total: '10.50' })
    const first = await search()
    expect(first).toMatchObject({ total: 25, sum: '262.50', all: 25 })
    expect(numbers(first)).toEqual(Array.from({ length: 20 }, (_, index) => 25 - index))
    expect(first.items[0]).toMatchObject({
      client_name: 'Cliente de prueba',
      client_document: '20000000001',
      item_count: 2,
      total: '10.50',
      valid_until: '2026-10-08',
    })
    expect(numbers(await search({ page: 2 }))).toEqual([5, 4, 3, 2, 1])
    expect(await search({ page: 3 })).toMatchObject({ total: 25, items: [] })
  })

  it('busca por nombre sin tildes ni mayúsculas, por RUC o DNI, con %, _ y \\ como texto', async () => {
    await insert({ number: 1, client_name: 'José Pérez', client_document: '12345678' })
    await insert({ number: 2, client_name: 'Inversiones Nuevo Sol S.A.C.', client_document: '20601234567' })
    await insert({ number: 3, client_name: '100% Hogar_Tienda\\Sur', client_document: '' })
    expect(numbers(await search({ search: 'jose perez' }))).toEqual([1])
    expect(numbers(await search({ search: 'NUEVO SOL' }))).toEqual([2])
    expect(numbers(await search({ search: '206012' }))).toEqual([2])
    for (const literal of ['%', '_', '\\']) {
      expect(numbers(await search({ search: literal }))).toEqual([3])
    }
  })

  it('busca también por N° de proforma (esa va primero) y por celular, con o sin espacios', async () => {
    await insert({ number: 42, client_name: 'Cliente cuarenta y dos', client_document: '' })
    await insert({
      number: 50,
      client_name: 'Otro cliente',
      client_document: '20000000142',
      client_phone: '911 222 333',
    })
    expect(numbers(await search({ search: '42' }))).toEqual([42, 50])
    expect(numbers(await search({ search: '0042' }))).toEqual([42])
    expect(numbers(await search({ search: '911222' }))).toEqual([50])
    expect(numbers(await search({ search: '911 222' }))).toEqual([50])
  })

  it('filtra por días de Lima', async () => {
    await insert({ number: 1, issued_at: '2026-10-06T04:30:00Z' }) // 23:30 del 5 de octubre en Lima
    await insert({ number: 2, issued_at: '2026-10-06T05:30:00Z' }) // 00:30 del 6 en Lima
    expect(numbers(await search({ date_from: '2026-10-05', date_to: '2026-10-05' }))).toEqual([1])
    expect(numbers(await search({ date_from: '2026-10-06' }))).toEqual([2])
    expect(numbers(await search({ date_to: '2026-10-05' }))).toEqual([1])
  })

  it('cuenta todas y las de este mes en Lima, sin importar el filtro', async () => {
    await insert({ number: 1, issued_at: new Date().toISOString() })
    await insert({
      number: 2,
      issued_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      client_name: 'Otro cliente',
    })
    expect(await search({ search: 'otro' })).toMatchObject({ total: 1, all: 2, this_month: 1 })
  })
})

describe('export_proformas', () => {
  it('devuelve lo filtrado en el mismo orden, hasta el tope pedido', async () => {
    for (let number = 1; number <= 3; number++) await insert({ number })
    const { data, error } = await supabase.rpc('export_proformas', { max_rows: 2 })
    if (error) throw error
    expect((data as unknown as { number: number }[]).map((row) => row.number)).toEqual([3, 2])
  })
})

describe('permisos', () => {
  it('otra cuenta no ve ni crea proformas; nadie las borra', async () => {
    await insert({ number: 1 })
    expect(await search({}, outsider)).toMatchObject({ total: 0, all: 0, items: [] })
    const row = {
      number: 2,
      issued_at: '2026-10-01T15:00:00Z',
      valid_until: '2026-10-08',
      client_name: 'Cliente',
      item_count: 1,
      total: 10,
      document: {},
    }
    expect((await outsider.from('proformas').insert(row)).error?.code).toBe('42501')
    expect((await supabase.from('proformas').delete().eq('number', 1)).error?.code).toBe('42501')
  })

  it('sin sesión no se pueden usar las funciones', async () => {
    for (const fn of ['filter_proformas', 'search_proformas', 'export_proformas']) {
      expect((await publicClient().rpc(fn)).error?.code).toBe('42501')
    }
  })

  it('la base rechaza un documento que no es DNI ni RUC y un número repetido', async () => {
    await insert({ number: 1 })
    expect(await sqlState(insert({ number: 2, client_document: '123' }))).toBe('23514')
    expect(await sqlState(insert({ number: 1 }))).toBe('23505')
  })
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project integration tests/integration/proforma-history-sql.test.ts`
Expected: FAIL en `beforeEach`: «relation "public.proformas" does not exist».

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/202610060002_proforma_history.sql`:

```sql
-- Historial de proformas (spec de productos libres, historial y fotos §3, §5 y §7): una fila por
-- número, para siempre. «Corregir» actualiza la misma fila. `document` es la copia con la que se
-- vuelve a armar el PDF: lo que se envió al generarla y los datos de la empresa de ese día. Las
-- demás columnas son las que se listan, se buscan y van al Excel.
create table public.proformas (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  issued_at timestamptz not null,
  valid_until date not null,
  client_name text not null
    check (btrim(client_name) <> '' and char_length(client_name) <= 200),
  client_document text not null default ''
    check (client_document ~ '^([0-9]{8}|[0-9]{11})?$'),
  client_phone text not null default '' check (char_length(client_phone) <= 11),
  item_count integer not null check (item_count between 1 and 300),
  total numeric(12, 2) not null check (total > 0),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Por fecha (el filtro y «este mes») y por documento (la búsqueda y completar el cliente). El
-- número ya tiene el índice de su unique.
create index proformas_issued_at_idx on public.proformas (issued_at);
create index proformas_client_document_idx on public.proformas (client_document, number desc);

create trigger proformas_set_updated_at
before update on public.proformas
for each row execute function public.set_updated_at();

alter table public.proformas enable row level security;

-- Sin delete: las proformas no se borran (spec §3).
revoke all on table public.proformas from anon, authenticated;
grant select, insert, update on table public.proformas to authenticated;

create policy "owner reads proformas" on public.proformas
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner creates proformas" on public.proformas
  for insert to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner updates proformas" on public.proformas
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

-- Búsqueda (nombre sin tildes ni mayúsculas, RUC, DNI, celular o N° de proforma) y días de Lima,
-- como filter_products: la lista y el Excel leen de aquí, así que nunca dan resultados distintos.
-- Los caracteres especiales de LIKE se buscan como texto. Con un número, esa proforma va primero.
-- Sin la copia (`document`): ni la lista ni el Excel la necesitan.
create function public.filter_proformas(
  search text default '',
  date_from date default null,
  date_to date default null
)
returns table (
  id uuid,
  number integer,
  issued_at timestamptz,
  valid_until date,
  client_name text,
  client_document text,
  client_phone text,
  item_count integer,
  total numeric,
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
      (date_to + 1)::timestamp at time zone 'America/Lima' as to_instant,
      -- «0042» y «42» son la proforma 42.
      ltrim(btrim(coalesce(search, '')), '0') as number_search
  )
  select
    p.id, p.number, p.issued_at, p.valid_until, p.client_name, p.client_document,
    p.client_phone, p.item_count, p.total,
    row_number() over (
      order by (p.number::text = params.number_search) desc, p.number desc
    ) as sort_position
  from public.proformas p
  cross join params
  where (
      extensions.unaccent('extensions.unaccent', p.client_name) ilike params.pattern
      or p.client_document like params.pattern
      -- El celular sin espacios («987 654» encuentra 987 654 321) y el número con sus ceros.
      or replace(p.client_phone, ' ', '') like replace(params.pattern, ' ', '')
      or lpad(p.number::text, 4, '0') like params.pattern
    )
    and (params.from_instant is null or p.issued_at >= params.from_instant)
    and (params.to_instant is null or p.issued_at < params.to_instant)
$$;

-- Una página (20 en la app, spec §4.2) con el total y la suma de lo filtrado, y las cifras de la
-- cabecera: todas las proformas y las de este mes, en Lima.
create function public.search_proformas(
  search text default '',
  date_from date default null,
  date_to date default null,
  page integer default 1,
  page_size integer default 20
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
      greatest(page, 1)::bigint as current_page,
      (now() at time zone 'America/Lima')::date as today
  ),
  filtered as (
    select * from public.filter_proformas(search, date_from, date_to)
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'sum', (select coalesce(sum(f.total), 0)::text from filtered f),
    'all', (select count(*) from public.proformas),
    'this_month', (
      select count(*)
      from public.proformas p
      cross join params
      where p.issued_at >=
        (params.today - (extract(day from params.today)::integer - 1))::timestamp
          at time zone 'America/Lima'
    ),
    'items', coalesce(
      (
        select json_agg(
          json_build_object(
            'id', f.id, 'number', f.number, 'issued_at', f.issued_at,
            'valid_until', f.valid_until, 'client_name', f.client_name,
            'client_document', f.client_document, 'client_phone', f.client_phone,
            'item_count', f.item_count, 'total', f.total::text
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

-- Todo lo filtrado para el Excel, con el tope de Productos. Quien llama pide una de más para saber
-- si hubo recorte.
create function public.export_proformas(
  search text default '',
  date_from date default null,
  date_to date default null,
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
        'id', f.id, 'number', f.number, 'issued_at', f.issued_at,
        'valid_until', f.valid_until, 'client_name', f.client_name,
        'client_document', f.client_document, 'client_phone', f.client_phone,
        'item_count', f.item_count, 'total', f.total::text
      )
      order by f.sort_position
    ),
    '[]'::json
  )
  from public.filter_proformas(search, date_from, date_to) f
  where f.sort_position <= least(greatest(max_rows, 1), 20001)
$$;

-- Solo cuentas con sesión; las políticas RLS deciden qué filas ve cada una.
revoke execute on function public.filter_proformas(text, date, date) from public, anon;
grant execute on function public.filter_proformas(text, date, date) to authenticated;
revoke execute on function public.search_proformas(text, date, date, integer, integer)
  from public, anon;
grant execute on function public.search_proformas(text, date, date, integer, integer)
  to authenticated;
revoke execute on function public.export_proformas(text, date, date, integer) from public, anon;
grant execute on function public.export_proformas(text, date, date, integer) to authenticated;
```

- [ ] **Step 4: Aplicarla en el Supabase local y regenerar los tipos**

Run: `pnpm exec supabase migration up && pnpm db:types && pnpm exec prettier --write src/lib/supabase/database.types.ts`
Expected: «Applying migration 202610060002_proforma_history.sql…» sin errores; `database.types.ts` incluye la tabla `proformas` y las funciones `filter_proformas`, `search_proformas` y `export_proformas`.

- [ ] **Step 5: Ejecutar las pruebas y ver que pasan**

Run: `pnpm exec vitest run --project integration tests/integration/proforma-history-sql.test.ts && pnpm typecheck`
Expected: PASS en las 9 pruebas; sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202610060002_proforma_history.sql src/lib/supabase/database.types.ts tests/integration/db.ts tests/integration/proforma-history-sql.test.ts
git commit -m "feat: store proformas with server-side search, totals and pages"
```

---

### Task 8: Guardar la proforma en el historial al generarla

**Files:**
- Create:
  - `src/features/proforma/history/snapshot.ts`
  - `src/features/proforma/history/repository.ts`
  - `tests/integration/proforma-history.test.ts`
  - `tests/unit/proforma-snapshot.test.ts`
- Modify:
  - `src/features/company/queries.ts`
  - `src/features/proforma/document/service.ts`
  - `src/features/proforma/components/proforma-editor.tsx`
  - `src/features/proforma/components/proforma-ready.tsx`
  - `src/features/proforma/components/proforma-panel.tsx`
  - `src/features/proforma/components/proforma-dialog.tsx`
  - `src/features/catalog/components/catalog-screen.tsx`
  - `tests/e2e/proforma.spec.ts`, `tests/e2e/proformas.spec.ts`
- Test: `tests/integration/proforma-history.test.ts`, `tests/unit/proforma-snapshot.test.ts`, `tests/components/proforma-editor.test.tsx`, `tests/components/proforma-ready.test.tsx`

**Interfaces:**
- Consumes: la tabla `proformas` y `resetProformas` (tarea 7); `renderProformaDocument` con `company` (tarea 1).
- Produces:
  - `storedCompanySchema` (la forma de `CompanyProfile`) y `toCompanyProfile(row: unknown)` en `company/queries.ts`;
  - `snapshotSchema = z.object({ input: documentInputSchema, company: storedCompanySchema })` y `ProformaSnapshot`;
  - `saveProforma(supabase, input, company, issuedAt): Promise<ActionResult<null>>`, un *upsert* por `number`;
  - `renderProformaDocument` guarda toda proforma que no es borrador antes de entregarla;
  - `historyLink?: boolean` en `ProformaDialog`, `ProformaPanelProps` y `ProformaReadyProps`: ya generada, «Quedó guardada en el historial», con el enlace a Proformas si es `true` (desde Productos).

- [ ] **Step 1: Escribir las pruebas**

`tests/integration/proforma-history.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentInput } from '@/features/proforma/document/input'
import { sendProformaDocument } from '@/features/proforma/document/send'
import { createProformaDocument } from '@/features/proforma/document/service'
import type { WhatsAppProvider } from '@/features/whatsapp/provider'
import { stubWhatsAppProvider } from '@/features/whatsapp/stub-provider'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, fillCompanyProfile, resetCompanyProfile, resetProformas } from './db'

const password = 'historial-guardar-123'
const owner = { email: 'historial-guardar@catalogo.test', appMetadata: { catalog_access: 'owner' } }

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  supabase = await signedInClient(owner.email, password)
})

afterAll(async () => {
  await resetProformas(db)
  await db.end()
})

beforeEach(async () => {
  await resetProformas(db)
  await resetCompanyProfile(db)
  await fillCompanyProfile(db)
})

const laptop = {
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  unitPrice: '2590.00',
  quantity: 1,
}

const input = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  draft: false,
  number: 1,
  issuedAt: '2026-09-30T15:00:00.000Z',
  lines: [laptop],
  client: {
    name: 'Cliente de ejemplo S.A.C.',
    document: '20000000001',
    phone: '900 000 000',
    address: 'Av. Sol 456',
    deliveryTime: '',
  },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  ...overrides,
})

async function generate(value: DocumentInput) {
  const result = await createProformaDocument(supabase, value)
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

async function saved() {
  const { rows } = await db.query(
    `select id, number, issued_at, valid_until::text as valid_until, client_name, client_document,
            client_phone, item_count, total::text as total, document
       from public.proformas order by number`,
  )
  return rows
}

describe('historial al generar', () => {
  it('guarda la proforma generada con sus datos y la copia para volver a armarla', async () => {
    await generate(input())
    const [row] = await saved()
    expect(row).toMatchObject({
      number: 1,
      valid_until: '2026-10-07',
      client_name: 'Cliente de ejemplo S.A.C.',
      client_document: '20000000001',
      client_phone: '900 000 000',
      item_count: 1,
      total: '2590.00',
    })
    expect(row.document.input).toMatchObject({
      draft: false,
      number: 1,
      issuedAt: '2026-09-30T15:00:00.000Z',
      lines: [laptop],
    })
    expect(row.document.company).toMatchObject({
      legal_name: 'Empresa de Pruebas S.A.C.',
      default_validity_days: 7,
    })
  })

  it('«Corregir» y volver a generar actualiza la misma proforma y conserva su fecha', async () => {
    await generate(input())
    await generate(input({ lines: [{ ...laptop, quantity: 2 }] }))
    const rows = await saved()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      number: 1,
      issued_at: new Date('2026-09-30T15:00:00.000Z'),
      total: '5180.00',
    })
  })

  it('la vista previa no se guarda', async () => {
    await generate(input({ draft: true, number: null, issuedAt: null }))
    expect(await saved()).toEqual([])
  })

  it('un producto libre sin código se guarda tal cual', async () => {
    const service = {
      code: '',
      name: 'Instalación en sitio',
      description: null,
      unitPrice: '350',
      quantity: 1,
    }
    await generate(input({ lines: [service] }))
    expect((await saved())[0].document.input.lines).toEqual([service])
  })

  it('enviar por WhatsApp también la deja guardada, sin duplicarla', async () => {
    await generate(input())
    const provider: WhatsAppProvider = {
      ...stubWhatsAppProvider(supabase),
      sendDocument: async () => ({ ok: true }),
    }
    expect(await sendProformaDocument(supabase, input(), provider)).toMatchObject({ ok: true })
    expect(await saved()).toHaveLength(1)
  })
})
```

`tests/components/proforma-editor.test.tsx`, dentro de `describe('ProformaEditor', …)`:

```tsx
  it('lista para generar, dice que quedará en el historial', () => {
    seedProforma({ lines: [line()], client: withClient })
    renderEditor()
    expect(
      screen.getByText(
        'Recibe su número correlativo y queda guardada en el historial de Proformas.',
      ),
    ).toBeVisible()
  })
```

`tests/unit/proforma-snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildDocumentModel } from '@/features/proforma/document/model'
import { snapshotSchema } from '@/features/proforma/history/snapshot'

// Así guarda la base cada proforma desde esta versión. No la actualices al cambiar el código: si deja
// de leerse, las proformas guardadas ya no se podrán ver ni reenviar. Un campo nuevo de la entrada
// del documento o de la empresa necesita un valor por defecto (plan, decisión 26).
const STORED_V1 = {
  input: {
    draft: false,
    number: 42,
    issuedAt: '2026-10-02T15:00:00.000Z',
    lines: [
      {
        code: 'LAP-001',
        name: 'Laptop de 14 pulgadas',
        description: null,
        unitPrice: '2590.00',
        quantity: 2,
      },
      { code: '', name: 'Instalación en sitio', description: null, unitPrice: '350', quantity: 1 },
    ],
    client: {
      name: 'Inversiones Nuevo Sol S.A.C.',
      document: '20601234567',
      phone: '987 654 321',
      address: 'Av. Sol 456',
      deliveryTime: '',
    },
    validityDays: '',
    discountPercent: '',
    shipping: '',
  },
  company: {
    legal_name: 'Empresa de Pruebas S.A.C.',
    trade_name: 'Ventronix',
    ruc: '20000000001',
    address: 'Av. Prueba 123, Huamanga',
    phones: ['066 312345'],
    email: null,
    payment_terms: null,
    return_policy: null,
    default_validity_days: 7,
    bank_accounts: [],
    wallets: [],
    whatsapp_message: null,
    updated_at: '2026-10-01T00:00:00+00:00',
  },
}

describe('copia guardada en el historial', () => {
  it('la que se guarda hoy se sigue leyendo y arma el mismo documento', () => {
    const { input, company } = snapshotSchema.parse(STORED_V1)
    const model = buildDocumentModel(input, company, new Date(input.issuedAt ?? 0))
    expect(model).toMatchObject({
      numberLabel: 'N° 0042',
      date: '02/10/2026',
      validUntil: '09/10/2026',
      total: 'S/ 5,530.00',
      author: 'Ventronix',
    })
    expect(model.rows.map((row) => row.code)).toEqual(['LAP-001', '—'])
  })
})
```

`tests/components/proforma-ready.test.tsx`, dentro de `describe('ProformaReady', …)`:

```tsx
  it('lista, dice que quedó guardada y, desde Productos, enlaza al historial', async () => {
    seed()
    render(
      <ProformaProvider>
        <ProformaReady
          company={{ status: 'ready', profile: completeCompany }}
          generatePdf={vi.fn<Generate>(async () => ({ ok: true, data: pdf }))}
          onCorrect={vi.fn()}
          onNew={vi.fn()}
          historyLink
        />
      </ProformaProvider>,
    )
    expect(await screen.findByText(/Quedó guardada en el historial/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Proformas' })).toHaveAttribute('href', '/proformas')
  })

  it('desde Proformas lo dice sin enlace', async () => {
    seed()
    renderReady()
    expect(await screen.findByText('Quedó guardada en el historial.')).toBeVisible()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project integration tests/integration/proforma-history.test.ts && pnpm exec vitest run --project unit tests/unit/proforma-snapshot.test.ts && pnpm exec vitest run --project components tests/components/proforma-editor.test.tsx tests/components/proforma-ready.test.tsx -t "historial"`
Expected: FAIL: no se guarda ninguna fila (`saved()` vuelve vacío), `history/snapshot` no existe, la ayuda dice «Recibe su número correlativo al generarla.» y la vista «lista» no dice que quedó guardada.

- [ ] **Step 3: Validar lo guardado de la empresa con un solo schema**

`src/features/company/queries.ts`: reemplaza `storedLists`, `CompanyRow` y `toCompanyProfile` por:

```ts
// Lo guardado ya pasó por companyProfileSchema: aquí solo se comprueba su forma. Sirve para la fila
// de la empresa y para la copia que guarda cada proforma del historial (spec de productos libres §3).
export const storedCompanySchema = z.object({
  legal_name: z.string().nullable(),
  trade_name: z.string().nullable(),
  ruc: z.string().nullable(),
  address: z.string().nullable(),
  phones: z.array(z.string()),
  email: z.string().nullable(),
  payment_terms: z.string().nullable(),
  return_policy: z.string().nullable(),
  default_validity_days: z.number().int(),
  bank_accounts: z.array(
    z.object({
      bank: z.string(),
      account: z.string(),
      cci: z.string(),
      holder: z.string().nullable(),
    }),
  ),
  wallets: z.array(z.object({ kind: z.enum(WALLET_KINDS), number: z.string() })),
  whatsapp_message: z.string().nullable(),
  updated_at: z.string(),
}) satisfies z.ZodType<CompanyProfile>

export const toCompanyProfile = (row: unknown): CompanyProfile => storedCompanySchema.parse(row)
```

- [ ] **Step 4: Escribir la copia y el guardado**

`src/features/proforma/history/snapshot.ts`:

```ts
import { z } from 'zod'
import { storedCompanySchema } from '@/features/company/queries'
import { documentInputSchema } from '../document/input'

// La copia que guarda cada proforma del historial (spec de productos libres §3): lo que se envió al
// generarla y los datos de la empresa de ese día. Con ella se vuelve a armar el mismo PDF.
// Se guarda para siempre: un campo nuevo de DocumentInput o de la empresa necesita un valor por
// defecto, o las copias anteriores dejan de leerse (tests/unit/proforma-snapshot.test.ts).
export const snapshotSchema = z.object({
  input: documentInputSchema,
  company: storedCompanySchema,
})

export type ProformaSnapshot = z.infer<typeof snapshotSchema>
```

`src/features/proforma/history/repository.ts`:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, format } from 'date-fns'
import { failure } from '@/features/catalog/action-errors'
import type { CompanyProfile } from '@/features/company/schemas'
import type { ActionResult } from '@/lib/action-result'
import { lima } from '@/lib/dates'
import type { Database } from '@/lib/supabase/database.types'
import type { DocumentInput } from '../document/input'
import { centsToDecimal } from '../money'
import { totalsFromText } from '../totals'
import type { ProformaSnapshot } from './snapshot'

type Client = SupabaseClient<Database>

// Guarda o actualiza la proforma por su número (spec de productos libres §6): «Corregir» deja una
// sola fila, siempre con su última versión. La fecha queda fija en la copia, así el PDF del
// historial sale igual siempre.
export async function saveProforma(
  supabase: Client,
  input: DocumentInput,
  company: CompanyProfile,
  issuedAt: Date,
): Promise<ActionResult<null>> {
  const totals = totalsFromText(input)
  if (!totals || input.number === null) throw new Error('La proforma no es válida.')
  const validityDays = Number(input.validityDays || company.default_validity_days)
  const snapshot: ProformaSnapshot = {
    input: { ...input, issuedAt: issuedAt.toISOString() },
    company,
  }
  const { error } = await supabase.from('proformas').upsert(
    {
      number: input.number,
      issued_at: issuedAt.toISOString(),
      valid_until: format(addDays(issuedAt, validityDays, { in: lima }), 'yyyy-MM-dd', {
        in: lima,
      }),
      client_name: input.client.name.trim(),
      client_document: input.client.document,
      client_phone: input.client.phone.trim(),
      item_count: input.lines.length,
      // ponytail: como el precio del catálogo, el total viaja como texto exacto aunque el tipo
      // generado diga number; PostgREST lo convierte a numeric sin coma flotante.
      total: centsToDecimal(totals.total) as unknown as number,
      document: snapshot,
    },
    { onConflict: 'number' },
  )
  if (error) {
    console.error('[proforma] historial:', error.code, error.message)
    return failure(
      'UNEXPECTED',
      'No pudimos guardar la proforma en el historial. Inténtalo de nuevo.',
    )
  }
  return { ok: true, data: null }
}
```

(Si `tsc` no acepta `document: snapshot` como `Json`, usa `snapshot as unknown as Json` importando `Json` de `database.types` y anótalo como ruling.)

`src/features/proforma/document/service.ts`: importa `saveProforma` desde `'../history/repository'` y deja `renderProformaDocument` así:

```ts
// Genera el PDF con los datos de la empresa guardados. Una proforma que no es borrador queda en el
// historial antes de salir del servidor (spec de productos libres §6): si no se guarda, no se
// entrega.
export async function renderProformaDocument(
  supabase: SupabaseClient<Database>,
  input: DocumentInput,
  now = new Date(),
): Promise<ActionResult<{ model: DocumentModel; pdf: Buffer; company: CompanyProfile }>> {
  const company = await getCompanyProfile(supabase)
  if (!company) return failure('NOT_FOUND', 'No encontramos los datos de tu empresa.')
  const problem = documentProblem(input, company)
  if (problem) return failure('VALIDATION', problem)
  const model = buildDocumentModel(input, company, now)
  const pdf = await renderProformaPdf(model)
  if (!input.draft) {
    const issuedAt = input.issuedAt ? new Date(input.issuedAt) : now
    const saved = await saveProforma(supabase, input, company, issuedAt)
    if (!saved.ok) return saved
  }
  return { ok: true, data: { model, pdf, company } }
}
```

`src/features/proforma/components/proforma-editor.tsx`: la ayuda bajo «Generar proforma» pasa a «Recibe su número correlativo y queda guardada en el historial de Proformas.».

`src/features/proforma/components/proforma-ready.tsx`: importa `Link` de `next/link`, añade a `ProformaReadyProps`:

```ts
  // Desde Productos, el aviso de que quedó guardada enlaza al historial (spec §4.3).
  historyLink?: boolean
```

recíbela y, después del bloque de «Preparando el PDF…» y su error:

```tsx
      {status.kind === 'ready' ? (
        <p className="text-xs text-muted-foreground">
          Quedó guardada en el historial
          {historyLink ? (
            <>
              {' '}
              de{' '}
              <Link href="/proformas" className={inlineAction}>
                Proformas
              </Link>
            </>
          ) : null}
          .
        </p>
      ) : null}
```

`src/features/proforma/components/proforma-panel.tsx`: `ProformaPanelProps` añade `historyLink?: ProformaReadyProps['historyLink']`; `ProformaPanel` la saca de sus props (junto a `sendByWhatsApp`) y la pasa a `ProformaReady`.

`src/features/proforma/components/proforma-dialog.tsx`: la firma añade `historyLink?: boolean` y la pasa a `ProformaPanel`. `src/features/catalog/components/catalog-screen.tsx`: `<ProformaDialog … historyLink />`.

`tests/e2e/proforma.spec.ts` y `tests/e2e/proformas.spec.ts`: añade `resetProformas` a la importación de `../integration/db` y llámalo en `seed()`, justo después de `resetCatalog(db)`: la numeración vuelve a empezar en 1 y el historial también.

- [ ] **Step 5: Ejecutar las pruebas, los tipos, el lint y las e2e de la proforma**

Run: `pnpm exec vitest run --project integration tests/integration/proforma-history.test.ts tests/integration/proforma-document.test.ts tests/integration/whatsapp-service.test.ts && pnpm test && pnpm typecheck && pnpm lint && pnpm exec playwright test tests/e2e/proforma.spec.ts tests/e2e/proformas.spec.ts`
(`pnpm test` incluye `tests/unit/proforma-snapshot.test.ts` y `tests/components/proforma-ready.test.tsx`.)
Expected: PASS en todo. Las pruebas del documento y de WhatsApp siguen pasando, ahora guardando cada proforma que generan.

- [ ] **Step 6: Commit**

```bash
git add src/features/company/queries.ts src/features/proforma/history/snapshot.ts src/features/proforma/history/repository.ts src/features/proforma/document/service.ts src/features/proforma/components/proforma-editor.tsx src/features/proforma/components/proforma-ready.tsx src/features/proforma/components/proforma-panel.tsx src/features/proforma/components/proforma-dialog.tsx src/features/catalog/components/catalog-screen.tsx tests/integration/proforma-history.test.ts tests/unit/proforma-snapshot.test.ts tests/components/proforma-editor.test.tsx tests/components/proforma-ready.test.tsx tests/e2e/proforma.spec.ts tests/e2e/proformas.spec.ts
git commit -m "feat: keep every generated proforma in the history, by number"
```

---

### Task 9: PDF, mensaje y reenvío desde la copia

**Files:**
- Create: `src/features/proforma/history/service.ts`, `src/features/proforma/history/actions.ts`
- Modify: `src/features/proforma/document/send.ts`, `src/features/proforma/history/snapshot.ts`
- Test: `tests/integration/proforma-history.test.ts`

**Interfaces:**
- Consumes: `snapshotSchema` (tarea 8); `whatsappMessage` (tarea 1).
- Produces:
  - `StoredDocument = GeneratedDocument & { message: string }` (en `snapshot.ts`);
  - `deliverByWhatsApp(provider, { phone, fileName, document, caption })` → `ActionResult<{ phone: string }>`;
  - `storedProformaDocument(supabase, id)` → `ActionResult<StoredDocument>`; una copia que no se puede leer da «No pudimos leer la copia guardada de esta proforma.»;
  - `resendStoredProforma(supabase, { id, phone }, provider)` → `ActionResult<{ phone: string }>`;
  - Server Actions `getProformaDocument(id)` y `resendProforma({ id, phone })`.

- [ ] **Step 1: Escribir las pruebas**

`tests/integration/proforma-history.test.ts`:
- añade a las importaciones:

```ts
import { resendStoredProforma, storedProformaDocument } from '@/features/proforma/history/service'
import { pdfText } from '../support/pdf-text'
```

- cambia la importación de tipos del proveedor por `import type { SendDocumentInput, WhatsAppProvider } from '@/features/whatsapp/provider'`;
- y, al final:

```ts
describe('desde el historial', () => {
  const firstId = async () => (await saved())[0].id as string

  it('vuelve a armar el mismo PDF aunque la empresa haya cambiado', async () => {
    await generate(input())
    await db.query("update public.company_profile set address = 'Otra dirección 999'")
    const result = await storedProformaDocument(supabase, await firstId())
    if (!result.ok) throw new Error(result.error.message)
    const text = pdfText(Buffer.from(result.data.base64, 'base64'))
    expect(text).toContain('Av. Prueba 123')
    expect(text).not.toContain('Otra')
    expect(result.data.fileName).toBe('Proforma-0001-Cliente-de-ejemplo-SAC.pdf')
  })

  it('el mensaje es el de Empresa de hoy, con los datos de la proforma', async () => {
    await generate(input())
    await db.query(
      "update public.company_profile set whatsapp_message = 'Le reenvío la {numero} por {total}, válida hasta el {vence}.'",
    )
    expect(await storedProformaDocument(supabase, await firstId())).toMatchObject({
      ok: true,
      data: { message: 'Le reenvío la N° 0001 por S/ 2,590.00, válida hasta el 07/10/2026.' },
    })
  })

  it('reenvía por WhatsApp el mismo PDF al celular que se indique', async () => {
    await generate(input())
    const sent: SendDocumentInput[] = []
    const provider: WhatsAppProvider = {
      ...stubWhatsAppProvider(supabase),
      sendDocument: async (document) => {
        sent.push(document)
        return { ok: true }
      },
    }
    expect(
      await resendStoredProforma(supabase, { id: await firstId(), phone: '911 222 333' }, provider),
    ).toEqual({ ok: true, data: { phone: '911 222 333' } })
    expect(sent[0]).toMatchObject({
      phone: '911222333',
      fileName: 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf',
    })
    expect(sent[0].document.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('sin celular válido, sin configurar o sin la proforma, lo dice', async () => {
    await generate(input())
    const id = await firstId()
    const provider = stubWhatsAppProvider(supabase)
    expect(await resendStoredProforma(supabase, { id, phone: '123' }, provider)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(await resendStoredProforma(supabase, { id, phone: '987654321' }, null)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(
      await storedProformaDocument(supabase, '00000000-0000-4000-8000-000000000000'),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('una copia que no se puede leer lo dice con claridad', async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into public.proformas
         (number, issued_at, valid_until, client_name, item_count, total, document)
       values (99, now(), current_date, 'Cliente', 1, 10, '{"input": {}}') returning id`,
    )
    expect(await storedProformaDocument(supabase, rows[0].id)).toMatchObject({
      ok: false,
      error: { message: 'No pudimos leer la copia guardada de esta proforma.' },
    })
  })
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project integration tests/integration/proforma-history.test.ts`
Expected: FAIL al importar: `@/features/proforma/history/service` no existe.

- [ ] **Step 3: Separar el envío en sí**

`src/features/proforma/document/send.ts`, completo:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure } from '@/features/catalog/action-errors'
import { formatMobile } from '@/features/company/format'
import type {
  SendDocumentInput,
  SendDocumentResult,
  WhatsAppProvider,
} from '@/features/whatsapp/provider'
import { NOT_CONFIGURED } from '@/features/whatsapp/service'
import type { ActionErrorCode, ActionResult } from '@/lib/action-result'
import { digitsOnly, isValidMobile } from '@/lib/peru'
import type { Database } from '@/lib/supabase/database.types'
import { whatsappMessage } from './format'
import type { DocumentInput } from './input'
import { renderProformaDocument } from './service'

type Failed = Exclude<SendDocumentResult, { ok: true }>['reason']

const SEND_ERRORS: Record<Failed, (phone: string) => [ActionErrorCode, string]> = {
  'not-linked': () => ['NOT_FOUND', 'Vincula el WhatsApp de la empresa en Empresa para enviarla.'],
  busy: () => ['CONFLICT', 'Hay otro envío en curso. Inténtalo en unos segundos.'],
  'no-whatsapp': (phone) => ['VALIDATION', `El ${phone} no tiene WhatsApp.`],
  'logged-out': () => ['NOT_FOUND', 'WhatsApp se desvinculó. Vuelve a vincularlo en Empresa.'],
  failed: () => ['UNEXPECTED', 'No pudimos enviarla por WhatsApp.'],
}

const NO_MOBILE = 'Añade el celular del cliente para enviarla por WhatsApp.'

// El envío en sí, para la proforma recién generada y para el reenvío desde el historial.
export async function deliverByWhatsApp(
  provider: WhatsAppProvider,
  document: SendDocumentInput,
): Promise<ActionResult<{ phone: string }>> {
  const phone = digitsOnly(document.phone)
  if (!isValidMobile(phone)) return failure('VALIDATION', NO_MOBILE)
  const result = await provider.sendDocument({ ...document, phone })
  if (!result.ok) return failure(...SEND_ERRORS[result.reason](formatMobile(phone)))
  return { ok: true, data: { phone: formatMobile(phone) } }
}

// Envío automático (spec de WhatsApp §4): el mismo PDF de «Descargar PDF», con el mensaje de
// Empresa como pie, al celular del cliente desde el WhatsApp de la empresa.
export async function sendProformaDocument(
  supabase: SupabaseClient<Database>,
  input: DocumentInput,
  provider: WhatsAppProvider | null,
): Promise<ActionResult<{ phone: string }>> {
  if (!provider) return failure('VALIDATION', NOT_CONFIGURED)
  if (input.draft) return failure('VALIDATION', 'Genera la proforma para enviarla.')
  // Sin celular no hay envío: se dice antes de armar (y guardar) el documento.
  if (!isValidMobile(digitsOnly(input.client.phone))) return failure('VALIDATION', NO_MOBILE)
  const document = await renderProformaDocument(supabase, input)
  if (!document.ok) return document
  const { model, pdf, company } = document.data
  return deliverByWhatsApp(provider, {
    phone: input.client.phone,
    fileName: model.fileName,
    document: pdf,
    caption: whatsappMessage(company.whatsapp_message, {
      clientName: input.client.name,
      numberLabel: model.numberLabel ?? '',
      total: model.total,
      validUntil: model.validUntil,
      sender: model.author,
    }),
  })
}
```

- [ ] **Step 4: Escribir el servicio y las acciones del historial**

`src/features/proforma/history/snapshot.ts`: importa `type GeneratedDocument` desde `'../document/input'` y añade al final:

```ts
// El PDF del historial y el mensaje con que se reenvía (plan, decisión 8).
export type StoredDocument = GeneratedDocument & { message: string }
```

`src/features/proforma/history/service.ts`:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure } from '@/features/catalog/action-errors'
import { getCompanyProfile } from '@/features/company/queries'
import type { WhatsAppProvider } from '@/features/whatsapp/provider'
import { NOT_CONFIGURED } from '@/features/whatsapp/service'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import { whatsappMessage } from '../document/format'
import { buildDocumentModel, type DocumentModel } from '../document/model'
import { renderProformaPdf } from '../document/pdf'
import { deliverByWhatsApp } from '../document/send'
import { snapshotSchema, type StoredDocument } from './snapshot'

type Client = SupabaseClient<Database>

const GONE = 'No encontramos esa proforma. Actualiza la lista.'

// El PDF del historial se vuelve a armar desde la copia (spec de productos libres §3): mismos
// productos, precios y datos de la empresa de ese día. El mensaje es el de Empresa de hoy, con los
// datos de esa proforma (plan, decisión 8).
async function renderStored(
  supabase: Client,
  id: string,
): Promise<ActionResult<{ model: DocumentModel; pdf: Buffer; message: string }>> {
  const { data, error } = await supabase
    .from('proformas')
    .select('document')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return failure('NOT_FOUND', GONE)
  const snapshot = snapshotSchema.safeParse(data.document)
  if (!snapshot.success) {
    console.error('[proforma] copia ilegible:', id, snapshot.error.message)
    return failure('UNEXPECTED', 'No pudimos leer la copia guardada de esta proforma.')
  }
  const { input, company } = snapshot.data
  const model = buildDocumentModel(input, company, new Date(input.issuedAt ?? 0))
  const [pdf, current] = await Promise.all([renderProformaPdf(model), getCompanyProfile(supabase)])
  const message = whatsappMessage(current?.whatsapp_message ?? null, {
    clientName: input.client.name,
    numberLabel: model.numberLabel ?? '',
    total: model.total,
    validUntil: model.validUntil,
    sender: model.author,
  })
  return { ok: true, data: { model, pdf, message } }
}

export async function storedProformaDocument(
  supabase: Client,
  id: string,
): Promise<ActionResult<StoredDocument>> {
  const stored = await renderStored(supabase, id)
  if (!stored.ok) return stored
  const { model, pdf, message } = stored.data
  return { ok: true, data: { fileName: model.fileName, base64: pdf.toString('base64'), message } }
}

// «Reenviar» (spec §4.4): al celular de la proforma o al que se escriba solo para este envío.
export async function resendStoredProforma(
  supabase: Client,
  request: { id: string; phone: string },
  provider: WhatsAppProvider | null,
): Promise<ActionResult<{ phone: string }>> {
  if (!provider) return failure('VALIDATION', NOT_CONFIGURED)
  const stored = await renderStored(supabase, request.id)
  if (!stored.ok) return stored
  return deliverByWhatsApp(provider, {
    phone: request.phone,
    fileName: stored.data.model.fileName,
    document: stored.data.pdf,
    caption: stored.data.message,
  })
}
```

`src/features/proforma/history/actions.ts`:

```ts
'use server'

import { z } from 'zod'
import { invalid } from '@/features/catalog/action-errors'
import { idSchema } from '@/features/catalog/schemas'
import { getWhatsAppProvider } from '@/features/whatsapp/provider'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { resendStoredProforma, storedProformaDocument } from './service'
import type { StoredDocument } from './snapshot'

// «Ver PDF», «Descargar PDF» y el mensaje de «Reenviar» (spec de productos libres §6).
export async function getProformaDocument(id: unknown): Promise<ActionResult<StoredDocument>> {
  return withOwner(async ({ supabase }) => {
    const parsed = idSchema.safeParse(id)
    if (!parsed.success) return invalid(parsed.error)
    return storedProformaDocument(supabase, parsed.data)
  })
}

const resendSchema = z.object({ id: idSchema, phone: z.string().max(20) })

// Reenvío con el WhatsApp de la empresa (spec §4.4): conecta, envía y guarda la sesión, hasta un
// minuto (maxDuration de Proformas).
export async function resendProforma(input: unknown): Promise<ActionResult<{ phone: string }>> {
  return withOwner(async ({ supabase }) => {
    const parsed = resendSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return resendStoredProforma(supabase, parsed.data, getWhatsAppProvider(supabase))
  })
}
```

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project integration tests/integration/proforma-history.test.ts tests/integration/whatsapp-service.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS en todo; el envío de WhatsApp sigue respondiendo igual que antes.

- [ ] **Step 6: Commit**

```bash
git add src/features/proforma/document/send.ts src/features/proforma/history/snapshot.ts src/features/proforma/history/service.ts src/features/proforma/history/actions.ts tests/integration/proforma-history.test.ts
git commit -m "feat: rebuild, download and resend a saved proforma from its copy"
```

---

### Task 10: Lista del historial con búsqueda, fechas y páginas

**Files:**
- Create:
  - `src/features/proforma/history/queries.ts`
  - `src/features/proforma/history/search-params.ts`
  - `src/features/proforma/history/hooks.ts`
  - `src/features/proforma/history/components/history-filters.tsx`
  - `src/features/proforma/history/components/history-results.tsx`
  - `tests/components/proforma-history.test.tsx`
- Modify:
  - `src/features/proforma/history/components/proformas-screen.tsx`
  - `src/features/proforma/components/proforma-dialog.tsx`
  - `src/features/catalog/products/hooks.ts`
- Test: `tests/components/proforma-history.test.tsx`, `tests/integration/proforma-history-sql.test.ts`

**Interfaces:**
- Consumes:
  - `search_proformas` (tarea 7) y `getProformaDocument` (tarea 9);
  - `Pagination`, `EmptyState` y `DateFilterControl` sin `dateBy` (tarea 6).
- Produces:
  - en `queries.ts`:
    - `HISTORY_PAGE_SIZE = 20`;
    - `ProformaRow = { id; number; issued_at; valid_until; client_name; client_document; client_phone; item_count; total }`;
    - `HistoryQuery = { search; page; dateFrom; dateTo }`;
    - `HistoryPage = { items; total; sum; all; thisMonth }`;
    - `listProformas(supabase, query, signal?)`;
  - `historyParsers` (search, page, date, from, to);
  - en `hooks.ts`:
    - `historyKeys.all = ['proformas']`, `historyKeys.list(query)` y `historyKeys.document(id)`;
    - `DOCUMENT_STALE_MS = 60_000` y `fetchStoredDocument(id)` → `Promise<StoredDocument>` (lanza el error del servidor);
    - `useHistoryFilters()`, `useProformaHistory()`;
    - `useStoredDocument()` → `{ pending, view(row), download(row) }`, con el PDF compartido un minuto (plan, decisión 22);
  - `HistoryFilters()` y `HistoryResults({ page, data, today, updating?, onPage, onClear, onNew, onView, onDownload, onClient, pendingId })`: marca «Vencida» y el nombre del cliente muestra todas sus proformas;
  - `useDebouncedValue` se exporta desde `catalog/products/hooks.ts`.

- [ ] **Step 1: Escribir las pruebas**

`tests/integration/proforma-history-sql.test.ts`: importa `import { listProformas } from '@/features/proforma/history/queries'` y añade:

```ts
describe('listProformas', () => {
  it('pasa la página de la base a la app', async () => {
    await insert({ number: 1, total: '7960.00' })
    expect(
      await listProformas(supabase, { search: '', page: 1, dateFrom: null, dateTo: null }),
    ).toMatchObject({ total: 1, sum: '7960.00', all: 1, items: [{ number: 1, total: '7960.00' }] })
  })
})
```

`tests/components/proforma-history.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing'
import { describe, expect, it, vi } from 'vitest'
import { HistoryFilters } from '@/features/proforma/history/components/history-filters'
import { HistoryResults } from '@/features/proforma/history/components/history-results'
import type { HistoryPage, ProformaRow } from '@/features/proforma/history/queries'

const row = (number: number, overrides: Partial<ProformaRow> = {}): ProformaRow => ({
  id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
  number,
  issued_at: '2026-10-02T15:00:00.000Z',
  valid_until: '2026-10-09',
  client_name: 'Inversiones Nuevo Sol S.A.C.',
  client_document: '20601234567',
  client_phone: '987654321',
  item_count: 3,
  total: '7960.00',
  ...overrides,
})

const page = (overrides: Partial<HistoryPage> = {}): HistoryPage => ({
  items: [row(42), row(41, { client_name: 'José Pérez', client_document: '', total: '350.00' })],
  total: 22,
  sum: '152300.50',
  all: 48,
  thisMonth: 12,
  ...overrides,
})

function renderResults(data = page(), today = '2026-10-06', updating = false) {
  const handlers = {
    onPage: vi.fn(),
    onClear: vi.fn(),
    onNew: vi.fn(),
    onView: vi.fn(),
    onDownload: vi.fn(),
    onClient: vi.fn(),
  }
  render(
    <HistoryResults
      page={2}
      data={data}
      today={today}
      updating={updating}
      pendingId={null}
      {...handlers}
    />,
  )
  return { ...handlers, user: userEvent.setup() }
}

describe('HistoryResults', () => {
  it('muestra cada proforma, la suma del periodo y qué filas se ven', () => {
    renderResults()
    const table = within(screen.getByRole('table', { name: 'Proformas guardadas' }))
    const [first, second] = table.getAllByRole('row').slice(1)
    for (const text of [
      '0042',
      '02/10/2026',
      'Inversiones Nuevo Sol S.A.C.',
      '20601234567',
      'S/ 7,960.00',
      '09/10/2026',
    ]) {
      expect(first).toHaveTextContent(text)
    }
    expect(second).toHaveTextContent('—')
    expect(screen.getByText('22 proformas')).toBeVisible()
    expect(screen.getByText('S/ 152,300.50')).toBeVisible()
    expect(screen.getByText('Proformas 21–22 de 22')).toBeVisible()
  })

  it('cambia de página y abre o descarga el PDF de una fila', async () => {
    const { onPage, onView, onDownload, user } = renderResults()
    await user.click(screen.getByRole('button', { name: 'Página 1' }))
    expect(onPage).toHaveBeenCalledWith(1)
    const table = within(screen.getByRole('table'))
    await user.click(table.getByRole('button', { name: 'Ver PDF de la proforma N° 0042' }))
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ number: 42 }))
    await user.click(table.getByRole('button', { name: 'Descargar PDF de la proforma N° 0041' }))
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ number: 41 }))
  })

  it('marca «Vencida» la que ya pasó su validez, en días de Lima', () => {
    renderResults(page(), '2026-10-10')
    const [first] = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(first).toHaveTextContent('Vencida')
  })

  it('el último día de validez todavía no está vencida', () => {
    renderResults(page(), '2026-10-09')
    expect(screen.queryByText('Vencida')).not.toBeInTheDocument()
  })

  it('el nombre del cliente muestra todas sus proformas', async () => {
    const { onClient, user } = renderResults()
    const table = within(screen.getByRole('table'))
    await user.click(
      table.getByRole('button', { name: 'Ver las proformas de Inversiones Nuevo Sol S.A.C.' }),
    )
    expect(onClient).toHaveBeenCalledWith(expect.objectContaining({ number: 42 }))
  })

  it('mientras llega otra página o búsqueda, la actual se atenúa sin vaciarse', () => {
    renderResults(page(), '2026-10-06', true)
    expect(screen.getByRole('table').parentElement).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('table')).toHaveTextContent('0042')
  })

  it('sin proformas invita a crear la primera', async () => {
    const { onNew, user } = renderResults(page({ items: [], total: 0, all: 0, sum: '0' }))
    expect(screen.getByText('Todavía no hay proformas guardadas')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Nueva proforma' }))
    expect(onNew).toHaveBeenCalled()
  })

  it('sin resultados ofrece limpiar los filtros', async () => {
    const { onClear, user } = renderResults(page({ items: [], total: 0, sum: '0' }))
    expect(screen.getByText('Ninguna proforma coincide con la búsqueda')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    expect(onClear).toHaveBeenCalled()
  })
})

describe('HistoryFilters', () => {
  it('la búsqueda y las fechas van a la URL y vuelven a la página 1', async () => {
    const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>()
    render(
      <NuqsTestingAdapter searchParams="?page=3" onUrlUpdate={onUrlUpdate} hasMemory>
        <HistoryFilters />
      </NuqsTestingAdapter>,
    )
    const last = () => onUrlUpdate.mock.lastCall![0].searchParams
    const user = userEvent.setup()
    await user.type(
      screen.getByLabelText('Buscar por cliente, RUC, DNI, celular o N° de proforma'),
      'perez',
    )
    expect(last().get('search')).toBe('perez')
    expect(last().has('page')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Filtrar por fecha' }))
    await user.click(screen.getByRole('radio', { name: 'Este mes' }))
    expect(last().get('date')).toBe('month')
    await user.click(screen.getByRole('button', { name: /Limpiar/ }))
    expect(last().toString()).toBe('')
  })
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project components tests/components/proforma-history.test.tsx`
Expected: FAIL al importar: los componentes del historial no existen.

- [ ] **Step 3: Escribir la consulta, la URL y los hooks**

`src/features/proforma/history/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { normalizeSearch } from '@/features/catalog/search-pattern'
import type { Database } from '@/lib/supabase/database.types'

type Client = SupabaseClient<Database>

// 20 por página, contadas en la base (spec de productos libres §4.2).
export const HISTORY_PAGE_SIZE = 20

// Totales como texto exacto, como los precios del catálogo.
const rowSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  issued_at: z.string(),
  valid_until: z.string(),
  client_name: z.string(),
  client_document: z.string(),
  client_phone: z.string(),
  item_count: z.number().int(),
  total: z.string(),
})

const pageSchema = z.object({
  total: z.number().int(),
  sum: z.string(),
  all: z.number().int(),
  this_month: z.number().int(),
  items: z.array(rowSchema),
})

export type ProformaRow = z.infer<typeof rowSchema>
export type HistoryQuery = {
  search: string
  page: number
  dateFrom: string | null
  dateTo: string | null
}
export type HistoryPage = {
  items: ProformaRow[]
  total: number
  sum: string
  all: number
  thisMonth: number
}

// Búsqueda y fechas: las mismas para la lista y para el Excel.
export const historyArgs = (query: Omit<HistoryQuery, 'page'>) => ({
  search: normalizeSearch(query.search),
  date_from: query.dateFrom ?? undefined,
  date_to: query.dateTo ?? undefined,
})

// La base filtra, cuenta, suma y devuelve solo la página pedida: nunca se descarga el historial.
export async function listProformas(
  supabase: Client,
  query: HistoryQuery,
  signal?: AbortSignal,
): Promise<HistoryPage> {
  let request = supabase.rpc('search_proformas', {
    ...historyArgs(query),
    page: query.page,
    page_size: HISTORY_PAGE_SIZE,
  })
  if (signal) request = request.abortSignal(signal)
  const { data, error } = await request
  if (error) throw error
  const page = pageSchema.parse(data)
  return {
    items: page.items,
    total: page.total,
    sum: page.sum,
    all: page.all,
    thisMonth: page.this_month,
  }
}
```

`src/features/proforma/history/search-params.ts`:

```ts
import { searchParsers } from '@/features/catalog/search-params'

// Búsqueda, fechas y página del historial en la URL (spec de productos libres §4.2): recargar o
// compartir el enlace muestra lo mismo. Los mismos parsers que Productos.
export const historyParsers = {
  search: searchParsers.search,
  page: searchParsers.page,
  date: searchParsers.date,
  from: searchParsers.from,
  to: searchParsers.to,
}
```

`src/features/catalog/products/hooks.ts`: `function useDebouncedValue` pasa a `export function useDebouncedValue`.

`src/features/proforma/history/hooks.ts`:

```ts
'use client'

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useQueryStates } from 'nuqs'
import { useState } from 'react'
import { toast } from 'sonner'
import { resolveDateRange } from '@/features/catalog/list-options'
import { useDebouncedValue } from '@/features/catalog/products/hooks'
import { settle } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/client'
import { base64ToFile, downloadFile, newTab, openFile, TAB_BLOCKED } from '../document/files'
import { getProformaDocument } from './actions'
import { listProformas, type HistoryQuery, type ProformaRow } from './queries'
import { historyParsers } from './search-params'

// Bajo «proformas»: generar una proforma refresca la lista, las cifras y los PDF (spec §6).
export const historyKeys = {
  all: ['proformas'] as const,
  list: (query: HistoryQuery) => ['proformas', 'list', query] as const,
  document: (id: string) => ['proformas', 'document', id] as const,
}

// El PDF de una proforma guardada vale un minuto: «Ver PDF», «Descargar PDF» y «Reenviar» lo
// comparten y un doble clic no lo genera dos veces (plan, decisión 22).
export const DOCUMENT_STALE_MS = 60_000

// Lanza el error del servidor: TanStack Query lo guarda como el error de la consulta.
export async function fetchStoredDocument(id: string) {
  const result = await settle(getProformaDocument(id))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

// Búsqueda, fechas y página viven en la URL; cada filtro añade una entrada al historial del
// navegador para que atrás y adelante los restauren.
export function useHistoryFilters() {
  return useQueryStates(historyParsers, { history: 'push' })
}

// La búsqueda espera 300 ms (spec §4.2); las fechas viajan ya resueltas en días de Lima.
export function useProformaHistory() {
  const [filters] = useHistoryFilters()
  const search = useDebouncedValue(filters.search, 300)
  const range = resolveDateRange(filters)
  const query: HistoryQuery = {
    search,
    page: filters.page,
    dateFrom: range?.from ?? null,
    dateTo: range?.to ?? null,
  }
  return {
    filters,
    query: useQuery({
      queryKey: historyKeys.list(query),
      queryFn: ({ signal }) => listProformas(createClient(), query, signal),
      placeholderData: keepPreviousData,
    }),
  }
}

// «Ver PDF» y «Descargar PDF» desde la copia (spec §6). La pestaña se abre al pulsar, antes de
// esperar al servidor, para que el navegador no la bloquee.
export function useStoredDocument() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)

  async function fetchFile(row: ProformaRow) {
    setPending(row.id)
    try {
      const stored = await queryClient.fetchQuery({
        queryKey: historyKeys.document(row.id),
        queryFn: () => fetchStoredDocument(row.id),
        staleTime: DOCUMENT_STALE_MS,
        retry: false,
      })
      return base64ToFile(stored.base64, stored.fileName)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No pudimos preparar el PDF.')
      return null
    } finally {
      setPending(null)
    }
  }

  return {
    pending,
    async view(row: ProformaRow) {
      const tab = newTab()
      const file = await fetchFile(row)
      if (!file) {
        tab?.close()
        return
      }
      if (!openFile(file, tab)) toast(TAB_BLOCKED)
    },
    async download(row: ProformaRow) {
      const file = await fetchFile(row)
      if (file) downloadFile(file)
    },
  }
}
```

`src/features/proforma/components/proforma-dialog.tsx`: importa `useQueryClient` de `@tanstack/react-query` y `historyKeys` de `'../history/hooks'`; dentro del componente, `const queryClient = useQueryClient()`; y `generatePdf` pasa a:

```tsx
          generatePdf={async (input) => {
            const result = await settle(generateProformaDocument(input))
            // La proforma generada ya está en el historial (spec de productos libres §6).
            if (result.ok && !input.draft) {
              void queryClient.invalidateQueries({ queryKey: historyKeys.all })
            }
            return result
          }}
```

- [ ] **Step 4: Escribir los filtros y los resultados**

`src/features/proforma/history/components/history-filters.tsx`:

```tsx
'use client'

import { Search, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateFilterControl } from '@/features/catalog/products/components/date-filter'
import { limaDay } from '@/features/catalog/list-options'
import { useHistoryFilters } from '../hooks'

// Búsqueda por cliente, RUC, DNI, celular o N° y filtro de fecha (spec de productos libres §4.2).
// Cambiar un filtro vuelve a la página 1.
export function HistoryFilters() {
  const [filters, setFilters] = useHistoryFilters()
  // Como en Productos: «hoy» se fija al montar (solo limita los calendarios).
  const [today] = useState(() => limaDay(new Date()))
  const hasFilters = filters.search !== '' || filters.date !== null

  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
      <div className="relative min-w-0 flex-1 basis-60 sm:max-w-[440px]">
        <Search
          className="pointer-events-none absolute top-3 left-3 size-4.5 text-muted-foreground"
          aria-hidden
        />
        <label htmlFor="proforma-search" className="sr-only">
          Buscar por cliente, RUC, DNI, celular o N° de proforma
        </label>
        <Input
          id="proforma-search"
          type="search"
          value={filters.search}
          onChange={(event) =>
            setFilters({ search: event.target.value || null, page: null }, { history: 'replace' })
          }
          maxLength={120}
          autoComplete="off"
          placeholder="Cliente, RUC, DNI, celular o N°…"
          className="bg-background/60 pl-10"
        />
      </div>
      <DateFilterControl
        value={filters}
        today={today}
        onChange={({ date, from, to }) => void setFilters({ date, from, to, page: null })}
      />
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilters({ search: null, date: null, from: null, to: null, page: null })}
        >
          <X aria-hidden />
          Limpiar<span className="max-sm:sr-only"> filtros</span>
        </Button>
      ) : null}
    </div>
  )
}
```

`src/features/proforma/history/components/history-results.tsx`:

```tsx
'use client'

import { Download, Eye, FileText, Search } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Pagination } from '@/components/pagination'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDay } from '@/features/catalog/list-options'
import { formatPrice } from '@/features/catalog/money'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { formatProformaNumber } from '../../number'
import { HISTORY_PAGE_SIZE, type HistoryPage, type ProformaRow } from '../queries'

export type RowActions = {
  onView: (row: ProformaRow) => void
  onDownload: (row: ProformaRow) => void
  // Todas las proformas de ese cliente (plan, decisión 23).
  onClient: (row: ProformaRow) => void
  // La fila cuyo PDF se está preparando.
  pendingId: string | null
}

type HistoryResultsProps = RowActions & {
  page: number
  data: HistoryPage
  // Hoy en Lima (AAAA-MM-DD), para marcar las vencidas.
  today: string
  // Llega otra página o búsqueda: la actual se atenúa sin vaciarse.
  updating?: boolean
  onPage: (page: number) => void
  onClear: () => void
  onNew: () => void
}

const shortNumber = (number: number) => String(number).padStart(4, '0')

// Resumen del periodo, tabla (PC), tarjetas (móvil) y páginas (spec de productos libres §4.2).
export function HistoryResults({
  page,
  data,
  today,
  updating = false,
  onPage,
  onClear,
  onNew,
  ...actions
}: HistoryResultsProps) {
  if (data.all === 0) {
    return (
      <EmptyState
        icon={<FileText className="size-6" aria-hidden />}
        title="Todavía no hay proformas guardadas"
        text="Las proformas que generes quedan aquí para volver a enviarlas."
        action={<Button onClick={onNew}>Nueva proforma</Button>}
      />
    )
  }
  if (data.total === 0) {
    return (
      <EmptyState
        icon={<Search className="size-6" aria-hidden />}
        title="Ninguna proforma coincide con la búsqueda"
        text="Prueba con otro cliente, documento, número o rango de fechas."
        action={
          <Button variant="outline" onClick={onClear}>
            Limpiar filtros
          </Button>
        }
      />
    )
  }
  const totalPages = Math.max(1, Math.ceil(data.total / HISTORY_PAGE_SIZE))
  const from = (page - 1) * HISTORY_PAGE_SIZE + 1
  return (
    <>
      <p className="border-b px-4 py-2.5 text-[13px] text-muted-foreground sm:px-5">
        <span className="font-semibold text-foreground">
          {data.total} {data.total === 1 ? 'proforma' : 'proformas'}
        </span>{' '}
        · suman{' '}
        <span className="font-semibold text-foreground tabular-nums">
          S/ {formatPrice(data.sum)}
        </span>
      </p>
      <div
        aria-busy={updating}
        className={cn('transition-opacity motion-reduce:transition-none', updating && 'opacity-60')}
      >
        <HistoryTable items={data.items} today={today} {...actions} />
        <HistoryCards items={data.items} today={today} {...actions} />
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        label="Páginas de proformas"
        summary={`Proformas ${from}–${from + data.items.length - 1} de ${data.total}`}
        onPage={onPage}
      />
    </>
  )
}

export function HistoryLoading() {
  return (
    <div>
      <span className="sr-only">Cargando proformas…</span>
      {[46, 38, 52, 34, 44].map((width) => (
        <div key={width} className="flex h-14 items-center gap-4 border-b px-5 last:border-b-0">
          <Skeleton className="h-3 w-12 rounded-md" />
          <Skeleton className="h-3 rounded-md" style={{ width: `${width}%` }} />
          <Skeleton className="ml-auto h-3.5 w-20 rounded-md" />
        </div>
      ))}
    </div>
  )
}

// «Vencida» cuando la validez ya pasó; el último día todavía vale (plan, decisión 21).
function ValidUntil({ row, today }: { row: ProformaRow; today: string }) {
  const expired = row.valid_until < today
  return (
    <span className={cn('tabular-nums', expired && 'text-amber-800')}>
      {formatDay(row.valid_until)}
      {expired ? <span className="block text-[11px] font-semibold">Vencida</span> : null}
    </span>
  )
}

function ClientButton({
  row,
  onClient,
  className,
}: {
  row: ProformaRow
  onClient: RowActions['onClient']
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={`Ver las proformas de ${row.client_name}`}
      title="Ver todas sus proformas"
      className={cn(
        'max-w-full cursor-pointer truncate text-left font-semibold decoration-primary decoration-2 underline-offset-3 hover:underline',
        className,
      )}
      onClick={() => onClient(row)}
    >
      {row.client_name}
    </button>
  )
}

function RowButtons({ row, onView, onDownload, pendingId }: RowActions & { row: ProformaRow }) {
  const label = formatProformaNumber(row.number)
  const busy = pendingId === row.id
  return (
    <div className="inline-flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Ver PDF de la proforma ${label}`}
        title="Ver PDF"
        disabled={busy}
        onClick={() => onView(row)}
      >
        <Eye aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Descargar PDF de la proforma ${label}`}
        title="Descargar PDF"
        disabled={busy}
        onClick={() => onDownload(row)}
      >
        <Download aria-hidden />
      </Button>
    </div>
  )
}

// PC: ordenada por número, de la más reciente a la más antigua (spec §4.2).
function HistoryTable({
  items,
  today,
  ...actions
}: RowActions & { items: ProformaRow[]; today: string }) {
  const th =
    'h-11 border-b bg-background/60 px-3 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase'
  return (
    <table className="hidden w-full table-fixed border-collapse text-left text-sm md:table">
      <caption className="sr-only">Proformas guardadas</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(th, 'w-20 pl-5')}>
            N°
          </th>
          <th scope="col" className={cn(th, 'w-26')}>
            Fecha
          </th>
          <th scope="col" className={th}>
            Cliente
          </th>
          <th scope="col" className={cn(th, 'w-32')}>
            RUC/DNI
          </th>
          <th scope="col" className={cn(th, 'w-24 text-right')}>
            Productos
          </th>
          <th scope="col" className={cn(th, 'w-34 text-right')}>
            Total
          </th>
          <th scope="col" className={cn(th, 'w-26')}>
            Vence
          </th>
          <th scope="col" className={cn(th, 'w-44 pr-5 text-right')}>
            Acciones
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((row) => (
          <tr key={row.id} className="border-b last:border-b-0 hover:bg-background/40">
            <td className="py-3 pl-5 font-mono text-[13px] font-bold">{shortNumber(row.number)}</td>
            <td className="px-3 py-3 tabular-nums">{formatDate(row.issued_at)}</td>
            <td className="px-3 py-3">
              <ClientButton row={row} onClient={actions.onClient} className="block" />
            </td>
            <td className="px-3 py-3 tabular-nums">{row.client_document || '—'}</td>
            <td className="px-3 py-3 text-right tabular-nums">{row.item_count}</td>
            <td className="px-3 py-3 text-right font-bold whitespace-nowrap tabular-nums">
              S/ {formatPrice(row.total)}
            </td>
            <td className="px-3 py-3">
              <ValidUntil row={row} today={today} />
            </td>
            <td className="py-3 pr-5 pl-2 text-right">
              <RowButtons row={row} {...actions} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Móvil: tarjetas con número, fecha, cliente, documento y total (spec §4.2).
function HistoryCards({
  items,
  today,
  onDownload,
  onClient,
  pendingId,
}: RowActions & { items: ProformaRow[]; today: string }) {
  return (
    <ul className="md:hidden">
      {items.map((row) => (
        <li key={row.id} className="grid gap-2.5 border-t px-4 py-3.5 first:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <div className="grid min-w-0">
              <span className="font-mono text-xs font-bold text-muted-foreground">
                {formatProformaNumber(row.number)} · {formatDate(row.issued_at)}
                {row.valid_until < today ? (
                  <span className="ml-1.5 font-sans text-amber-800">· Vencida</span>
                ) : null}
              </span>
              <ClientButton row={row} onClient={onClient} />
              {row.client_document ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {row.client_document}
                </span>
              ) : null}
            </div>
            <span className="font-bold whitespace-nowrap tabular-nums">
              S/ {formatPrice(row.total)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={`Descargar PDF de la proforma ${formatProformaNumber(row.number)}`}
              disabled={pendingId === row.id}
              onClick={() => onDownload(row)}
            >
              <Download aria-hidden />
              Descargar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: Mostrar el historial en la pantalla**

`src/features/proforma/history/components/proformas-screen.tsx`, completo (conserva la barra y la pregunta de la tarea 5):

```tsx
'use client'

import { CircleAlert, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { limaDay } from '@/features/catalog/list-options'
import { ProformaBar } from '../../components/proforma-bar'
import { ProformaDialog } from '../../components/proforma-dialog'
import { EMPTY_DRAFT } from '../../draft'
import { formatCents } from '../../money'
import { ProformaProvider, useProforma } from '../../store'
import { totalsFromText } from '../../totals'
import { useHistoryFilters, useProformaHistory, useStoredDocument } from '../hooks'
import { HISTORY_PAGE_SIZE } from '../queries'
import { HistoryFilters } from './history-filters'
import { HistoryLoading, HistoryResults } from './history-results'
import { NewProformaPrompt } from './new-proforma-prompt'

// Proformas (spec de productos libres §4.2): el historial para buscar, descargar y reenviar, y
// «Nueva proforma» sin pasar por el catálogo.
export function ProformasScreen() {
  return (
    <ProformaProvider>
      <ProformasContent />
    </ProformaProvider>
  )
}

function ProformasContent() {
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const { draft, update } = useProforma()
  const { filters, query } = useProformaHistory()
  const [, setFilters] = useHistoryFilters()
  const documents = useStoredDocument()
  // Como «hoy» en la proforma: se fija al montar. Marca las vencidas.
  const [today] = useState(() => limaDay(new Date()))
  const listRef = useRef<HTMLElement>(null)
  const data = query.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / HISTORY_PAGE_SIZE)) : 1
  const products = draft.lines.length
  const totals = totalsFromText(draft)

  // Si la página pedida ya no existe (por ejemplo, la URL de un enlace viejo), se muestra la última.
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && filters.page > totalPages) {
      void setFilters({ page: totalPages === 1 ? null : totalPages })
    }
  }, [data, filters.page, totalPages, setFilters])

  function openEmpty() {
    update(() => EMPTY_DRAFT)
    setOpen(true)
  }

  // «Nueva proforma» empieza una vacía. Una ya generada está guardada y se reemplaza; una sin
  // generar no se borra sin preguntar (plan, decisión 4).
  function startNew() {
    if (draft.number === null && products > 0) setAsking(true)
    else openEmpty()
  }

  // Con los botones de abajo, la página nueva se lee desde el principio, como en Productos.
  function goToPage(page: number) {
    void setFilters({ page: page === 1 ? null : page })
    const list = listRef.current
    if (list && list.getBoundingClientRect().top < 0) list.scrollIntoView({ block: 'start' })
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
              Proformas
            </h1>
            {data ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{data.all}</span>{' '}
                {data.all === 1 ? 'proforma' : 'proformas'} ·{' '}
                <span className="font-semibold text-foreground">{data.thisMonth}</span> este mes
              </p>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            Todas las proformas generadas. Búscalas por cliente o fecha y reenvíalas cuando el
            cliente las pierda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={startNew}>
            <Plus aria-hidden />
            Nueva proforma
          </Button>
        </div>
      </div>

      <section
        ref={listRef}
        aria-label="Historial de proformas"
        aria-busy={query.isPending}
        className="min-w-0 scroll-mt-16 overflow-clip rounded-[14px] border bg-card shadow-xs lg:scroll-mt-0"
      >
        <HistoryFilters />
        {query.isPending ? (
          <HistoryLoading />
        ) : query.isError || !data ? (
          <EmptyState
            tone="error"
            icon={<CircleAlert className="size-6" aria-hidden />}
            title="No pudimos cargar las proformas"
            text="Revisa tu conexión a internet e inténtalo de nuevo. Tus proformas no se han perdido."
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                <RefreshCw aria-hidden />
                Reintentar
              </Button>
            }
          />
        ) : (
          <HistoryResults
            page={Math.min(filters.page, totalPages)}
            data={data}
            today={today}
            updating={query.isPlaceholderData}
            onPage={goToPage}
            onClear={() =>
              void setFilters({ search: null, date: null, from: null, to: null, page: null })
            }
            onNew={startNew}
            onClient={(row) =>
              void setFilters({
                search: row.client_document || row.client_name,
                date: null,
                from: null,
                to: null,
                page: null,
              })
            }
            onView={(row) => void documents.view(row)}
            onDownload={(row) => void documents.download(row)}
            pendingId={documents.pending}
          />
        )}
      </section>

      <ProformaBar onComplete={() => setOpen(true)} />
      <ProformaDialog open={open} onClose={() => setOpen(false)} />
      <NewProformaPrompt
        open={asking}
        summary={`${products} ${products === 1 ? 'producto' : 'productos'} · S/ ${totals ? formatCents(totals.total) : '—'}`}
        onKeep={() => setOpen(true)}
        onStartNew={() => {
          setAsking(false)
          openEmpty()
        }}
        onClose={() => setAsking(false)}
      />
    </div>
  )
}
```

- [ ] **Step 6: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components tests/components/proforma-history.test.tsx && pnpm exec vitest run --project integration tests/integration/proforma-history-sql.test.ts && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS en todo; sin errores de tipos ni de lint.

- [ ] **Step 7: Commit**

```bash
git add src/features/proforma/history/queries.ts src/features/proforma/history/search-params.ts src/features/proforma/history/hooks.ts src/features/proforma/history/components/history-filters.tsx src/features/proforma/history/components/history-results.tsx src/features/proforma/history/components/proformas-screen.tsx src/features/proforma/components/proforma-dialog.tsx src/features/catalog/products/hooks.ts tests/components/proforma-history.test.tsx tests/integration/proforma-history-sql.test.ts
git commit -m "feat: browse the proforma history with search, dates and pages"
```

---

### Task 11: «Descargar Excel» del historial

**Files:**
- Create:
  - `src/lib/request-url.ts`
  - `src/features/proforma/history/export-request.ts`
  - `src/features/proforma/history/excel.ts`
  - `src/features/proforma/history/components/history-excel-button.tsx`
  - `tests/unit/proforma-history-excel.test.ts`
- Modify:
  - `src/features/catalog/excel/theme.ts`
  - `src/features/catalog/excel/report.ts`
  - `src/features/catalog/products/excel-actions.ts`
  - `src/features/proforma/history/queries.ts`
  - `src/features/proforma/history/actions.ts`
  - `src/features/proforma/history/components/proformas-screen.tsx`
- Test: `tests/unit/proforma-history-excel.test.ts`, `tests/unit/catalog-excel-report.test.ts` (sin cambios: protege el refactor)

**Interfaces:**
- Consumes: `export_proformas` (tarea 7); `historyArgs`, `ProformaRow` (tarea 10); `labelDateRange`, `describeDateRange` (tarea 6).
- Produces:
  - en `excel/theme.ts`: `REPORT_TABLE_ROW = 8`, `readReportLogo()`, `spaced(count)`, `ReportHeader` y `writeReportHeader(workbook, sheet, header)`; `report.ts` reexporta `REPORT_TABLE_ROW`;
  - `appUrl(pathAndQuery)` en `src/lib/request-url.ts`;
  - en `history/export-request.ts`: `historyFiltersSchema`, `HistoryExportFilters`, `describeHistoryFilters`, `historyFileName`, `historyViewPath`;
  - `exportProformaRows(supabase, query, maxRows)` en `history/queries.ts`;
  - `buildProformasReport(input)` en `history/excel.ts`;
  - la Server Action `exportProformas(filters)` → `ActionResult<ExcelFile>`;
  - `HistoryExcelButton({ filters, disabled })`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/proforma-history-excel.test.ts`:

```ts
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { REPORT_TABLE_ROW } from '@/features/catalog/excel/theme'
import { buildProformasReport } from '@/features/proforma/history/excel'
import {
  describeHistoryFilters,
  historyFileName,
  historyFiltersSchema,
  historyViewPath,
} from '@/features/proforma/history/export-request'
import type { ProformaRow } from '@/features/proforma/history/queries'

const row = (number: number, overrides: Partial<ProformaRow> = {}): ProformaRow => ({
  id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
  number,
  // 03:00 UTC del 3 de octubre = 2 de octubre en Lima.
  issued_at: '2026-10-03T03:00:00Z',
  valid_until: '2026-10-09',
  client_name: 'Inversiones Nuevo Sol S.A.C.',
  client_document: '20601234567',
  client_phone: '987 654 321',
  item_count: 3,
  total: '7960.00',
  ...overrides,
})

const input = {
  rows: [row(42), row(41, { client_name: '=HIPERVINCULO("x")', total: '350.50' })],
  companyName: 'Ventronix',
  logo: null,
  generatedAt: new Date('2026-10-06T19:35:00Z'),
  filtersText: 'Búsqueda: perez',
  viewUrl: 'https://ventronix-catalogo.vercel.app/proformas?search=perez',
  truncatedAt: null,
}

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer).buffer)
  return workbook.getWorksheet('Proformas')!
}

describe('buildProformasReport', () => {
  it('arma la cabecera, las columnas de cada proforma y la suma del periodo debajo', async () => {
    const sheet = await load(await buildProformasReport(input))
    expect(sheet.getCell('C1').value).toBe('Ventronix')
    expect(sheet.getCell('C2').value).toBe('Reporte de proformas')
    expect(sheet.getCell('C3').value).toBe('Generado el 06/10/2026 a las 14:35 (hora de Lima)')
    expect(sheet.getCell('C4').value).toBe('Búsqueda: perez')
    expect(sheet.getCell('C5').value).toBe('2 proformas')
    expect((sheet.getRow(REPORT_TABLE_ROW).values as unknown[]).slice(1)).toEqual([
      'N°',
      'Fecha',
      'Cliente',
      'RUC/DNI',
      'Celular',
      'Productos',
      'Total',
      'Vence',
    ])
    const first = sheet.getRow(REPORT_TABLE_ROW + 1)
    expect(first.getCell(1).value).toBe(42)
    expect(first.getCell(1).numFmt).toBe('0000')
    expect(first.getCell(2).value).toEqual(new Date('2026-10-02T00:00:00.000Z'))
    expect(first.getCell(7).value).toBe(7960)
    expect(first.getCell(8).value).toEqual(new Date('2026-10-09T00:00:00.000Z'))
    expect(sheet.getRow(REPORT_TABLE_ROW + 2).getCell(3).value).toBe('=HIPERVINCULO("x")')
    const total = sheet.getRow(REPORT_TABLE_ROW + 4)
    expect(total.getCell(3).value).toBe('Total del periodo')
    expect(total.getCell(7).value).toBe(8310.5)
  })

  it('avisa si se recortó en el tope', async () => {
    const sheet = await load(await buildProformasReport({ ...input, truncatedAt: 10_000 }))
    expect(sheet.getCell('C7').value).toBe('Este reporte muestra las primeras 10 000 proformas.')
  })
})

describe('filtros del Excel', () => {
  const parse = (value: object) =>
    historyFiltersSchema.parse({ search: '', date: null, from: null, to: null, ...value })
  const now = new Date('2026-10-06T15:00:00Z')

  it('describe los filtros, nombra el archivo con ellos y arma el enlace a la vista', () => {
    expect(describeHistoryFilters(parse({}))).toBe('Sin filtros')
    expect(describeHistoryFilters(parse({ search: ' Pérez ', date: 'month' }))).toBe(
      'Búsqueda: Pérez · Fecha: este mes',
    )
    expect(historyFileName(parse({}), now)).toBe('proformas-2026-10-06.xlsx')
    expect(historyFileName(parse({ search: 'Pérez', date: 'month' }), now)).toBe(
      'proformas-perez-este-mes-2026-10-06.xlsx',
    )
    expect(
      historyViewPath(parse({ search: 'perez', date: 'custom', from: '2026-10-01', to: '2026-10-05' })),
    ).toBe('/proformas?search=perez&date=custom&from=2026-10-01&to=2026-10-05')
    expect(historyViewPath(parse({}))).toBe('/proformas')
  })

  it('rechaza fechas que no existen', () => {
    expect(
      historyFiltersSchema.safeParse({ search: '', date: 'custom', from: '2026-02-30', to: null })
        .success,
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/proforma-history-excel.test.ts`
Expected: FAIL al importar: `history/excel` y `history/export-request` no existen y `theme.ts` no exporta `REPORT_TABLE_ROW`.

- [ ] **Step 3: Compartir la cabecera de los reportes**

`src/features/catalog/excel/theme.ts`: cambia la importación de tipos de ExcelJS por `import type { CellValue, Font, Row, Workbook, Worksheet } from 'exceljs'`, añade al principio:

```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { format } from 'date-fns'
import { formatDate, lima } from '@/lib/dates'
```

y al final:

```ts
// La tabla de los reportes empieza aquí: arriba van el logotipo y la cabecera (spec del Excel §5.2).
export const REPORT_TABLE_ROW = 8

// Se incluye en las funciones de /products, /products/import y /proformas (next.config.ts).
const REPORT_LOGO = path.join(process.cwd(), 'public/brand/ventronix-logo-proforma.jpg')
export const readReportLogo = () => readFile(REPORT_LOGO).catch(() => null)

// 10000 → «10 000», como en los textos de la spec.
export const spaced = (count: number) => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export type ReportHeader = {
  logo: Buffer | null
  companyName: string
  title: string
  generatedAt: Date
  filtersText: string
  countText: string
  viewUrl: string | null
  truncatedText: string | null
}

// Cabecera de los reportes (spec del Excel §5.2): empresa, título, fecha y hora de Lima, filtros,
// cuántas filas, el enlace a la misma vista y, si se recortó, el aviso.
export function writeReportHeader(workbook: Workbook, sheet: Worksheet, header: ReportHeader) {
  addLogo(workbook, sheet, header.logo)
  const put = (address: string, value: CellValue, font: Partial<Font>) => {
    const cell = sheet.getCell(address)
    cell.value = value
    cell.font = { name: FONT, ...font }
  }
  const muted = { size: 10, color: { argb: COLORS.muted } }
  put('C1', header.companyName, { size: 16, bold: true, color: { argb: COLORS.ink } })
  put('C2', header.title, { size: 13, bold: true, color: { argb: COLORS.link } })
  put(
    'C3',
    `Generado el ${formatDate(header.generatedAt)} a las ${format(header.generatedAt, 'HH:mm', { in: lima })} (hora de Lima)`,
    muted,
  )
  put('C4', header.filtersText, muted)
  put('C5', header.countText, { size: 11, bold: true, color: { argb: COLORS.ink } })
  if (header.viewUrl) {
    put(
      'C6',
      { text: 'Abrir esta vista en la app', hyperlink: header.viewUrl },
      { size: 10, underline: true, color: { argb: COLORS.link } },
    )
  }
  if (header.truncatedText) {
    put('C7', header.truncatedText, { size: 10, bold: true, color: { argb: COLORS.warning } })
  }
}
```

`src/features/catalog/excel/report.ts`:
- borra `REPORT_TABLE_ROW`, `spaced` y `writeHeader`, y las importaciones que dejan de usarse (`format` de date-fns, `formatDate` y `lima`, y `addLogo`);
- importa `REPORT_TABLE_ROW`, `spaced` y `writeReportHeader` desde `./theme`;
- añade `export { REPORT_TABLE_ROW }`, para quien ya lo importa de aquí;
- en `buildProductsReport`, cambia `writeHeader(workbook, sheet, input)` por:

```ts
  const count = input.rows.length
  writeReportHeader(workbook, sheet, {
    logo: input.logo,
    companyName: input.companyName ?? 'Catálogo de productos',
    title: 'Reporte de productos',
    generatedAt: input.generatedAt,
    filtersText: input.filtersText,
    countText: `${spaced(count)} ${count === 1 ? 'producto' : 'productos'}`,
    viewUrl: input.viewUrl,
    truncatedText:
      input.truncatedAt === null
        ? null
        : `Este reporte muestra los primeros ${spaced(input.truncatedAt)} productos.`,
  })
```

`src/lib/request-url.ts`:

```ts
import 'server-only'
import { headers } from 'next/headers'

// Dirección de la app para «Abrir esta vista en la app», tomada de la petición (spec del Excel §5.2).
export async function appUrl(pathAndQuery: string) {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host')
  if (!host) return null
  const protocol =
    list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}${pathAndQuery}`
}
```

`src/features/catalog/products/excel-actions.ts`:
- borra `LOGO`, `viewUrl` y las importaciones de `readFile`, `path` y `headers`;
- importa `appUrl` desde `@/lib/request-url` y `readReportLogo` desde `../excel/theme`;
- `readFile(LOGO).catch(() => null)` pasa a `readReportLogo()`;
- `await viewUrl(exportViewPath(parsed.data))` pasa a `await appUrl(exportViewPath(parsed.data))`.

- [ ] **Step 4: Escribir los filtros, el reporte y la acción del historial**

`src/features/proforma/history/export-request.ts`:

```ts
import { z } from 'zod'
import { fileSlug } from '@/features/catalog/excel/export-request'
import {
  DATE_PRESETS,
  describeDateRange,
  isIsoDay,
  labelDateRange,
  limaDay,
} from '@/features/catalog/list-options'
import { normalizeSearch, SEARCH_MAX_LENGTH } from '@/features/catalog/search-pattern'

const day = z.string().refine(isIsoDay, 'Fecha no válida').nullable()

// Los filtros de la URL, sin la página. Llegan del navegador: el servidor los valida.
export const historyFiltersSchema = z.object({
  search: z
    .string()
    .max(SEARCH_MAX_LENGTH * 4)
    .transform(normalizeSearch),
  date: z.enum(DATE_PRESETS).nullable(),
  from: day,
  to: day,
})
export type HistoryExportFilters = z.input<typeof historyFiltersSchema>
type ParsedFilters = z.output<typeof historyFiltersSchema>

// «Búsqueda: perez · Fecha: este mes», o «Sin filtros».
export function describeHistoryFilters(filters: ParsedFilters) {
  const parts = [
    filters.search ? `Búsqueda: ${filters.search}` : null,
    labelDateRange('Fecha', filters),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Sin filtros'
}

// El nombre lleva el filtro, como en Productos: «proformas-perez-este-mes-2026-10-06.xlsx».
export function historyFileName(filters: ParsedFilters, now: Date) {
  const slug = fileSlug([filters.search, describeDateRange(filters)].filter(Boolean).join(' '))
  return slug ? `proformas-${slug}-${limaDay(now)}.xlsx` : `proformas-${limaDay(now)}.xlsx`
}

// La misma vista en la app (spec del Excel §5.2), sin los valores por defecto.
export function historyViewPath(filters: ParsedFilters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('search', filters.search)
  if (filters.date) params.set('date', filters.date)
  if (filters.date === 'custom' && filters.from) params.set('from', filters.from)
  if (filters.date === 'custom' && filters.to) params.set('to', filters.to)
  const query = params.toString()
  return query ? `/proformas?${query}` : '/proformas'
}
```

`src/features/proforma/history/queries.ts`, al final:

```ts
// Todo lo filtrado para el Excel (spec §6). Quien llama pide una de más para saber si hubo recorte.
export async function exportProformaRows(
  supabase: Client,
  query: Omit<HistoryQuery, 'page'>,
  maxRows: number,
): Promise<ProformaRow[]> {
  const { data, error } = await supabase.rpc('export_proformas', {
    ...historyArgs(query),
    max_rows: maxRows,
  })
  if (error) throw error
  return z.array(rowSchema).parse(data)
}
```

`src/features/proforma/history/excel.ts`:

```ts
import 'server-only'
import ExcelJS from 'exceljs'
import {
  COLORS,
  DATE_FORMAT,
  excelDay,
  FONT,
  MONEY_FORMAT,
  REPORT_TABLE_ROW,
  spaced,
  styleBodyRow,
  styleHeaderRow,
  writeReportHeader,
} from '@/features/catalog/excel/theme'
import { limaDay } from '@/features/catalog/list-options'
import { centsToDecimal, parseCents, ZERO } from '../money'
import type { ProformaRow } from './queries'

export type HistoryReportInput = {
  rows: ProformaRow[]
  companyName: string | null
  logo: Buffer | null
  generatedAt: Date
  filtersText: string
  viewUrl: string | null
  truncatedAt: number | null
}

const HEADERS = ['N°', 'Fecha', 'Cliente', 'RUC/DNI', 'Celular', 'Productos', 'Total', 'Vence']

// Excel del historial (spec de productos libres §6): lo filtrado, de la más reciente a la más
// antigua, y debajo la suma del periodo. Los textos van como texto, nunca como fórmula.
export async function buildProformasReport(input: HistoryReportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  workbook.created = input.generatedAt
  const sheet = workbook.addWorksheet('Proformas', {
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
  sheet.columns = [8, 12, 44, 14, 14, 11, 16, 12].map((width) => ({ width }))
  const count = input.rows.length
  writeReportHeader(workbook, sheet, {
    logo: input.logo,
    companyName: input.companyName ?? 'Proformas',
    title: 'Reporte de proformas',
    generatedAt: input.generatedAt,
    filtersText: input.filtersText,
    countText: `${spaced(count)} ${count === 1 ? 'proforma' : 'proformas'}`,
    viewUrl: input.viewUrl,
    truncatedText:
      input.truncatedAt === null
        ? null
        : `Este reporte muestra las primeras ${spaced(input.truncatedAt)} proformas.`,
  })

  const header = sheet.getRow(REPORT_TABLE_ROW)
  header.values = HEADERS
  styleHeaderRow(header)
  input.rows.forEach((proforma, index) => {
    const row = sheet.getRow(REPORT_TABLE_ROW + 1 + index)
    row.values = [
      proforma.number,
      excelDay(limaDay(new Date(proforma.issued_at))),
      proforma.client_name,
      proforma.client_document,
      proforma.client_phone,
      proforma.item_count,
      Number(proforma.total),
      excelDay(proforma.valid_until),
    ]
    styleBodyRow(row, index)
    row.getCell(1).numFmt = '0000'
    row.getCell(2).numFmt = DATE_FORMAT
    row.getCell(7).numFmt = MONEY_FORMAT
    row.getCell(8).numFmt = DATE_FORMAT
  })
  sheet.autoFilter = {
    from: { row: REPORT_TABLE_ROW, column: 1 },
    to: { row: REPORT_TABLE_ROW, column: HEADERS.length },
  }

  // La suma del periodo, en céntimos, con una fila en blanco antes: el filtro y el orden de Excel
  // no la mezclan con las proformas.
  const sum = input.rows.reduce((total, proforma) => total + (parseCents(proforma.total) ?? ZERO), ZERO)
  const totalRow = sheet.getRow(REPORT_TABLE_ROW + 2 + count)
  totalRow.getCell(3).value = 'Total del periodo'
  totalRow.getCell(7).value = Number(centsToDecimal(sum))
  totalRow.getCell(7).numFmt = MONEY_FORMAT
  totalRow.font = { name: FONT, bold: true, color: { argb: COLORS.ink } }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
```

`src/features/proforma/history/actions.ts`: añade a las importaciones:

```ts
import { failure } from '@/features/catalog/action-errors'
import { EXPORT_MAX_ROWS } from '@/features/catalog/excel/export-request'
import { readReportLogo } from '@/features/catalog/excel/theme'
import { resolveDateRange } from '@/features/catalog/list-options'
import type { ExcelFile } from '@/features/catalog/products/excel-actions'
import { getCompanyProfile } from '@/features/company/queries'
import { appUrl } from '@/lib/request-url'
import {
  describeHistoryFilters,
  historyFileName,
  historyFiltersSchema,
  historyViewPath,
} from './export-request'
import { exportProformaRows } from './queries'
```

(`failure` va en la misma importación que `invalid`) y al final:

```ts
// «Descargar Excel» del historial (spec de productos libres §6): lo filtrado, de la más reciente a
// la más antigua, con el tope de Productos. ExcelJS se carga solo aquí, con import().
export async function exportProformas(filters: unknown): Promise<ActionResult<ExcelFile>> {
  return withOwner(async ({ supabase }) => {
    const parsed = historyFiltersSchema.safeParse(filters)
    if (!parsed.success) {
      return failure(
        'VALIDATION',
        'Los filtros de la lista no son válidos. Recarga la página e inténtalo de nuevo.',
      )
    }
    const now = new Date()
    const range = resolveDateRange(parsed.data, now)
    const rows = await exportProformaRows(
      supabase,
      { search: parsed.data.search, dateFrom: range?.from ?? null, dateTo: range?.to ?? null },
      EXPORT_MAX_ROWS + 1,
    )
    if (rows.length === 0) {
      return failure('VALIDATION', 'No hay proformas para descargar con estos filtros.')
    }
    const truncated = rows.length > EXPORT_MAX_ROWS
    const included = truncated ? rows.slice(0, EXPORT_MAX_ROWS) : rows
    const [company, logo, viewUrl] = await Promise.all([
      getCompanyProfile(supabase),
      readReportLogo(),
      appUrl(historyViewPath(parsed.data)),
    ])
    const { buildProformasReport } = await import('./excel')
    const buffer = await buildProformasReport({
      rows: included,
      companyName: company?.trade_name ?? company?.legal_name ?? null,
      logo,
      generatedAt: now,
      filtersText: describeHistoryFilters(parsed.data),
      viewUrl,
      truncatedAt: truncated ? EXPORT_MAX_ROWS : null,
    })
    return {
      ok: true,
      data: {
        base64: buffer.toString('base64'),
        fileName: historyFileName(parsed.data, now),
        count: included.length,
        truncated,
      },
    }
  })
}
```

`src/features/proforma/history/components/history-excel-button.tsx`:

```tsx
'use client'

import { FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { settle } from '@/lib/action-result'
import { base64ToFile, downloadFile, XLSX_MIME } from '@/lib/files'
import { exportProformas } from '../actions'
import type { HistoryExportFilters } from '../export-request'

// «Descargar Excel» (spec de productos libres §4.2 y §6): lo filtrado, como en Productos.
export function HistoryExcelButton({
  filters,
  disabled,
}: {
  filters: HistoryExportFilters
  disabled: boolean
}) {
  const [pending, setPending] = useState(false)

  async function download() {
    setPending(true)
    const result = await settle(exportProformas(filters))
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
        'Se descargaron las primeras 10 000 proformas. Usa los filtros para descargar el resto.',
      )
    } else {
      toast.success(`Excel descargado · ${count} ${count === 1 ? 'proforma' : 'proformas'}`)
    }
  }

  return (
    <Button variant="outline" disabled={disabled || pending} onClick={() => void download()}>
      {pending ? (
        <LoaderCircle className="animate-spin" aria-hidden />
      ) : (
        <FileSpreadsheet aria-hidden />
      )}
      {pending ? 'Preparando Excel…' : 'Descargar Excel'}
    </Button>
  )
}
```

`src/features/proforma/history/components/proformas-screen.tsx`: importa `HistoryExcelButton` y ponlo antes de «Nueva proforma»:

```tsx
          <HistoryExcelButton
            filters={{ search: filters.search, date: filters.date, from: filters.from, to: filters.to }}
            disabled={!data || data.total === 0}
          />
```

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/proforma-history-excel.test.ts tests/unit/catalog-excel-report.test.ts tests/unit/catalog-export-request.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS en las tres: el reporte de productos sale igual que antes del refactor.

- [ ] **Step 6: Commit**

```bash
git add src/lib/request-url.ts src/features/catalog/excel/theme.ts src/features/catalog/excel/report.ts src/features/catalog/products/excel-actions.ts src/features/proforma/history/export-request.ts src/features/proforma/history/excel.ts src/features/proforma/history/queries.ts src/features/proforma/history/actions.ts src/features/proforma/history/components/history-excel-button.tsx src/features/proforma/history/components/proformas-screen.tsx tests/unit/proforma-history-excel.test.ts
git commit -m "feat: download the filtered proforma history as Excel"
```

---

### Task 12: Ventana «Reenviar»

**Files:**
- Create:
  - `src/features/proforma/components/chat-blocked.tsx`
  - `src/features/proforma/history/components/resend-dialog.tsx`
  - `tests/components/resend-dialog.test.tsx`
- Modify:
  - `src/features/proforma/components/proforma-ready.tsx`
  - `src/features/proforma/history/components/history-results.tsx`
  - `src/features/proforma/history/components/proformas-screen.tsx`
- Test: `tests/components/resend-dialog.test.tsx`, `tests/components/proforma-history.test.tsx`, `tests/components/proforma-ready.test.tsx` (sin cambios: protege el refactor)

**Interfaces:**
- Consumes: `getProformaDocument`, `resendProforma`, `StoredDocument` (tarea 9); `ProformaRow` (tarea 10).
- Produces:
  - `toastChatBlocked(phone, message)`;
  - `ResendDialog({ row, today, onClose, loadDocument, resend? })`: `loadDocument(id)` → `Promise<StoredDocument>` (lanza el error) y comparte la consulta `historyKeys.document(id)` con «Ver PDF» y «Descargar PDF»; si la proforma venció, lo advierte;
  - `RowActions.onResend(row)` en `HistoryResults`.

- [ ] **Step 1: Escribir las pruebas**

`tests/components/resend-dialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ResendDialog,
  type ResendDialogProps,
} from '@/features/proforma/history/components/resend-dialog'
import type { ProformaRow } from '@/features/proforma/history/queries'
import type { StoredDocument } from '@/features/proforma/history/snapshot'
import type { ActionResult } from '@/lib/action-result'

const row: ProformaRow = {
  id: '00000000-0000-4000-8000-000000000042',
  number: 42,
  issued_at: '2026-10-02T15:00:00.000Z',
  valid_until: '2026-10-09',
  client_name: 'Inversiones Nuevo Sol S.A.C.',
  client_document: '20601234567',
  client_phone: '987654321',
  item_count: 3,
  total: '7960.00',
}

const stored: StoredDocument = {
  fileName: 'Proforma-0042-Inversiones-Nuevo-Sol-SAC.pdf',
  base64: btoa('%PDF-1.4 prueba'),
  message:
    'Hola, Inversiones Nuevo Sol S.A.C. Le envío la proforma N° 0042 por S/ 7,960.00, válida hasta el 09/10/2026. Quedamos atentos. — Ventronix',
}

function renderDialog(props: Partial<ResendDialogProps> = {}) {
  const loadDocument = vi.fn(async (): Promise<StoredDocument> => stored)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResendDialog
        row={row}
        today="2026-10-06"
        onClose={vi.fn()}
        loadDocument={loadDocument}
        {...props}
      />
      <Toaster />
    </QueryClientProvider>,
  )
  return { loadDocument, user: userEvent.setup() }
}

const sendButton = () => screen.getByRole('button', { name: 'Enviar por WhatsApp' })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:proforma')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('ResendDialog', () => {
  it('muestra la proforma, el celular editable y el mensaje que se enviará', async () => {
    const { loadDocument } = renderDialog()
    const dialog = within(screen.getByRole('dialog', { name: 'Reenviar proforma N° 0042' }))
    expect(
      dialog.getByText('Inversiones Nuevo Sol S.A.C. · S/ 7,960.00 · generada el 02/10/2026'),
    ).toBeVisible()
    expect(dialog.getByLabelText('Celular del cliente')).toHaveValue('987 654 321')
    expect(await dialog.findByText(stored.message)).toBeVisible()
    expect(
      dialog.getByText(
        'Se envía el mismo documento que se generó: mismos productos, precios, fotos y datos de la empresa de ese día.',
      ),
    ).toBeVisible()
    expect(loadDocument).toHaveBeenCalledWith(row.id)
  })

  it('con WhatsApp vinculado la reenvía al celular escrito', async () => {
    const resend = vi.fn(
      async (): Promise<ActionResult<{ phone: string }>> => ({
        ok: true,
        data: { phone: '911 222 333' },
      }),
    )
    const { user } = renderDialog({ resend })
    const phone = screen.getByLabelText('Celular del cliente')
    await user.clear(phone)
    await user.type(phone, '911 222 333')
    await vi.waitFor(() => expect(sendButton()).toBeEnabled())
    await user.click(sendButton())
    expect(resend).toHaveBeenCalledWith({ id: row.id, phone: '911 222 333' })
    expect(await screen.findByText('Enviada por WhatsApp al 911 222 333.')).toBeVisible()
  })

  it('sin WhatsApp vinculado descarga el PDF y abre el chat con el mensaje', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const { user } = renderDialog()
    await vi.waitFor(() => expect(sendButton()).toBeEnabled())
    await user.click(sendButton())
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/51987654321?text=${encodeURIComponent(stored.message)}`,
      '_blank',
    )
  })

  it('un celular que no es válido no deja enviar y lo explica', async () => {
    const { user } = renderDialog()
    const phone = screen.getByLabelText('Celular del cliente')
    await user.clear(phone)
    await user.type(phone, '12345')
    expect(screen.getByText('Escribe un celular de 9 dígitos que empiece por 9.')).toBeVisible()
    expect(sendButton()).toBeDisabled()
  })

  it('si no se puede preparar el PDF, lo dice y deja reintentar', async () => {
    const loadDocument = vi
      .fn<(id: string) => Promise<StoredDocument>>()
      .mockRejectedValueOnce(new Error('No encontramos esa proforma. Actualiza la lista.'))
      .mockResolvedValueOnce(stored)
    const { user } = renderDialog({ loadDocument })
    expect(await screen.findByText(/No encontramos esa proforma/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(stored.message)).toBeVisible()
  })

  it('si ya venció, lo advierte antes de reenviarla', () => {
    renderDialog({ today: '2026-10-10' })
    expect(
      screen.getByText(
        'Venció el 09/10/2026. Si los precios cambiaron, genera una proforma nueva antes de enviarla.',
      ),
    ).toBeVisible()
  })
})
```

`tests/components/proforma-history.test.tsx`: en `renderResults`, añade `onResend: vi.fn()` a `handlers` y añade la prueba:

```tsx
  it('«Reenviar» abre la ventana de esa proforma', async () => {
    const { onResend, user } = renderResults()
    const table = within(screen.getByRole('table'))
    await user.click(table.getByRole('button', { name: 'Reenviar la proforma N° 0042' }))
    expect(onResend).toHaveBeenCalledWith(expect.objectContaining({ number: 42 }))
  })
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project components tests/components/resend-dialog.test.tsx tests/components/proforma-history.test.tsx`
Expected: FAIL: `resend-dialog` no existe y no hay botón «Reenviar».

- [ ] **Step 3: Compartir el aviso de pestaña bloqueada**

`src/features/proforma/components/chat-blocked.tsx`:

```tsx
'use client'

import { toast } from 'sonner'
import { whatsappLink } from '../document/format'

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3'

// El navegador no dejó abrir la pestaña del chat; un enlace sí se abre al pulsarlo.
export function toastChatBlocked(phone: string, message: string) {
  toast('Tu navegador bloqueó la pestaña de WhatsApp.', {
    duration: 10_000,
    action: (
      <a
        href={whatsappLink(phone, message)}
        target="_blank"
        rel="noopener noreferrer"
        className={`ml-auto shrink-0 ${inlineAction}`}
      >
        Abrir el chat
      </a>
    ),
  })
}
```

`src/features/proforma/components/proforma-ready.tsx`: `openChat` pasa a:

```tsx
  async function openChat(pdf: File) {
    if (!(await shareOnWhatsApp(pdf, message, draft.client.phone))) {
      toastChatBlocked(draft.client.phone, message)
    }
  }
```

e importa `toastChatBlocked` desde `./chat-blocked`; quita `whatsappLink` de la importación de `../document/format`.

- [ ] **Step 4: Escribir la ventana «Reenviar»**

`src/features/proforma/history/components/resend-dialog.tsx`:

```tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { CheckCheck, Download, Info, MessageCircle, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDay } from '@/features/catalog/list-options'
import { formatPrice } from '@/features/catalog/money'
import { formatMobile } from '@/features/company/format'
import type { ActionResult } from '@/lib/action-result'
import { formatDate } from '@/lib/dates'
import { digitsOnly, isValidMobile } from '@/lib/peru'
import { cn } from '@/lib/utils'
import { useReturnFocus } from '@/lib/use-return-focus'
import { toastChatBlocked } from '../../components/chat-blocked'
import { base64ToFile, downloadFile, shareOnWhatsApp } from '../../document/files'
import { formatProformaNumber } from '../../number'
import { DOCUMENT_STALE_MS, historyKeys } from '../hooks'
import type { ProformaRow } from '../queries'
import type { StoredDocument } from '../snapshot'

type Delivery =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; phone: string }
  | { kind: 'failed'; message: string; fallback: boolean }

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3'

export type ResendDialogProps = {
  row: ProformaRow | null
  // Hoy en Lima (AAAA-MM-DD), para advertir si ya venció.
  today: string
  onClose: () => void
  // El PDF y el mensaje de la copia; lanza el error del servidor (fetchStoredDocument).
  loadDocument: (id: string) => Promise<StoredDocument>
  // Con el WhatsApp de la empresa vinculado se envía solo; si no, se abre el chat (spec §4.4).
  resend?: (input: { id: string; phone: string }) => Promise<ActionResult<{ phone: string }>>
}

// «Reenviar proforma N° 0042» (spec de productos libres §4.4).
export function ResendDialog({ row, onClose, ...props }: ResendDialogProps) {
  // La última proforma se conserva para que la ventana no se vacíe mientras se cierra.
  const [shown, setShown] = useState(row)
  if (row !== null && row !== shown) setShown(row)
  const data = row ?? shown
  const returnFocus = useReturnFocus(row !== null)

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        {...returnFocus}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        {data ? <ResendContent key={data.id} row={data} onClose={onClose} {...props} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function ResendContent({
  row,
  today,
  onClose,
  loadDocument,
  resend,
}: Omit<ResendDialogProps, 'row'> & { row: ProformaRow }) {
  // El celular de la proforma, editable solo para este envío.
  const [phone, setPhone] = useState(() => {
    const digits = digitsOnly(row.client_phone)
    return digits.length === 9 ? formatMobile(digits) : row.client_phone
  })
  const [delivery, setDelivery] = useState<Delivery>({ kind: 'idle' })
  // El PDF y el mensaje se preparan al abrir: descargar y abrir el chat son inmediatos y el
  // navegador no bloquea la pestaña. Es la misma consulta de «Ver PDF» (plan, decisión 22).
  const pdf = useQuery({
    queryKey: historyKeys.document(row.id),
    queryFn: () => loadDocument(row.id),
    staleTime: DOCUMENT_STALE_MS,
    retry: false,
  })
  const ready = useMemo(
    () =>
      pdf.data && {
        message: pdf.data.message,
        file: base64ToFile(pdf.data.base64, pdf.data.fileName),
      },
    [pdf.data],
  )
  const phoneOk = isValidMobile(digitsOnly(phone))

  async function openChat() {
    if (!ready) return
    if (!(await shareOnWhatsApp(ready.file, ready.message, phone))) {
      toastChatBlocked(phone, ready.message)
    }
  }

  async function send() {
    if (!resend) return openChat()
    setDelivery({ kind: 'sending' })
    const result = await resend({ id: row.id, phone })
    setDelivery(
      result.ok
        ? { kind: 'sent', phone: result.data.phone }
        : {
            kind: 'failed',
            message: result.error.message,
            // Si el cliente no tiene WhatsApp, abrir el chat tampoco sirve.
            fallback: result.error.code !== 'VALIDATION',
          },
    )
  }

  return (
    <>
      <DialogHeader className="gap-1 border-b px-6 pt-5 pr-14 pb-4">
        <DialogTitle className="text-lg font-bold">
          Reenviar proforma <span className="font-mono">{formatProformaNumber(row.number)}</span>
        </DialogTitle>
        <DialogDescription>
          {row.client_name} · S/ {formatPrice(row.total)} · generada el {formatDate(row.issued_at)}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 overflow-y-auto px-6 py-5">
        <div className="grid max-w-[260px] gap-1.5">
          <Label htmlFor="resend-phone" className="text-sm font-medium text-foreground">
            Celular del cliente
          </Label>
          <Input
            id="resend-phone"
            type="tel"
            inputMode="tel"
            maxLength={11}
            autoComplete="off"
            className="tabular-nums"
            value={phone}
            aria-invalid={phoneOk ? undefined : true}
            aria-describedby="resend-phone-hint"
            onChange={(event) => setPhone(event.target.value)}
          />
          <p
            id="resend-phone-hint"
            className={cn('text-xs', phoneOk ? 'text-muted-foreground' : 'font-medium text-destructive')}
          >
            {phoneOk
              ? 'Solo para este envío: la proforma no cambia.'
              : 'Escribe un celular de 9 dígitos que empiece por 9.'}
          </p>
        </div>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-foreground">Mensaje</span>
          {pdf.isError ? (
            <p role="alert" className="text-xs text-destructive">
              No pudimos preparar el PDF. {pdf.error.message}{' '}
              <button type="button" className={inlineAction} onClick={() => void pdf.refetch()}>
                Reintentar
              </button>
            </p>
          ) : (
            <p className="rounded-[10px] bg-muted px-3 py-3 text-sm leading-normal whitespace-pre-line [overflow-wrap:anywhere]">
              {ready ? ready.message : 'Preparando el PDF…'}
            </p>
          )}
        </div>

        <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-ring" aria-hidden />
          Se envía el mismo documento que se generó: mismos productos, precios, fotos y datos de la
          empresa de ese día.
        </p>

        {row.valid_until < today ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            Venció el {formatDay(row.valid_until)}. Si los precios cambiaron, genera una proforma
            nueva antes de enviarla.
          </p>
        ) : null}

        {delivery.kind === 'sending' ? (
          <p role="status" className="text-xs text-muted-foreground">
            Enviando por WhatsApp…
          </p>
        ) : delivery.kind === 'sent' ? (
          <p role="status" className="inline-flex items-center gap-1.5 text-xs text-ring">
            <CheckCheck className="size-4" aria-hidden />
            Enviada por WhatsApp al {delivery.phone}.
          </p>
        ) : delivery.kind === 'failed' ? (
          <p role="alert" className="text-xs text-destructive">
            {delivery.message}{' '}
            {delivery.fallback && ready ? (
              <button type="button" className={inlineAction} onClick={() => void openChat()}>
                Abrir el chat
              </button>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t bg-background/60 px-6 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="outline" disabled={!ready} onClick={() => ready && downloadFile(ready.file)}>
          <Download aria-hidden />
          Descargar PDF
        </Button>
        <Button
          disabled={!ready || !phoneOk || delivery.kind === 'sending'}
          onClick={() => void send()}
        >
          <MessageCircle aria-hidden />
          {delivery.kind === 'sending' ? 'Enviando…' : 'Enviar por WhatsApp'}
        </Button>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Añadir «Reenviar» a la lista y abrir la ventana**

`src/features/proforma/history/components/history-results.tsx`:
- añade `Send` a la importación de `lucide-react` y `onResend: (row: ProformaRow) => void` a `RowActions`;
- en `RowButtons`, después de «Descargar PDF»:

```tsx
      <Button
        variant="outline"
        size="sm"
        className="ml-1"
        aria-label={`Reenviar la proforma ${label}`}
        onClick={() => onResend(row)}
      >
        <Send aria-hidden />
        Reenviar
      </Button>
```

- `HistoryCards` recibe también `onResend` (`{ items, onDownload, onResend, pendingId }`) y, después de «Descargar»:

```tsx
            <Button
              size="sm"
              aria-label={`Reenviar la proforma ${formatProformaNumber(row.number)}`}
              onClick={() => onResend(row)}
            >
              <Send aria-hidden />
              Reenviar
            </Button>
```

`src/features/proforma/history/components/proformas-screen.tsx`:
- añade las importaciones, y `fetchStoredDocument` a la de `../hooks`:

```tsx
import { useWhatsAppLink, useWhatsAppStatus } from '@/features/whatsapp/hooks'
import { settle } from '@/lib/action-result'
import { resendProforma } from '../actions'
import type { ProformaRow } from '../queries'
import { ResendDialog } from './resend-dialog'
```

- en `ProformasContent`:

```tsx
  const [resending, setResending] = useState<ProformaRow | null>(null)
  // Se pide al entrar: al abrir «Reenviar» ya se sabe si se envía sola o por el chat.
  const whatsapp = useWhatsAppStatus()
  const { refresh } = useWhatsAppLink()
  // Con el WhatsApp de la empresa vinculado se reenvía sola. Si falla, el estado se vuelve a pedir:
  // el teléfono pudo cerrar la sesión.
  const resend =
    whatsapp.data?.configured && whatsapp.data.phone
      ? async (input: { id: string; phone: string }) => {
          const result = await settle(resendProforma(input))
          if (!result.ok) void refresh()
          return result
        }
      : undefined
```

- pasa `onResend={setResending}` a `HistoryResults`;
- después de `ProformaDialog`:

```tsx
      <ResendDialog
        row={resending}
        today={today}
        onClose={() => setResending(null)}
        loadDocument={fetchStoredDocument}
        resend={resend}
      />
```

- [ ] **Step 6: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components tests/components/resend-dialog.test.tsx tests/components/proforma-history.test.tsx tests/components/proforma-ready.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS en todo.

- [ ] **Step 7: Commit**

```bash
git add src/features/proforma/components/chat-blocked.tsx src/features/proforma/components/proforma-ready.tsx src/features/proforma/history/components/resend-dialog.tsx src/features/proforma/history/components/history-results.tsx src/features/proforma/history/components/proformas-screen.tsx tests/components/resend-dialog.test.tsx tests/components/proforma-history.test.tsx
git commit -m "feat: resend a saved proforma by WhatsApp from the history"
```

---

### Task 13: Datos del cliente desde el historial

**Files:**
- Modify:
  - `src/features/proforma/history/queries.ts`
  - `src/features/proforma/history/hooks.ts`
  - `src/features/proforma/components/proforma-client.tsx`
  - `src/features/proforma/components/proforma-editor.tsx`
  - `src/features/proforma/components/proforma-dialog.tsx`
- Test: `tests/components/proforma-editor.test.tsx`, `tests/components/proforma-panel.test.tsx`, `tests/integration/proforma-history-sql.test.ts`

**Interfaces:**
- Consumes: el índice `proformas_client_document_idx` (tarea 7).
- Produces:
  - `ClientMatch = { name: string; phone: string; address: string; count: number }`;
  - `findClient(supabase, document)` → `ClientMatch | null`;
  - `historyKeys.client(document)` y `useClientLookup()` → `(document: string) => Promise<ClientMatch | null>`;
  - `ProformaEditorProps.findClient` (obligatoria) y `ProformaClient({ lookupRuc, findClient, defaultValidityDays })`.

- [ ] **Step 1: Escribir las pruebas**

`tests/integration/proforma-history-sql.test.ts`: añade `findClient` a la importación de `@/features/proforma/history/queries` y:

```ts
describe('findClient', () => {
  it('toma la proforma más reciente del documento y cuenta todas', async () => {
    await insert({
      number: 1,
      client_name: 'Nombre anterior',
      client_document: '20601234567',
      document: { input: { client: { address: 'Av. Vieja 1' } } },
    })
    await insert({
      number: 2,
      client_name: 'Inversiones Nuevo Sol S.A.C.',
      client_document: '20601234567',
      client_phone: '987 654 321',
      document: { input: { client: { address: 'Av. Sol 456' } } },
    })
    expect(await findClient(supabase, '20601234567')).toEqual({
      name: 'Inversiones Nuevo Sol S.A.C.',
      phone: '987 654 321',
      address: 'Av. Sol 456',
      count: 2,
    })
    expect(await findClient(supabase, '20000000001')).toBeNull()
  })
})
```

`tests/components/proforma-editor.test.tsx`:
- añade `import type { ClientMatch } from '@/features/proforma/history/queries'`;
- en `renderEditor`, añade `findClient: vi.fn<(document: string) => Promise<ClientMatch | null>>(async () => null),` a `props`;
- añade las pruebas:

```tsx
  describe('cliente desde el historial', () => {
    const known: ClientMatch = {
      name: 'Inversiones Nuevo Sol S.A.C.',
      phone: '987654321',
      address: 'Av. Sol 456',
      count: 6,
    }

    it('con un RUC conocido completa lo vacío desde su proforma más reciente', async () => {
      seedProforma({
        lines: [line()],
        client: { ...EMPTY_DRAFT.client, phone: '911222333', deliveryTime: 'Inmediato' },
      })
      const findClient = vi.fn(async () => known)
      const lookupRuc = vi.fn<Lookup>(async () => found('OTRO NOMBRE EN SUNAT S.A.C.'))
      const { user } = renderEditor({ findClient, lookupRuc })
      await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
      expect(await screen.findByText('Cliente con 6 proformas: datos completados')).toBeVisible()
      expect(findClient).toHaveBeenCalledWith('20000000001')
      expect(screen.getByLabelText('Razón social o nombre')).toHaveValue(known.name)
      // Lo ya escrito no se pisa; el tiempo de entrega no se copia.
      expect(screen.getByLabelText('Celular')).toHaveValue('911222333')
      await vi.waitFor(() => expect(lookupRuc).toHaveBeenCalledTimes(1))
      expect(screen.getByLabelText('Razón social o nombre')).toHaveValue(known.name)
      await user.click(screen.getByRole('button', { name: /Más datos/ }))
      expect(screen.getByLabelText('Dirección')).toHaveValue('Av. Sol 456')
      expect(screen.getByLabelText('Tiempo de entrega')).toHaveValue('Inmediato')
    })

    it('si ya estaba todo escrito, solo dice cuántas proformas tiene', async () => {
      seedProforma({
        lines: [line()],
        client: { ...EMPTY_DRAFT.client, name: 'Mi cliente', phone: '911222333', address: 'Calle 1' },
      })
      const { user } = renderEditor({ findClient: vi.fn(async () => known) })
      await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
      expect(await screen.findByText('Cliente con 6 proformas.')).toBeVisible()
      expect(screen.getByLabelText('Razón social o nombre')).toHaveValue('Mi cliente')
    })

    it('con un DNI conocido también completa, sin consultar SUNAT', async () => {
      seedProforma({ lines: [line()] })
      const lookupRuc = vi.fn<Lookup>()
      const { user } = renderEditor({
        findClient: vi.fn(async () => ({ ...known, name: 'José Pérez', count: 1 })),
        lookupRuc,
      })
      await user.type(screen.getByLabelText('RUC o DNI'), '12345678')
      expect(await screen.findByText('Cliente con 1 proforma: datos completados')).toBeVisible()
      expect(screen.getByLabelText('Razón social o nombre')).toHaveValue('José Pérez')
      expect(lookupRuc).not.toHaveBeenCalled()
    })

    it('con historial, el aviso de SUNAT de baja o no habido se mantiene', async () => {
      seedProforma({ lines: [line()] })
      const { user } = renderEditor({
        findClient: vi.fn(async () => known),
        lookupRuc: vi.fn<Lookup>(async () =>
          found('EMPRESA INACTIVA S.R.L.', 'BAJA DE OFICIO', 'NO HABIDO'),
        ),
      })
      await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
      expect(
        await screen.findByText(/SUNAT lo registra como BAJA DE OFICIO · NO HABIDO/),
      ).toBeVisible()
      expect(screen.getByLabelText('Razón social o nombre')).toHaveValue(known.name)
    })
  })
```

`tests/components/proforma-panel.test.tsx`: en `renderPanel`, añade `findClient: vi.fn(async () => null),` a `props`.

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project components tests/components/proforma-editor.test.tsx -t "historial"`
Expected: FAIL: no aparece «Cliente con 6 proformas: datos completados» y el nombre queda vacío o con el de SUNAT.

- [ ] **Step 3: Buscar el cliente en el historial**

`src/features/proforma/history/queries.ts`, al final:

```ts
export type ClientMatch = { name: string; phone: string; address: string; count: number }

const clientSchema = z.object({
  client_name: z.string(),
  client_phone: z.string(),
  address: z.string().nullable(),
})

// El cliente según su proforma más reciente (spec de productos libres §4.3): una consulta por el
// índice del documento, que además cuenta cuántas tiene.
export async function findClient(
  supabase: Client,
  document: string,
): Promise<ClientMatch | null> {
  const { data, error, count } = await supabase
    .from('proformas')
    .select('client_name, client_phone, address:document->input->client->>address', {
      count: 'exact',
    })
    .eq('client_document', document)
    .order('number', { ascending: false })
    .limit(1)
  if (error) throw error
  const [row] = z.array(clientSchema).parse(data)
  return row
    ? { name: row.client_name, phone: row.client_phone, address: row.address ?? '', count: count ?? 1 }
    : null
}
```

`src/features/proforma/history/hooks.ts`:
- añade `useQueryClient` a la importación de `@tanstack/react-query` y `findClient`, `type ClientMatch` a la de `./queries`;
- añade `client: (document: string) => ['proformas', 'client', document] as const,` a `historyKeys`;
- al final:

```ts
// Al completar un RUC o DNI (spec §4.3). Sin respuesta, la proforma sigue sin completar.
export function useClientLookup() {
  const queryClient = useQueryClient()
  return (document: string): Promise<ClientMatch | null> =>
    queryClient
      .fetchQuery({
        queryKey: historyKeys.client(document),
        queryFn: () => findClient(createClient(), document),
        staleTime: 0,
      })
      .catch(() => null)
}
```

`src/features/proforma/components/proforma-editor.tsx`: importa `type ClientMatch` desde `'../history/queries'`; añade a `ProformaEditorProps`:

```ts
  // El cliente según su proforma más reciente (spec de productos libres §4.3).
  findClient: (document: string) => Promise<ClientMatch | null>
```

recíbela en `ProformaEditor` y pásala: `<ProformaClient lookupRuc={lookupRuc} findClient={findClient} defaultValidityDays={defaultValidity} />`.

`src/features/proforma/components/proforma-dialog.tsx`: importa `useClientLookup` desde `'../history/hooks'`, añade `const findClient = useClientLookup()` y pasa `findClient={findClient}` a `ProformaPanel`.

- [ ] **Step 4: Completar los datos del cliente**

`src/features/proforma/components/proforma-client.tsx`:
- añade `History` a la importación de `lucide-react` e `import type { ClientMatch } from '../history/queries'`;
- reemplaza el tipo `Lookup` por:

```ts
// Lo que se sabe del documento escrito: su historial y, si es un RUC, lo que dice SUNAT.
type Lookup = {
  document: string
  history: ClientMatch | null | 'loading'
  // Si el historial completó algún campo: el aviso no dice «datos completados» si no lo hizo.
  filled: boolean
  sunat: RucLookupResult | 'loading' | null // null: un DNI, que no se consulta en SUNAT
} | null

// Del historial solo se completa lo vacío; el tiempo de entrega no se copia (spec §4.3).
const fillEmpty = (client: Client, match: ClientMatch): Partial<Client> =>
  Object.fromEntries(
    (['name', 'phone', 'address'] as const)
      .filter((key) => !client[key].trim() && match[key])
      .map((key) => [key, match[key]]),
  )
```

- la prop nueva: `findClient: (document: string) => Promise<ClientMatch | null>` (en la firma y en el tipo de las props);
- reemplaza `runLookup` y `changeDocument` por:

```ts
  // Al completar un RUC o DNI válido, no en cada tecla (spec §7): el historial primero, que es
  // inmediato, y SUNAT en paralelo para un RUC. Si el documento cambió mientras tanto, las
  // respuestas no pisan nada.
  async function runLookup(document: string) {
    const isRuc = documentKind(document) === 'ruc'
    setLookup({ document, history: 'loading', filled: false, sunat: isRuc ? 'loading' : null })
    const sunatRequest = isRuc ? lookupRuc(document) : null
    const history = await findClient(document)
    let filled = false
    if (history) {
      update((current) => {
        if (current.client.document !== document) return current
        const patch = fillEmpty(current.client, history)
        filled = Object.keys(patch).length > 0
        return patchClient(current, patch)
      })
    }
    setLookup((current) =>
      current?.document === document ? { ...current, history, filled } : current,
    )
    if (!sunatRequest) return
    const result = await sunatRequest
    setLookup((current) => (current?.document === document ? { ...current, sunat: result } : current))
    // Los datos de SUNAT solo se usan sin historial; su aviso de baja o no habido, siempre.
    if (history || result.kind !== 'found') return
    update((current) =>
      current.client.document === document
        ? patchClient(current, {
            name: result.company.legalName,
            address: result.company.address ?? current.client.address,
          })
        : current,
    )
  }

  function changeDocument(value: string) {
    const digits = digitsOnly(value).slice(0, 11)
    edit({ document: digits })
    const complete = isValidRuc(digits) || documentKind(digits) === 'dni'
    if (digits !== client.document && complete) void runLookup(digits)
  }
```

- cambia `<RucStatus lookup={lookup?.ruc === client.document ? lookup : null} … />` por:

```tsx
      <LookupStatus
        lookup={lookup?.document === client.document ? lookup : null}
        onRetry={() => void runLookup(client.document)}
      />
```

- reemplaza la función `RucStatus` por estas dos:

```tsx
// Qué se completó y qué dice SUNAT (spec §4.3 y §4.5).
function LookupStatus({ lookup, onRetry }: { lookup: Lookup; onRetry: () => void }) {
  if (!lookup) return null
  const known = lookup.history === 'loading' ? null : lookup.history
  return (
    <>
      {known ? (
        <p role="status" className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-ring">
          <History className="size-3.5" aria-hidden />
          Cliente con {known.count} {known.count === 1 ? 'proforma' : 'proformas'}
          {lookup.filled ? ': datos completados' : '.'}
        </p>
      ) : null}
      {lookup.sunat ? (
        <RucStatus result={lookup.sunat} onlyWarning={known !== null} onRetry={onRetry} />
      ) : null}
    </>
  )
}

// Estados de la consulta (spec §4.5): cargando, encontrado, no encontrado, sin servicio y aviso.
// Con datos del historial, de SUNAT solo importa el aviso de baja o no habido.
function RucStatus({
  result,
  onlyWarning,
  onRetry,
}: {
  result: RucLookupResult | 'loading'
  onlyWarning: boolean
  onRetry: () => void
}) {
  if (
    onlyWarning &&
    (result === 'loading' || result.kind !== 'found' || isActiveTaxpayer(result.company))
  ) {
    return null
  }
  const base = 'mt-2.5 text-xs text-muted-foreground'
  if (result === 'loading') {
    return (
      <p role="status" className={cn(base, 'flex items-center gap-1.5')}>
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Buscando el RUC en SUNAT…
      </p>
    )
  }
  if (result.kind === 'not-found') {
    return (
      <p role="status" className={base}>
        No encontramos este RUC en SUNAT. Escribe los datos a mano.
      </p>
    )
  }
  if (result.kind === 'unavailable') {
    return (
      <p role="status" className={base}>
        No pudimos consultar SUNAT. Escribe los datos a mano o{' '}
        <button type="button" className={cn(inlineAction, 'text-xs')} onClick={onRetry}>
          vuelve a intentarlo
        </button>
        .
      </p>
    )
  }
  if (isActiveTaxpayer(result.company)) {
    return (
      <p role="status" className={base}>
        Datos de SUNAT. Puedes editarlos.
      </p>
    )
  }
  return (
    <p
      role="status"
      className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
    >
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      SUNAT lo registra como {result.company.status} · {result.company.condition}. Puedes generar la
      proforma igual.
    </p>
  )
}
```

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components tests/components/proforma-editor.test.tsx tests/components/proforma-panel.test.tsx && pnpm exec vitest run --project integration tests/integration/proforma-history-sql.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS en todo; las pruebas de SUNAT de antes siguen igual (sin historial, `findClient` devuelve `null`).

- [ ] **Step 6: Commit**

```bash
git add src/features/proforma/history/queries.ts src/features/proforma/history/hooks.ts src/features/proforma/components/proforma-client.tsx src/features/proforma/components/proforma-editor.tsx src/features/proforma/components/proforma-dialog.tsx tests/components/proforma-editor.test.tsx tests/components/proforma-panel.test.tsx tests/integration/proforma-history-sql.test.ts
git commit -m "feat: fill in a known client from their latest proforma"
```

---

### Task 14: E2E del historial y despliegue de la Parte C

**Files:**
- Modify: `tests/e2e/proformas.spec.ts`, `docs/deployment.md`

**Interfaces:**
- Consumes: todo lo de las tareas 7 a 13.

- [ ] **Step 1: Escribir las e2e**

`tests/e2e/proformas.spec.ts`: añade `resetProformas` (si no está) a la importación de `../integration/db` y, al final:

```ts
// 25 proformas guardadas con su copia, como las deja «Generar». La 7 es de José Pérez.
async function seedHistory() {
  const db = await connect()
  try {
    await resetProformas(db)
    for (let number = 1; number <= 25; number++) {
      const name = number === 7 ? 'José Pérez' : `Cliente ${number}`
      const document = number === 7 ? '12345678' : ''
      const issuedAt = new Date(Date.UTC(2026, 9, 1, 15) + number * 3_600_000).toISOString()
      const snapshot = {
        input: {
          draft: false,
          number,
          issuedAt,
          lines: [
            {
              code: 'LAP-001',
              name: 'Laptop de 14 pulgadas',
              description: null,
              unitPrice: '100.00',
              quantity: 1,
            },
          ],
          client: { name, document, phone: '987654321', address: '', deliveryTime: '' },
          validityDays: '',
          discountPercent: '',
          shipping: '',
        },
        company: {
          legal_name: 'Empresa de Pruebas S.A.C.',
          trade_name: null,
          ruc: '20000000001',
          address: 'Av. Prueba 123, Huamanga',
          phones: ['066 312345'],
          email: null,
          payment_terms: null,
          return_policy: null,
          default_validity_days: 7,
          bank_accounts: [],
          wallets: [],
          whatsapp_message: null,
          updated_at: '2026-10-01T00:00:00Z',
        },
      }
      await db.query(
        `insert into public.proformas
           (number, issued_at, valid_until, client_name, client_document, client_phone,
            item_count, total, document)
         values ($1, $2, '2026-10-08', $3, $4, '987654321', 1, 100, $5)`,
        [number, issuedAt, name, document, snapshot],
      )
    }
  } finally {
    await db.end()
  }
}

const history = (page: Page) => page.getByRole('region', { name: 'Historial de proformas' })
const SEARCH = 'Buscar por cliente, RUC, DNI, celular o N° de proforma'

test('encuentra, pagina, filtra, descarga y reenvía las proformas guardadas', async ({ page }) => {
  await seed()
  await seedHistory()
  // wa.me responde con una página de prueba: las e2e nunca salen a WhatsApp.
  await page
    .context()
    .route('https://wa.me/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>WhatsApp</title>' }),
    )
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await expect(page.getByText(/^25 proformas · \d+ este mes$/)).toBeVisible()
  await expect(history(page).getByText('Proformas 1–20 de 25')).toBeVisible()

  await history(page).getByRole('button', { name: 'Página 2' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(history(page).getByText('Proformas 21–25 de 25')).toBeVisible()

  await history(page).getByLabel(SEARCH).fill('jose perez')
  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()
  await expect(page).toHaveURL(/search=jose/)
  await page.reload()
  // La tabla (PC) y las tarjetas (móvil) están en la página; solo una se ve.
  await expect(history(page).getByText('José Pérez').filter({ visible: true })).toBeVisible()

  const excel = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar Excel' }).click()
  expect((await excel).suggestedFilename()).toMatch(/^proformas-jose-perez-\d{4}-\d{2}-\d{2}\.xlsx$/)

  // El N° también se busca, y el nombre del cliente muestra todas sus proformas.
  await history(page).getByLabel(SEARCH).fill('0007')
  await expect(page).toHaveURL(/search=0007/)
  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()
  await history(page).getByRole('button', { name: 'Ver las proformas de José Pérez' }).click()
  await expect(page).toHaveURL(/search=12345678/)
  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()

  await history(page).getByRole('button', { name: 'Reenviar la proforma N° 0007' }).click()
  const resend = page.getByRole('dialog', { name: 'Reenviar proforma N° 0007' })
  await expect(
    resend.getByText(/Hola, José Pérez\. Le envío la proforma N° 0007 por S\/ 100\.00/),
  ).toBeVisible()
  const chat = page.context().waitForEvent('page')
  await resend.getByRole('button', { name: 'Enviar por WhatsApp' }).click()
  expect((await chat).url()).toContain('https://wa.me/51987654321?text=Hola%2C%20Jos%C3%A9%20P%C3%A9rez')
})

// El proveedor de prueba (WHATSAPP_PROVIDER=stub) vincula al instante y nunca sale a WhatsApp.
test('con el WhatsApp vinculado, «Reenviar» la envía sola', async ({ page }) => {
  await seed()
  await seedHistory()
  await login(page)
  await page.getByRole('link', { name: 'Empresa' }).click()
  const card = page.getByRole('region', { name: 'WhatsApp' })
  await card.getByRole('button', { name: 'Vincular WhatsApp' }).click()
  const link = page.getByRole('dialog', { name: 'Vincular WhatsApp' })
  await link.getByLabel('Celular de WhatsApp de la empresa').fill('987 654 321')
  await link.getByRole('button', { name: 'Generar código' }).click()
  await expect(page.getByText('WhatsApp vinculado.')).toBeVisible()

  await page.getByRole('link', { name: 'Proformas' }).click()
  await history(page).getByRole('button', { name: 'Reenviar la proforma N° 0025' }).click()
  const resend = page.getByRole('dialog', { name: 'Reenviar proforma N° 0025' })
  await resend.getByLabel('Celular del cliente').fill('900 000 000')
  await resend.getByRole('button', { name: 'Enviar por WhatsApp' }).click()
  await expect(resend.getByText('Enviada por WhatsApp al 900 000 000.')).toBeVisible()
})

// Preferencia del usuario: las pantallas llenan el contenedor, nada se desborda y la acción
// principal se ve sin bajar.
test('Proformas llena el contenedor sin desbordarse y «Nueva proforma» está a la vista', async ({
  page,
}) => {
  await seed()
  await seedHistory()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await expect(history(page).getByText('Proformas 1–20 de 25')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva proforma' }).first()).toBeInViewport()
  const overflow = await page.evaluate(() => {
    const section = document.querySelector('[aria-label="Historial de proformas"]')!
    return {
      page: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      section: Math.max(0, section.scrollWidth - section.clientWidth),
    }
  })
  expect(overflow).toEqual({ page: 0, section: 0 })
  const main = await page.locator('#main').boundingBox()
  const list = await history(page).boundingBox()
  // Solo el margen interior de la página: sin un ancho máximo que deje espacio vacío.
  expect(list!.width).toBeGreaterThan(main!.width - 100)
})

test('la proforma generada aparece en el historial y «Corregir» la actualiza', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await expect(page.getByText('Todavía no hay proformas guardadas')).toBeVisible()
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()
  await panel.getByRole('button', { name: 'Corregir' }).click()
  await panel.getByLabel('Cantidad de Instalación en sitio').fill('2')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Cliente de prueba · Total S/ 700.00')).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()
  await expect(history(page).getByText('S/ 700.00').filter({ visible: true }).first()).toBeVisible()
})
```

(«Nueva proforma» aparece dos veces cuando no hay proformas: en la cabecera y en el estado vacío; `.first()` toma el de la cabecera.)

- [ ] **Step 2: Ejecutar las e2e**

Run: `pnpm exec playwright test tests/e2e/proformas.spec.ts`
Expected: PASS en PC y en móvil.

- [ ] **Step 3: Documentar el despliegue**

`docs/deployment.md`, en «Las más recientes son:», añade:

```md
- `202610060002_proforma_history.sql`: el historial de proformas. Añade la tabla `proformas` (sin borrado) y las funciones `filter_proformas`, `search_proformas` y `export_proformas`, solo para cuentas con sesión.
```

y en la lista de comprobaciones, antes de «Cerrar sesión…»:

```md
- [ ] **Proformas:** genera una proforma con un producto libre (código vacío) y ciérrala: aparece en Proformas con su total. «Corregir», cambiar la cantidad y generar otra vez actualiza esa misma fila. Busca al cliente, cambia de página, descarga el Excel y reenvía por WhatsApp. Usa «Cliente Prueba despliegue» para reconocerla: las proformas no se borran. El historial empieza con esta versión: las proformas anteriores no están.
```

- [ ] **Step 4: Ejecutar la batería completa de la Parte C**

Run: `pnpm test && pnpm test:integration && pnpm typecheck && pnpm lint && pnpm exec playwright test`
Expected: PASS en todo.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/proformas.spec.ts docs/deployment.md
git commit -m "test: cover the proforma history end to end"
```

---

## Parte D — Fotos

### Task 15: Bucket de fotos, políticas y `products.image_path`

**Files:**
- Create: `supabase/migrations/202610060003_photos.sql`, `tests/integration/photos-storage.test.ts`
- Modify: `src/lib/supabase/database.types.ts` (generado), `docs/setup.md`

**Interfaces:**
- Produces:
  - bucket privado `images`; la cuenta dueña lee y sube solo en `products/` y `lines/`, con nombre `<uuid>.jpg` o `<uuid>.thumb.jpg` (la miniatura); nadie borra ni reemplaza;
  - `products.image_path text null` (solo `products/<uuid>.jpg`);
  - `filter_products` devuelve `image_path`; los JSON de `search_products` y `export_products` lo incluyen.

- [ ] **Step 1: Arrancar el Supabase local con Storage**

`docs/setup.md`, en «Supabase local», cambia el comentario y el comando de arranque por:

```bash
# Arranca base de datos, Auth, API REST, Storage (fotos) y gateway, sin servicios que no se usan
pnpm exec supabase start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

Run: `pnpm exec supabase stop && pnpm exec supabase start -x realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`
Expected: arranca con `storage-api`; `pnpm exec supabase status` muestra «Storage URL». Los datos locales se conservan (`stop` sin `--no-backup`).

- [ ] **Step 2: Escribir las pruebas de integración**

`tests/integration/photos-storage.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog, sqlState } from './db'

const BUCKET = 'images'
const password = 'fotos-clave-123'
const owner = { email: 'fotos-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'fotos-intruso@catalogo.test' }
const jpeg = readFileSync('public/brand/ventronix-logo-proforma.jpg')
const uploaded: string[] = []

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  await ensureUser({ password, ...intruder })
  supabase = await signedInClient(owner.email, password)
  outsider = await signedInClient(intruder.email, password)
})

afterAll(async () => {
  if (uploaded.length > 0) await adminClient().storage.from(BUCKET).remove(uploaded)
  await resetCatalog(db)
  await db.end()
})

async function upload(client: SupabaseClient, path: string) {
  const result = await client.storage.from(BUCKET).upload(path, jpeg, { contentType: 'image/jpeg' })
  if (!result.error) uploaded.push(path)
  return result
}

describe('bucket de fotos', () => {
  it('la cuenta dueña sube y lee fotos y miniaturas en products/ y lines/', async () => {
    for (const path of [
      `products/${randomUUID()}.jpg`,
      `lines/${randomUUID()}.jpg`,
      `products/${randomUUID()}.thumb.jpg`,
    ]) {
      expect((await upload(supabase, path)).error).toBeNull()
      const { data, error } = await supabase.storage.from(BUCKET).download(path)
      expect(error).toBeNull()
      expect(Buffer.from(await data!.arrayBuffer()).equals(jpeg)).toBe(true)
    }
  })

  it('rechaza otras carpetas y nombres que no son <uuid>.jpg ni <uuid>.thumb.jpg', async () => {
    const id = randomUUID()
    for (const path of [
      `otros/${id}.jpg`,
      `products/${id}.png`,
      `products/../${id}.jpg`,
      'products/foto.jpg',
      `products/${id}.jpg/x.jpg`,
      `products/${id}.small.jpg`,
      `lines/${id}.thumb.png`,
    ]) {
      expect((await upload(supabase, path)).error, path).not.toBeNull()
    }
  })

  it('otra cuenta y sin sesión no ven ni suben fotos', async () => {
    const path = `products/${randomUUID()}.jpg`
    await upload(supabase, path)
    expect((await upload(outsider, `products/${randomUUID()}.jpg`)).error).not.toBeNull()
    expect((await outsider.storage.from(BUCKET).download(path)).error).not.toBeNull()
    expect((await publicClient().storage.from(BUCKET).download(path)).error).not.toBeNull()
  })

  it('una foto no se borra ni se reemplaza', async () => {
    const path = `lines/${randomUUID()}.jpg`
    await upload(supabase, path)
    await supabase.storage.from(BUCKET).remove([path])
    expect((await supabase.storage.from(BUCKET).download(path)).error).toBeNull()
    const again = await supabase.storage
      .from(BUCKET)
      .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true })
    expect(again.error).not.toBeNull()
  })
})

describe('foto del producto', () => {
  it('la base solo acepta rutas de products/ y la lista la devuelve', async () => {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    const path = `products/${randomUUID()}.jpg`
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, image_path)
       values ('LAP-001', 'Laptop', $1, 100, $2)`,
      [rows[0].id, path],
    )
    expect(
      await sqlState(
        db.query(`update public.products set image_path = 'lines/${randomUUID()}.jpg'`),
      ),
    ).toBe('23514')
    const { data, error } = await supabase.rpc('search_products', {})
    expect(error).toBeNull()
    expect((data as unknown as { items: { image_path: string }[] }).items[0].image_path).toBe(path)
  })
})
```

- [ ] **Step 3: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project integration tests/integration/photos-storage.test.ts`
Expected: FAIL: «Bucket not found» al subir y `column "image_path" of relation "products" does not exist`.

- [ ] **Step 4: Escribir la migración**

`supabase/migrations/202610060003_photos.sql`:

```sql
-- Fotos opcionales de los productos y de los productos libres (spec de proformas libres, historial
-- y fotos §3, §5 y §8). Bucket privado: solo la cuenta dueña lee y sube, solo en sus dos carpetas y
-- con nombre <uuid>.jpg (600 px) o <uuid>.thumb.jpg (la miniatura de 200 px). Sin políticas para
-- borrar ni para reemplazar: una proforma guardada puede usar la foto.
-- Solo id, name y public: los límites de tamaño y de tipo son columnas del servicio de Storage, que
-- pueden faltar al recrear la base local. El navegador ya sube JPEG reducidos (plan, decisión 15).
insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

create policy "owner reads images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'images'
    and (select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner'
  );

create policy "owner uploads images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images'
    and (select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner'
    and name ~ '^(products|lines)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.thumb)?\.jpg$'
  );

-- Nula: sin foto. Cambiarla es subir otro archivo; las proformas anteriores conservan la suya.
alter table public.products
  add column image_path text check (
    image_path ~ '^products/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
  );

-- La lista y los Excel devuelven también la foto: al añadir un producto a la proforma se copia
-- (plan, decisión 14). La tabla de salida de filter_products cambia, así que se vuelve a crear; las
-- otras dos conservan su firma.
drop function public.filter_products(text, uuid, text, date, date, text);

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
  image_path text,
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
      p.created_at, p.updated_at, c.name as category_name, p.image_path,
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
    m.created_at, m.updated_at, m.category_name, m.image_path,
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

create or replace function public.search_products(
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
            'category_name', f.category_name, 'image_path', f.image_path
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

create or replace function public.export_products(
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
        'category_name', f.category_name, 'image_path', f.image_path
      )
      order by f.sort_position
    ),
    '[]'::json
  )
  from public.filter_products(search, category, date_by, date_from, date_to, sort) f
  where f.sort_position <= least(greatest(max_rows, 1), 20001)
$$;

-- Al borrarla, filter_products perdió sus permisos: los mismos de antes.
revoke execute on function public.filter_products(text, uuid, text, date, date, text)
  from public, anon;
grant execute on function public.filter_products(text, uuid, text, date, date, text)
  to authenticated;
```

- [ ] **Step 5: Aplicarla y regenerar los tipos**

Run: `pnpm exec supabase migration up && pnpm db:types && pnpm exec prettier --write src/lib/supabase/database.types.ts`
Expected: «Applying migration 202610060003_photos.sql…» sin errores; `products` tiene `image_path` en `database.types.ts`.

Si `migration up` dice que `storage.buckets` no existe, Storage no arrancó: repite el Step 1.

- [ ] **Step 6: Ejecutar las pruebas y ver que pasan**

Run: `pnpm exec vitest run --project integration tests/integration/photos-storage.test.ts tests/integration/catalog-search.test.ts tests/integration/catalog-list-filters.test.ts tests/integration/catalog-access.test.ts && pnpm typecheck`
Expected: PASS en todo: la búsqueda y los filtros de Productos siguen igual y sus permisos también.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202610060003_photos.sql src/lib/supabase/database.types.ts docs/setup.md tests/integration/photos-storage.test.ts
git commit -m "feat: add a private photo bucket and an optional product photo"
```

---

### Task 16: Reducir, subir y mostrar fotos

**Files:**
- Create:
  - `src/lib/photos.ts`
  - `src/lib/use-photos.ts`
  - `src/components/photo-field.tsx`
  - `tests/unit/photos.test.ts`
  - `tests/components/photo-field.test.tsx`

**Interfaces:**
- Produces:
  - en `src/lib/photos.ts` (cliente y servidor):
    - `PHOTO_BUCKET = 'images'`, `PHOTO_MAX_SIDE = 600`, `PHOTO_THUMB_SIDE = 200`, `PHOTO_QUALITY = 0.82`;
    - `PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']` y `PhotoFolder`;
    - `photoPathSchema(folder?)`: solo `<carpeta>/<uuid>.jpg`, la foto de 600 px a la que apuntan el producto y la línea;
    - `thumbPath(path)`: `products/<uuid>.jpg` → `products/<uuid>.thumb.jpg`;
    - `fitWithin(width, height, max?)`;
  - en `src/lib/use-photos.ts` (navegador):
    - `UnreadablePhotoError`: el navegador no pudo leer la foto;
    - `uploadPhoto(folder, file): Promise<string>`: sube la de 600 px y su miniatura, y devuelve la ruta de la de 600 px;
    - `usePhotoUrl(path: string | null): string | undefined`: URL firmada de una hora, una consulta por foto;
  - `PhotoField({ value, url, alt, upload, onChange, compact? })`: muestra la foto elegida al instante (copia local) mientras se sube.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/photos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitWithin, photoPathSchema, PHOTO_THUMB_SIDE, thumbPath } from '@/lib/photos'

describe('fitWithin', () => {
  it.each([
    [4000, 3000, 600, { width: 600, height: 450 }],
    [1080, 1920, 600, { width: 338, height: 600 }],
    [300, 200, 600, { width: 300, height: 200 }],
    [6000, 10, 600, { width: 600, height: 1 }],
    [4000, 3000, PHOTO_THUMB_SIDE, { width: 200, height: 150 }],
  ])('%i × %i en %i px', (width, height, max, expected) => {
    expect(fitWithin(width, height, max)).toEqual(expected)
  })
})

describe('rutas de fotos', () => {
  const id = '8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c'

  it('acepta <carpeta>/<uuid>.jpg y, si se pide, solo una carpeta', () => {
    expect(photoPathSchema().safeParse(`lines/${id}.jpg`).success).toBe(true)
    expect(photoPathSchema('products').safeParse(`products/${id}.jpg`).success).toBe(true)
    expect(photoPathSchema('products').safeParse(`lines/${id}.jpg`).success).toBe(false)
  })

  it.each([
    `otros/${id}.jpg`,
    `products/${id}.png`,
    `products/../${id}.jpg`,
    'products/foto.jpg',
    `products/${id}.jpg.exe`,
    `/products/${id}.jpg`,
    `products/${id.toUpperCase()}.jpg`,
    `products/${id}.thumb.jpg`,
  ])('rechaza %s', (path) => {
    expect(photoPathSchema().safeParse(path).success).toBe(false)
  })

  it('la miniatura vive junto a la foto', () => {
    expect(thumbPath(`products/${id}.jpg`)).toBe(`products/${id}.thumb.jpg`)
  })
})
```

`tests/components/photo-field.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoField } from '@/components/photo-field'
import { UnreadablePhotoError } from '@/lib/use-photos'

const path = 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:local')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('PhotoField', () => {
  it('muestra la foto elegida al instante, la sube y deja quitarla', async () => {
    const upload = vi.fn(async () => path)
    const onChange = vi.fn()
    const { rerender } = render(
      <PhotoField value={null} url={undefined} alt="Foto de Laptop" upload={upload} onChange={onChange} />,
    )
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: 'Elegir foto' })).toBeVisible()
    expect(
      screen.getByText('JPG, PNG o WebP. Antes de guardarla se reduce a 600 px (unos 50 KB).'),
    ).toBeVisible()
    const file = new File(['foto'], 'laptop.webp', { type: 'image/webp' })
    await user.upload(screen.getByLabelText('Foto'), file)
    expect(upload).toHaveBeenCalledWith(file)
    expect(onChange).toHaveBeenCalledWith(path)

    rerender(
      <PhotoField value={path} url={undefined} alt="Foto de Laptop" upload={upload} onChange={onChange} />,
    )
    // La copia local, sin esperar la URL firmada.
    expect(screen.getByRole('img', { name: 'Foto de Laptop' })).toHaveAttribute('src', 'blob:local')
    expect(screen.getByRole('button', { name: 'Cambiar foto' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Quitar foto' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('una foto ya guardada se ve con su URL firmada', () => {
    render(
      <PhotoField
        value={path}
        url="https://storage.test/foto.thumb.jpg"
        alt="Foto de Laptop"
        upload={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('img', { name: 'Foto de Laptop' })).toHaveAttribute(
      'src',
      'https://storage.test/foto.thumb.jpg',
    )
  })

  it('distingue un archivo que no es foto, una foto ilegible y un fallo de conexión', async () => {
    const upload = vi
      .fn<(file: File) => Promise<string>>()
      .mockRejectedValueOnce(new UnreadablePhotoError())
      .mockRejectedValueOnce(new Error('sin red'))
    render(<PhotoField value={null} url={undefined} alt="Foto" upload={upload} onChange={vi.fn()} />)
    const user = userEvent.setup({ applyAccept: false })
    const input = screen.getByLabelText('Foto')
    await user.upload(input, new File(['x'], 'nota.txt', { type: 'text/plain' }))
    expect(screen.getByText('Elige una foto JPG, PNG o WebP.')).toBeVisible()
    expect(upload).not.toHaveBeenCalled()
    await user.upload(input, new File(['x'], 'rota.jpg', { type: 'image/jpeg' }))
    expect(
      await screen.findByText('No pudimos leer esta foto. Prueba con otra en JPG, PNG o WebP.'),
    ).toBeVisible()
    await user.upload(input, new File(['x'], 'foto.png', { type: 'image/png' }))
    expect(
      await screen.findByText('No pudimos subir la foto. Revisa tu conexión e inténtalo de nuevo.'),
    ).toBeVisible()
  })
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/photos.test.ts && pnpm exec vitest run --project components tests/components/photo-field.test.tsx`
Expected: FAIL al importar: `@/lib/photos`, `@/lib/use-photos` y `@/components/photo-field` no existen.

- [ ] **Step 3: Escribir las reglas de las fotos**

`src/lib/photos.ts`:

```ts
import { z } from 'zod'

// Fotos de los productos y de los productos libres (spec de productos libres §3, §5 y §8). Sirve en
// el navegador y en el servidor.
export const PHOTO_BUCKET = 'images'
export const PHOTO_MAX_SIDE = 600
// Miniatura del PDF y de las listas: nítida en su columna de 1,5 cm y unas cinco veces más liviana
// (plan, decisión 18).
export const PHOTO_THUMB_SIDE = 200
export const PHOTO_QUALITY = 0.82
// Lo que se puede elegir: el navegador las lee y las vuelve a guardar en JPEG.
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export type PhotoFolder = 'products' | 'lines'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

// La foto de 600 px a la que apuntan el producto y la línea: el bucket acepta además su miniatura.
export const photoPathSchema = (folder?: PhotoFolder) =>
  z
    .string()
    .regex(new RegExp(`^(${folder ?? 'products|lines'})/${UUID}\\.jpg$`), 'La foto no es válida.')

// La miniatura vive junto a la foto: products/<uuid>.jpg → products/<uuid>.thumb.jpg.
export const thumbPath = (path: string) => path.replace(/\.jpg$/, '.thumb.jpg')

// Lado mayor a `max`, sin agrandar las pequeñas ni dejar un lado en cero.
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
```

- [ ] **Step 4: Escribir la subida y la URL firmada**

`src/lib/use-photos.ts`:

```ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  fitWithin,
  PHOTO_BUCKET,
  PHOTO_MAX_SIDE,
  PHOTO_QUALITY,
  PHOTO_THUMB_SIDE,
  thumbPath,
  type PhotoFolder,
} from './photos'

// El navegador no pudo leer la foto: no es una imagen o no conoce su formato.
export class UnreadablePhotoError extends Error {}

// Un tamaño en JPEG, con fondo blanco: un PNG transparente no queda negro.
function toJpeg(image: ImageBitmap, max: number) {
  const { width, height } = fitWithin(image.width, image.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new UnreadablePhotoError()
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new UnreadablePhotoError())),
      'image/jpeg',
      PHOTO_QUALITY,
    ),
  )
}

// La foto se lee una vez y se sube en dos tamaños con la sesión de la cuenta (spec §8): 600 px
// para verla y 200 px para el PDF y las listas. El original no se guarda. Cada foto es un archivo
// nuevo: las proformas anteriores conservan la suya. Devuelve la ruta de la de 600 px.
export async function uploadPhoto(folder: PhotoFolder, file: File) {
  const image = await createImageBitmap(file).catch(() => {
    throw new UnreadablePhotoError()
  })
  const [full, thumb] = await Promise.all([
    toJpeg(image, PHOTO_MAX_SIDE),
    toJpeg(image, PHOTO_THUMB_SIDE),
  ]).finally(() => image.close())
  const path = `${folder}/${crypto.randomUUID()}.jpg`
  const storage = createClient().storage.from(PHOTO_BUCKET)
  const options = { contentType: 'image/jpeg' }
  const results = await Promise.all([
    storage.upload(path, full, options),
    storage.upload(thumbPath(path), thumb, options),
  ])
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error
  return path
}

// URL firmada de una hora para ver una foto del bucket privado. Una consulta por foto: añadir una
// línea no vuelve a pedir ni a descargar las demás (plan, decisión 11).
export function usePhotoUrl(path: string | null) {
  return useQuery({
    queryKey: ['photos', path],
    queryFn: async () => {
      const { data, error } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .createSignedUrl(path ?? '', 3600)
      if (error) throw error
      return data.signedUrl
    },
    enabled: path !== null,
    staleTime: 50 * 60 * 1000,
  }).data
}
```

- [ ] **Step 5: Escribir el campo**

`src/components/photo-field.tsx`:

```tsx
'use client'

import { ImageIcon, LoaderCircle } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { PHOTO_TYPES } from '@/lib/photos'
import { UnreadablePhotoError } from '@/lib/use-photos'
import { cn } from '@/lib/utils'

type PhotoFieldProps = {
  value: string | null
  // URL firmada de la foto guardada (usePhotoUrl).
  url: string | undefined
  alt: string
  upload: (file: File) => Promise<string>
  onChange: (path: string | null) => void
  // Más pequeño, para el formulario del producto libre.
  compact?: boolean
}

// «Foto (opcional)» (spec de productos libres §4.7): vista previa, elegir, cambiar o quitar. Se sube
// al elegirla (plan, decisión 13) y se ve al instante con una copia local (decisión 25).
export function PhotoField({ value, url, alt, upload, onChange, compact = false }: PhotoFieldProps) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // La copia local de la foto elegida: path es null mientras se sube.
  const [local, setLocal] = useState<{ url: string; path: string | null } | null>(null)
  const localUrl = local?.url
  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl)
    },
    [localUrl],
  )
  const shown =
    local && (local.path === null || local.path === value) ? local.url : value ? url : undefined

  async function pick(file: File | undefined) {
    if (!file) return
    if (!PHOTO_TYPES.includes(file.type)) {
      setError('Elige una foto JPG, PNG o WebP.')
      return
    }
    setError(null)
    setUploading(true)
    setLocal({ url: URL.createObjectURL(file), path: null })
    try {
      const path = await upload(file)
      setLocal((current) => current && { ...current, path })
      onChange(path)
    } catch (failure) {
      setLocal(null)
      setError(
        failure instanceof UnreadablePhotoError
          ? 'No pudimos leer esta foto. Prueba con otra en JPG, PNG o WebP.'
          : 'No pudimos subir la foto. Revisa tu conexión e inténtalo de nuevo.',
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <span id={`${id}-label`} className="text-sm font-medium text-foreground">
          Foto
        </span>
        <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">Opcional</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={cn(
            'relative grid shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted text-muted-foreground',
            compact ? 'size-12' : 'size-28',
          )}
        >
          {shown ? (
            <Image
              src={shown}
              alt={alt}
              width={compact ? 48 : 112}
              height={compact ? 48 : 112}
              unoptimized
              className={cn('size-full object-contain', uploading && 'opacity-50')}
            />
          ) : (
            <ImageIcon className={compact ? 'size-5' : 'size-8'} aria-hidden />
          )}
          {uploading ? (
            <LoaderCircle className="absolute size-6 animate-spin text-foreground" aria-hidden />
          ) : null}
        </span>
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              aria-describedby={`${id}-help`}
              onClick={() => input.current?.click()}
            >
              {value ? 'Cambiar foto' : 'Elegir foto'}
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                disabled={uploading}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  setLocal(null)
                  onChange(null)
                }}
              >
                Quitar foto
              </Button>
            ) : null}
          </div>
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            JPG, PNG o WebP. Antes de guardarla se reduce a 600 px (unos 50 KB).
          </p>
          {error ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
          {uploading ? (
            <p role="status" className="sr-only">
              Subiendo la foto…
            </p>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        tabIndex={-1}
        aria-labelledby={`${id}-label`}
        className="sr-only"
        onChange={(event) => {
          void pick(event.target.files?.[0])
          // Elegir el mismo archivo otra vez vuelve a avisar.
          event.target.value = ''
        }}
      />
    </div>
  )
}
```

- [ ] **Step 6: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/photos.test.ts && pnpm exec vitest run --project components tests/components/photo-field.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS; sin errores de tipos ni de lint.

- [ ] **Step 7: Commit**

```bash
git add src/lib/photos.ts src/lib/use-photos.ts src/components/photo-field.tsx tests/unit/photos.test.ts tests/components/photo-field.test.tsx
git commit -m "feat: shrink, upload and preview optional photos with a PDF thumbnail"
```

---

### Task 17: Foto del producto del catálogo

**Files:**
- Modify:
  - `src/features/catalog/types.ts`
  - `src/features/catalog/schemas.ts`
  - `src/features/catalog/products/queries.ts`
  - `src/features/catalog/products/components/product-form.tsx`
  - `src/features/catalog/products/components/product-dialog.tsx`
  - `src/features/catalog/products/components/product-detail.tsx`
  - los objetos de prueba de tipo `Product`, `ProductInput` o `ProductListItem` que `pnpm typecheck` señale: `image_path: null` (hoy: `tests/components/proforma-control.test.tsx`, `tests/components/proforma-hooks.test.tsx`, `tests/components/product-form.test.tsx`, `tests/components/proforma-editor.test.tsx`, `tests/unit/catalog-excel-report.test.ts`, `tests/unit/catalog-excel-price-list.test.ts`, `tests/unit/catalog-category-summary.test.ts`, `tests/integration/catalog-actions.test.ts`)
- Test: `tests/components/product-form.test.tsx`, `tests/unit/catalog-schemas.test.ts`, `tests/integration/photos-storage.test.ts`

**Interfaces:**
- Consumes: `photoPathSchema`, `thumbPath`, `uploadPhoto`, `usePhotoUrl`, `PhotoField` (tarea 16); `products.image_path` (tarea 15).
- Produces:
  - `ProductInput.image_path: string | null` (y por tanto `Product` y `ProductListItem`);
  - `productSchema.shape.image_path` (opcional, solo `products/<uuid>.jpg`);
  - `ProductForm({ …, uploadPhoto })`.

- [ ] **Step 1: Escribir las pruebas**

`tests/unit/catalog-schemas.test.ts`, en el bloque de `productSchema`:

```ts
  it('la foto es opcional y solo acepta una ruta de products/', () => {
    const base = {
      code: 'LAP-1',
      name: 'Laptop',
      category_id: '7a2d3b8f-4c5e-4d6f-9a0b-1c2d3e4f5a6b',
      unit_price: '10',
    }
    expect(productSchema.parse(base).image_path).toBeNull()
    expect(
      productSchema.parse({ ...base, image_path: 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg' })
        .image_path,
    ).toBe('products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg')
    expect(
      productSchema.safeParse({
        ...base,
        image_path: 'lines/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg',
      }).success,
    ).toBe(false)
  })
```

`tests/components/product-form.test.tsx`:
- envuelve el `render` de `renderForm` en `<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>` (importado de `@tanstack/react-query`) y pasa `uploadPhoto={vi.fn(async () => '')}` antes de `{...props}`;
- en «envía los datos normalizados…», añade `image_path: null` al objeto esperado;
- añade la prueba:

```tsx
  it('sube la foto elegida y la envía con el producto', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:foto')
    URL.revokeObjectURL = vi.fn()
    const path = 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'
    const uploadPhoto = vi.fn(async () => path)
    const { onSubmit, user } = renderForm({ uploadPhoto })
    await fillValid(user)
    await user.upload(
      screen.getByLabelText('Foto'),
      new File(['foto'], 'laptop.png', { type: 'image/png' }),
    )
    await vi.waitFor(() => expect(uploadPhoto).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Crear producto' }))
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ image_path: path })),
    )
  })
```

`tests/integration/photos-storage.test.ts`: importa `createProductRow` y `updateProductRow` desde `@/features/catalog/products/repository` y `getProduct` desde `@/features/catalog/products/queries`, y en `describe('foto del producto', …)`:

```ts
  it('se guarda, se lee y se quita con el producto', async () => {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    const path = `products/${randomUUID()}.jpg`
    const input = {
      code: 'LAP-002',
      name: 'Laptop con foto',
      description: null,
      category_id: rows[0].id,
      unit_price: '100.00',
      image_path: path,
    }
    const created = await createProductRow(supabase, input)
    if (!created.ok) throw new Error(created.error.message)
    expect(await getProduct(supabase, created.data.id)).toMatchObject({ image_path: path })
    await updateProductRow(supabase, created.data.id, { ...input, image_path: null })
    expect(await getProduct(supabase, created.data.id)).toMatchObject({ image_path: null })
  })
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/catalog-schemas.test.ts && pnpm exec vitest run --project components tests/components/product-form.test.tsx`
Expected: FAIL: el schema no conoce `image_path` y el formulario no tiene «Foto».

- [ ] **Step 3: Llevar la foto por el catálogo**

`src/features/catalog/types.ts`, en `ProductInput`, después de `unit_price`:

```ts
  image_path: string | null // foto opcional: products/<uuid>.jpg
```

`src/features/catalog/schemas.ts`: importa `import { photoPathSchema } from '@/lib/photos'` y, al final de `productSchema`:

```ts
  // Opcional (spec de productos libres §4.7): solo una ruta products/<uuid>.jpg del bucket.
  image_path: photoPathSchema('products')
    .nullish()
    .transform((path) => path ?? null),
```

`src/features/catalog/products/queries.ts`: `productColumns` termina en `…, created_at, updated_at, image_path'` y `itemSchema` añade `image_path: z.string().nullable(),`.

Añade `image_path: null` a los objetos de prueba que señale `pnpm typecheck` (ver **Files**).

- [ ] **Step 4: Añadir el campo al formulario y la foto a la ficha**

`src/features/catalog/products/components/product-form.tsx`:
- importa `PhotoField` desde `@/components/photo-field`, `thumbPath` desde `@/lib/photos` y `usePhotoUrl` desde `@/lib/use-photos`;
- `FIELDS` añade `'image_path'`;
- `valuesSchema` añade `image_path: z.string().nullable().default(null),` (los borradores anteriores no la tienen);
- `EMPTY` añade `image_path: null`; `toFormValues` añade `image_path: values.image_path ?? null`; `initial` añade `image_path: product?.image_path ?? null`;
- `differs` compara también los vacíos:

```ts
const differs = (values: WatchedValues, from: FormValues) =>
  FIELDS.some((field) => (values[field] ?? '') !== (from[field] ?? ''))
```

- `ProductFormProps` añade:

```ts
  // Sube la foto elegida y devuelve su ruta (spec de productos libres §4.7).
  uploadPhoto: (file: File) => Promise<string>
```

- recibe `uploadPhoto` y saca `setValue` de `useForm`;
- después de `const live = useWatch({ control })`:

```ts
  // La miniatura basta para la vista previa del formulario.
  const photoUrl = usePhotoUrl(live.image_path ? thumbPath(live.image_path) : null)
```

- primer campo del formulario, después de los avisos de borrador y de error del servidor:

```tsx
        <div className="grid gap-1 sm:col-span-2">
          <PhotoField
            value={live.image_path ?? null}
            url={photoUrl}
            alt={`Foto de ${live.name?.trim() || 'tu producto'}`}
            upload={uploadPhoto}
            onChange={(path) => setValue('image_path', path, { shouldDirty: true })}
          />
          {errors.image_path ? (
            <p className="text-xs font-medium text-destructive">{errors.image_path.message}</p>
          ) : null}
        </div>
```

`src/features/catalog/products/components/product-dialog.tsx`: importa `uploadPhoto` desde `@/lib/use-photos` y pasa `uploadPhoto={(file) => uploadPhoto('products', file)}` a `ProductForm`.

`src/features/catalog/products/components/product-detail.tsx`: importa `Image` de `next/image` y `usePhotoUrl` de `@/lib/use-photos`; después de `const data = product ?? shown` (la ficha usa la foto de 600 px):

```ts
  const photo = usePhotoUrl(data?.image_path ?? null)
```

y, como primer bloque dentro de `<div className="grid gap-5 overflow-y-auto px-6 py-5">`:

```tsx
              {data.image_path ? (
                <span className="grid h-56 place-items-center overflow-hidden rounded-xl border bg-muted">
                  {photo ? (
                    <Image
                      src={photo}
                      alt={`Foto de ${data.name}`}
                      width={480}
                      height={224}
                      unoptimized
                      className="size-full object-contain"
                    />
                  ) : null}
                </span>
              ) : null}
```

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm test && pnpm exec vitest run --project integration tests/integration/photos-storage.test.ts tests/integration/catalog-actions.test.ts tests/integration/catalog-import-service.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS en todo; la carga masiva no toca las fotos.

- [ ] **Step 6: Commit**

Añade también por nombre cada archivo de prueba al que pusiste `image_path: null`.

```bash
git add src/features/catalog/types.ts src/features/catalog/schemas.ts src/features/catalog/products/queries.ts src/features/catalog/products/components/product-form.tsx src/features/catalog/products/components/product-dialog.tsx src/features/catalog/products/components/product-detail.tsx tests/unit/catalog-schemas.test.ts tests/components/product-form.test.tsx tests/integration/photos-storage.test.ts
git commit -m "feat: add an optional photo to catalog products"
```

---

### Task 18: Columna «FOTO» en el PDF

**Files:**
- Create: `src/features/proforma/document/photos.ts`, `tests/integration/proforma-photos.test.ts`
- Modify:
  - `src/features/proforma/draft.ts`
  - `src/features/proforma/components/proforma-free-line.tsx`
  - `src/features/proforma/document/input.ts`
  - `src/features/proforma/document/model.ts`
  - `src/features/proforma/document/pdf.tsx`
  - `src/features/proforma/document/service.ts`
  - `src/features/proforma/history/service.ts`
  - `tests/support/proforma.ts`
  - los objetos de prueba de tipo `DocumentInput` y los productos que se pasan a `addProduct` que `pnpm typecheck` señale (hoy: `tests/integration/proforma-document.test.ts`, `tests/integration/whatsapp-service.test.ts`, `tests/integration/proforma-history.test.ts`, `tests/components/proforma-store.test.tsx`)
- Test: `tests/unit/document-model.test.ts`, `tests/unit/proforma-draft.test.ts`, `tests/integration/proforma-photos.test.ts`

**Interfaces:**
- Consumes: `photoPathSchema`, `PHOTO_BUCKET` (tarea 16); `ProductListItem.image_path` (tarea 17).
- Produces:
  - en el borrador: `ProformaLine.imagePath: string | null` y `ProformaDraft.includePhotos: boolean` (`true` por defecto); `addProduct` copia `image_path`; `FreeLineInput` y `freeLineSchema` llevan `imagePath` (solo `lines/<uuid>.jpg`);
  - en `DocumentInput`: `lines[].imagePath` (solo rutas del bucket; `null` por defecto) e `includePhotos` (`false` por defecto, para navegadores con la versión anterior);
  - en `DocumentModel`: `photos: boolean` y `rows[].photo: string | null`;
  - `PDF_PHOTO_BUDGET = 2_500_000` y `loadPhotos(supabase, paths, budget?)` → `Map<ruta, Buffer>`: la miniatura de cada foto (o la de 600 px si faltara), solo JPEG que se pudieron leer y hasta el tope de bytes;
  - `renderProformaPdf(model, images?)`.

- [ ] **Step 1: Escribir las pruebas**

`tests/support/proforma.ts`: en `line`, añade `imagePath: null,` antes de `...overrides`.

`tests/unit/proforma-draft.test.ts`:
- `laptop` y `printer` añaden `image_path: null`;
- en el objeto esperado de la primera prueba y en el de «se añaden con su código opcional…», añade `imagePath: null`; el `service` de «productos libres» añade `imagePath: null`;
- en «lee los borradores anteriores…», cambia la comprobación por:

```ts
    const parsed = draftSchema.parse(old)
    expect(parsed.lines[0]).toMatchObject({ id: 'p1', productId: 'p1', imagePath: null })
    expect(parsed.includePhotos).toBe(true)
```

- añade:

```ts
  it('copia la foto del producto al añadirlo', () => {
    const path = 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'
    expect(addProduct(EMPTY_DRAFT, { ...laptop, image_path: path }).lines[0].imagePath).toBe(path)
  })
```

`tests/unit/document-model.test.ts`:
- en «arma todos los textos del documento del ejemplo E1», añade `photos: false` al objeto esperado y `photo: null` a cada una de sus filas;
- al final:

```ts
describe('fotos', () => {
  const path = 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'
  const withPhoto = (includePhotos: boolean): DocumentInput => ({
    ...e1,
    includePhotos,
    lines: e1.lines.map((item, index) => (index === 0 ? { ...item, imagePath: path } : item)),
  })

  it('con el interruptor, la columna lleva la ruta de cada foto', () => {
    const model = buildDocumentModel(withPhoto(true), company, now)
    expect(model.photos).toBe(true)
    expect(model.rows.map((row) => row.photo)).toEqual([path, null, null])
  })

  it('sin el interruptor o sin ninguna foto, no hay columna', () => {
    expect(buildDocumentModel(withPhoto(false), company, now)).toMatchObject({ photos: false })
    expect(buildDocumentModel({ ...e1, includePhotos: true }, company, now).photos).toBe(false)
  })

  it('el servidor solo acepta rutas de fotos del bucket', () => {
    for (const imagePath of [
      'otros/foto.jpg',
      'https://otro.sitio/foto.jpg',
      'products/../8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg',
    ]) {
      const value = { ...e1, lines: [{ ...e1.lines[0], imagePath }] }
      expect(documentInputSchema.safeParse(value).success, imagePath).toBe(false)
    }
  })

  it('lee lo que envía un navegador con la versión anterior, sin fotos', () => {
    const old: Record<string, unknown> = {
      ...e1,
      lines: e1.lines.map(({ code, name, description, unitPrice, quantity }) => ({
        code,
        name,
        description,
        unitPrice,
        quantity,
      })),
    }
    delete old.includePhotos
    const parsed = documentInputSchema.parse(old)
    expect(parsed.includePhotos).toBe(false)
    expect(parsed.lines[0].imagePath).toBeNull()
  })
})
```

`tests/integration/proforma-photos.test.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentInput } from '@/features/proforma/document/input'
import { createProformaDocument } from '@/features/proforma/document/service'
import { storedProformaDocument } from '@/features/proforma/history/service'
import { loadPhotos } from '@/features/proforma/document/photos'
import { thumbPath } from '@/lib/photos'
import { adminClient, ensureUser, signedInClient } from '../support/local-supabase'
import { pdfText } from '../support/pdf-text'
import { connect, fillCompanyProfile, resetCompanyProfile, resetProformas } from './db'

const password = 'fotos-pdf-123'
const owner = { email: 'fotos-pdf@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const jpeg = readFileSync('public/brand/ventronix-logo-proforma.jpg')
// Con su miniatura, como las sube la app.
const photo = `lines/${randomUUID()}.jpg`
// Sin miniatura: el PDF usa la de 600 px.
const withoutThumb = `lines/${randomUUID()}.jpg`
const notJpeg = `lines/${randomUUID()}.jpg`
const missing = `lines/${randomUUID()}.jpg`
const uploaded = [photo, thumbPath(photo), withoutThumb, notJpeg]

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  supabase = await signedInClient(owner.email, password)
  const storage = supabase.storage.from('images')
  const options = { contentType: 'image/jpeg' }
  for (const path of [photo, thumbPath(photo), withoutThumb]) {
    await storage.upload(path, jpeg, options)
  }
  // Un PNG con nombre .jpg: el bucket lo deja subir y el PDF no lo dibuja.
  await storage.upload(notJpeg, readFileSync('public/brand/ventronix-mark.png'), options)
})

afterAll(async () => {
  await adminClient().storage.from('images').remove(uploaded)
  await resetProformas(db)
  await db.end()
})

beforeEach(async () => {
  await resetProformas(db)
  await resetCompanyProfile(db)
  await fillCompanyProfile(db)
})

const line = (index: number, imagePath: string | null) => ({
  code: `LAP-${index}`,
  name: `Laptop ${index}`,
  description: null,
  unitPrice: '100.00',
  quantity: 1,
  imagePath,
})

const input = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  draft: false,
  number: 1,
  issuedAt: '2026-09-30T15:00:00.000Z',
  lines: [line(1, photo), line(2, null)],
  client: { name: 'Cliente de ejemplo S.A.C.', document: '', phone: '', address: '', deliveryTime: '' },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  includePhotos: true,
  ...overrides,
})

// El logotipo y la franja de marcas son las dos imágenes de siempre.
const images = (pdf: Buffer) => pdf.toString('latin1').match(/\/Subtype\s*\/Image\b/g)?.length ?? 0

async function generate(value: DocumentInput) {
  const result = await createProformaDocument(supabase, value)
  if (!result.ok) throw new Error(result.error.message)
  return Buffer.from(result.data.base64, 'base64')
}

describe('fotos en el PDF', () => {
  it('con el interruptor, la columna lleva la foto y la nota', async () => {
    const pdf = await generate(input())
    expect(images(pdf)).toBe(3)
    expect(pdfText(pdf)).toContain('Imágenes referenciales.')
  })

  it('sin el interruptor, el PDF queda como siempre', async () => {
    const pdf = await generate(input({ includePhotos: false }))
    expect(images(pdf)).toBe(2)
    expect(pdfText(pdf)).not.toContain('Imágenes referenciales.')
  })

  it('sin miniatura usa la foto de 600 px', async () => {
    const pdf = await generate(input({ lines: [line(1, withoutThumb)] }))
    expect(images(pdf)).toBe(3)
  })

  it('las fotos que pasan del tope de bytes se dejan fuera', async () => {
    expect((await loadPhotos(supabase, [photo, null], 1)).size).toBe(0)
    expect((await loadPhotos(supabase, [photo, photo])).size).toBe(1)
  })

  it('una foto que falta o que no es JPEG se deja fuera y el PDF se genera igual', async () => {
    const pdf = await generate(input({ lines: [line(1, missing), line(2, notJpeg)] }))
    expect(images(pdf)).toBe(2)
    expect(pdfText(pdf)).toContain('Imágenes referenciales.')
  })

  it('muchas filas con fotos y productos libres sin código pasan al diseño compacto', async () => {
    const lines = Array.from({ length: 31 }, (_, index) =>
      index % 2 === 0
        ? line(index, photo)
        : {
            ...line(index, null),
            code: '',
            name: `Servicio de instalación y configuración en sitio número ${index}`,
          },
    )
    const text = pdfText(await generate(input({ lines })))
    expect(text).toContain('—')
    expect(text).toContain('Imágenes referenciales.')
  })

  it('el historial vuelve a armar el PDF con su foto', async () => {
    await generate(input())
    const { rows } = await db.query<{ id: string }>('select id from public.proformas')
    const result = await storedProformaDocument(supabase, rows[0].id)
    if (!result.ok) throw new Error(result.error.message)
    expect(images(Buffer.from(result.data.base64, 'base64'))).toBe(3)
  })
})
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project unit tests/unit/document-model.test.ts tests/unit/proforma-draft.test.ts && pnpm exec vitest run --project integration tests/integration/proforma-photos.test.ts`
Expected: FAIL. El modelo no tiene `photos`, las líneas no tienen `imagePath` y el PDF no dibuja fotos (`images` da 2).

- [ ] **Step 3: Llevar la foto por el borrador y la entrada del documento**

`src/features/proforma/draft.ts`:
- importa `import { photoPathSchema } from '@/lib/photos'`;
- en el objeto de `lineSchema`, después de `quantity`:

```ts
    // La foto copiada del producto o la subida para el libre (spec de productos libres §4.3).
    imagePath: z.string().nullable().default(null),
```

- en `draftSchema`, después de `shipping`:

```ts
  // «Incluir fotos en el PDF» (spec §4.5): activado; solo se ve si alguna línea tiene foto.
  includePhotos: z.boolean().default(true),
```

- `ProductData` añade `'image_path'` a su `Pick`; `EMPTY_DRAFT` añade `includePhotos: true,`;
- en `addProduct`, la línea nueva añade `imagePath: product.image_path,`;
- `FreeLineInput` añade `'imagePath'` a su `Pick`;
- `freeLineSchema` añade `imagePath: photoPathSchema('lines').nullable(),`.

`src/features/proforma/components/proforma-free-line.tsx`: `EMPTY` añade `imagePath: null`.

`src/features/proforma/document/input.ts`:
- importa `import { photoPathSchema } from '@/lib/photos'`;
- en cada línea, después de `quantity`:

```ts
        // Solo rutas del bucket (spec §8). Los navegadores con la versión anterior no la envían.
        imagePath: photoPathSchema().nullable().default(null),
```

- después de `shipping`:

```ts
  // «Incluir fotos en el PDF» (spec §4.5).
  includePhotos: z.boolean().default(false),
```

- en `documentInput`, las líneas copian también `imagePath` (`({ code, name, description, unitPrice, quantity, imagePath }) => ({ code, name, description, unitPrice, quantity, imagePath })`) y se añade `includePhotos: draft.includePhotos,`.

Añade `imagePath: null` a las líneas e `includePhotos: false` a los `DocumentInput` de prueba que señale `pnpm typecheck`, e `image_path: null` al producto de `tests/components/proforma-store.test.tsx`.

- [ ] **Step 4: Dibujar la columna «FOTO»**

`src/features/proforma/document/model.ts`:
- en `DocumentModel`, antes de `rows`:

```ts
  // Columna «FOTO» (spec de productos libres §4.5): con el interruptor y alguna línea con foto.
  photos: boolean
```

- y en el tipo de cada fila, `photo: string | null // la ruta de la foto, si va en el PDF`;
- en `buildDocumentModel`, antes del `return`:

```ts
  const photos = input.includePhotos && input.lines.some((line) => line.imagePath !== null)
```

- en el objeto devuelto, `photos,` antes de `rows`, y cada fila añade `photo: photos ? line.imagePath : null,`.

`src/features/proforma/document/photos.ts`:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PHOTO_BUCKET, thumbPath } from '@/lib/photos'
import type { Database } from '@/lib/supabase/database.types'

// Un JPEG empieza con FF D8 FF: react-pdf no dibuja otra cosa con format 'jpg'.
const isJpeg = (bytes: Buffer) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff

// ponytail: tope fijo de bytes de fotos por PDF. Con miniaturas de unos 12 KB caben unas 200; las
// demás se dejan fuera para que el PDF en base64 no pase los 4,5 MB de una respuesta de Vercel.
// Si hiciera falta más, el PDF tendría que viajar por Storage en vez de en la respuesta.
export const PDF_PHOTO_BUDGET = 2_500_000

// Las fotos del PDF se descargan del bucket con la sesión de la cuenta (spec §7): la miniatura y,
// si faltara, la de 600 px. Una que no se puede leer se deja fuera: la fila sale sin foto y el PDF
// se genera igual (plan, decisión 12).
export async function loadPhotos(
  supabase: SupabaseClient<Database>,
  paths: (string | null)[],
  budget = PDF_PHOTO_BUDGET,
): Promise<Map<string, Buffer>> {
  const storage = supabase.storage.from(PHOTO_BUCKET)
  async function read(path: string) {
    for (const candidate of [thumbPath(path), path]) {
      const { data } = await storage.download(candidate)
      const bytes = data ? Buffer.from(await data.arrayBuffer()) : null
      if (bytes && isJpeg(bytes)) return bytes
    }
    console.error('[proforma] foto omitida:', path)
    return null
  }
  const unique = [...new Set(paths.filter((path): path is string => path !== null))]
  const loaded = await Promise.all(unique.map(read))
  // En el orden de las líneas: si hay que dejar fotos fuera, son las últimas.
  const photos = new Map<string, Buffer>()
  let used = 0
  unique.forEach((path, index) => {
    const bytes = loaded[index]
    if (!bytes || used + bytes.length > budget) return
    used += bytes.length
    photos.set(path, bytes)
  })
  return photos
}
```

`src/features/proforma/document/pdf.tsx`:
- en `sheet()`, después de `quantity`:

```ts
    // Columna «FOTO» (spec de productos libres §4.5): unos 1,5 cm, con la foto entera, sin recortar.
    photo: { width: pick(46, 34), paddingHorizontal: 4 },
    photoImage: {
      width: pick(38, 26),
      height: pick(38, 26),
      objectFit: 'contain',
      backgroundColor: '#f1f3ee',
      borderRadius: 3,
    },
    photoNote: { marginTop: pick(4, 2), fontSize: pick(8, 7), color: color.muted },
```

- después de `const codeChars = …`:

```ts
const NO_PHOTOS = new Map<string, Buffer>()
```

- `TableHead` recibe `photos: boolean` y, antes de `CANT.`, dibuja `{photos ? <Text style={[s.th, s.photo]}>FOTO</Text> : null}`;
- `ProformaPdf` recibe `images = NO_PHOTOS` (`images?: Map<string, Buffer>` en sus props) y pasa `photos={model.photos}` a `TableHead`;
- el `map` de las filas pasa a un cuerpo con bloque, con la celda de la foto primero:

```tsx
          {model.rows.map((row, index) => {
            const photo = row.photo ? images.get(row.photo) : undefined
            return (
              <View key={index} style={s.row} wrap={false}>
                {model.photos ? (
                  <View style={[s.td, s.photo]}>
                    {photo ? (
                      // eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es un <img>
                      <Image src={{ data: photo, format: 'jpg' }} style={s.photoImage} />
                    ) : null}
                  </View>
                ) : null}
                <Text style={[s.td, s.quantity]}>{row.quantity}</Text>
                <Text style={[s.td, s.code, s.mono]}>{wrapCode(row.code, codeChars(compact))}</Text>
                <View style={[s.td, s.description]}>
                  {compact ? (
                    // Una línea por producto: nombre y descripción juntos, recortados si no caben.
                    <Text style={s.oneLine}>
                      <Text style={s.semibold}>{row.name}</Text>
                      {row.description ? (
                        <Text style={s.detail}>{`  ·  ${row.description}`}</Text>
                      ) : null}
                    </Text>
                  ) : (
                    <>
                      <Words style={s.semibold}>{row.name}</Words>
                      {row.description ? <Words style={s.detail}>{row.description}</Words> : null}
                    </>
                  )}
                </View>
                <Text style={[s.td, s.unit]}>{row.unitPrice}</Text>
                <Text style={[s.td, s.lineTotal, s.semibold]}>{row.total}</Text>
              </View>
            )
          })}
          {model.photos ? <Text style={s.photoNote}>Imágenes referenciales.</Text> : null}
```

(las celdas de cantidad, código, descripción, precio unitario y total son las de hoy, sin cambios).

- `renderProformaPdf` recibe las fotos:

```tsx
export async function renderProformaPdf(model: DocumentModel, images = NO_PHOTOS) {
  const pdf = await renderToBuffer(<ProformaPdf model={model} images={images} />)
  return pageCount(pdf) === 1
    ? pdf
    : renderToBuffer(<ProformaPdf model={model} images={images} compact />)
}
```

`src/features/proforma/document/service.ts`: importa `loadPhotos` desde `./photos` y cambia `const pdf = await renderProformaPdf(model)` por:

```ts
  const images = await loadPhotos(supabase, model.rows.map((row) => row.photo))
  const pdf = await renderProformaPdf(model, images)
```

`src/features/proforma/history/service.ts`: importa `loadPhotos` desde `'../document/photos'` y en `renderStored`:

```ts
  const [pdf, current] = await Promise.all([
    loadPhotos(supabase, model.rows.map((row) => row.photo)).then((images) =>
      renderProformaPdf(model, images),
    ),
    getCompanyProfile(supabase),
  ])
```

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project unit tests/unit/document-model.test.ts tests/unit/proforma-draft.test.ts && pnpm exec vitest run --project integration tests/integration/proforma-photos.test.ts tests/integration/proforma-document.test.ts tests/integration/proforma-history.test.ts tests/integration/whatsapp-service.test.ts && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS en todo. Las pruebas del documento sin fotos siguen sacando dos imágenes.

- [ ] **Step 6: Commit**

Añade también por nombre cada archivo de prueba que actualizaste por `pnpm typecheck`.

```bash
git add src/features/proforma/draft.ts src/features/proforma/components/proforma-free-line.tsx src/features/proforma/document/input.ts src/features/proforma/document/model.ts src/features/proforma/document/photos.ts src/features/proforma/document/pdf.tsx src/features/proforma/document/service.ts src/features/proforma/history/service.ts tests/support/proforma.ts tests/unit/document-model.test.ts tests/unit/proforma-draft.test.ts tests/integration/proforma-photos.test.ts
git commit -m "feat: print product photos in the proforma PDF"
```

---

### Task 19: Fotos en la proforma: producto libre, miniaturas e interruptor

**Files:**
- Modify:
  - `src/features/proforma/draft.ts`
  - `src/features/proforma/components/proforma-free-line.tsx`
  - `src/features/proforma/components/proforma-lines.tsx`
  - `src/features/proforma/components/proforma-summary.tsx`
  - `src/features/proforma/components/proforma-editor.tsx`
  - `src/features/proforma/components/proforma-dialog.tsx`
- Test: `tests/components/proforma-editor.test.tsx`, `tests/components/proforma-panel.test.tsx`

**Interfaces:**
- Consumes: `PhotoField`, `usePhotoUrl`, `thumbPath`, `uploadPhoto` (tarea 16); `imagePath` e `includePhotos` del borrador (tarea 18).
- Produces:
  - `setIncludePhotos(draft, includePhotos)`;
  - `ProformaEditorProps.uploadPhoto: (file: File) => Promise<string>`, que llega a `FreeLineForm({ onClose, uploadPhoto })`;
  - `PhotosSwitch()` en `proforma-summary.tsx`;
  - cada línea muestra su miniatura (una consulta por foto) o «Sin foto».

- [ ] **Step 1: Escribir las pruebas**

`tests/components/proforma-panel.test.tsx`: en `renderPanel`, añade `uploadPhoto: vi.fn(async () => ''),` a `props`.

`tests/components/proforma-editor.test.tsx`: en `renderEditor`, añade `uploadPhoto: vi.fn(async () => 'lines/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'),` a `props`, y:

```tsx
  describe('fotos', () => {
    const photo = 'products/8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c.jpg'

    it('el producto libre sube su foto; las líneas sin foto dicen «Sin foto»', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:foto')
      URL.revokeObjectURL = vi.fn()
      seedProforma({ lines: [line()], client: withClient })
      const { uploadPhoto, user } = renderEditor()
      await user.click(screen.getByRole('button', { name: 'Añadir producto libre' }))
      const form = within(screen.getByRole('form', { name: 'Añadir producto libre' }))
      await user.type(form.getByLabelText('Descripción'), 'Cable HDMI')
      await user.type(form.getByLabelText('Precio con IGV (S/)'), '25')
      await user.upload(form.getByLabelText('Foto'), new File(['x'], 'cable.png', { type: 'image/png' }))
      await vi.waitFor(() => expect(uploadPhoto).toHaveBeenCalled())
      await user.click(form.getByRole('button', { name: 'Añadir a la proforma' }))
      expect(screen.getAllByText('Sin foto')).toHaveLength(1)
      expect(screen.getByRole('switch', { name: /Incluir fotos en el PDF/ })).toBeChecked()
    })

    it('«Incluir fotos en el PDF» se puede apagar y viaja con la vista previa', async () => {
      seedProforma({ lines: [line({ imagePath: photo })] })
      URL.createObjectURL = vi.fn(() => 'blob:borrador')
      URL.revokeObjectURL = vi.fn()
      const tab = { location: { href: '' }, close: vi.fn() } as unknown as Window
      const open = vi.spyOn(window, 'open').mockReturnValue(tab)
      const { generatePdf, user } = renderEditor()
      await user.click(screen.getByRole('switch', { name: /Incluir fotos en el PDF/ }))
      await user.click(screen.getByRole('button', { name: 'Vista previa' }))
      expect(generatePdf).toHaveBeenCalledWith(
        expect.objectContaining({
          includePhotos: false,
          lines: [expect.objectContaining({ imagePath: photo })],
        }),
      )
      open.mockRestore()
    })

    it('sin fotos no aparece el interruptor', () => {
      seedProforma({ lines: [line()] })
      renderEditor()
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })
  })
```

- [ ] **Step 2: Ejecutar las pruebas y ver que fallan**

Run: `pnpm exec vitest run --project components tests/components/proforma-editor.test.tsx -t "fotos"`
Expected: FAIL: el formulario no tiene «Foto», las líneas no dicen «Sin foto» y no hay interruptor.

- [ ] **Step 3: Interruptor y miniaturas**

`src/features/proforma/draft.ts`, después de `patchConditions`:

```ts
export const setIncludePhotos = (draft: ProformaDraft, includePhotos: boolean): ProformaDraft => ({
  ...draft,
  includePhotos,
})
```

`src/features/proforma/components/proforma-summary.tsx`: importa `setIncludePhotos` desde `../draft` y añade:

```tsx
// «Incluir fotos en el PDF» (spec de productos libres §4.3 y §4.5): solo si alguna línea tiene foto.
export function PhotosSwitch() {
  const { draft, update } = useProforma()
  if (!draft.lines.some((line) => line.imagePath !== null)) return null
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3">
      <input
        type="checkbox"
        role="switch"
        checked={draft.includePhotos}
        aria-describedby="photos-switch-help"
        onChange={(event) => update((current) => setIncludePhotos(current, event.target.checked))}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-input transition-colors peer-checked:bg-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:top-0.75 after:left-0.75 after:size-4.5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:after:translate-x-4 motion-reduce:transition-none motion-reduce:after:transition-none"
      />
      <span className="grid gap-0.5">
        <span className="text-sm font-bold text-foreground">Incluir fotos en el PDF</span>
        <span id="photos-switch-help" className="text-xs text-muted-foreground">
          Con fotos entran unos 10 a 12 productos por hoja. Sin fotos, el PDF queda como hoy.
        </span>
      </span>
    </label>
  )
}
```

`src/features/proforma/components/proforma-editor.tsx`:
- importa `PhotosSwitch` junto a `ProformaSummary`;
- `ProformaEditorProps` añade:

```ts
  // Sube la foto de un producto libre y devuelve su ruta (spec de productos libres §4.3).
  uploadPhoto: (file: File) => Promise<string>
```

- recibe `uploadPhoto` y pásalo a `ProformaLines`;
- dentro de `<ProformaSummary>`, antes del botón «Generar proforma», `<PhotosSwitch />`.

`src/features/proforma/components/proforma-lines.tsx`:
- importa `Image` de `next/image`, `thumbPath` de `@/lib/photos` y `usePhotoUrl` de `@/lib/use-photos`;
- `ProformaLines` recibe `uploadPhoto: (file: File) => Promise<string>` y se lo pasa a `<FreeLineForm uploadPhoto={uploadPhoto} … />`;
- `LineRow` pide su miniatura, una consulta por foto (plan, decisión 11), al principio del componente: `const photoUrl = usePhotoUrl(line.imagePath ? thumbPath(line.imagePath) : null)`;
- la cuadrícula de `LineRow` gana una primera columna de 48 px:
  - el `<li>`: `grid-cols-[48px_minmax(0,1fr)_auto]` en móvil y `sm:grid-cols-[48px_minmax(0,1fr)_118px_132px_104px_36px]`;
  - el contenedor de los controles: `col-span-3` (en vez de `col-span-2`);
  - el botón de quitar: `col-start-3 row-start-1` (en vez de `col-start-2 row-start-1`);
- primer elemento del `<li>`:

```tsx
      {/* Su foto, o «Sin foto» (spec de productos libres §4.3). */}
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-dashed border-input bg-muted/40 text-[10px] text-muted-foreground">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={`Foto de ${line.name}`}
            width={48}
            height={48}
            unoptimized
            className="size-full object-contain"
          />
        ) : line.imagePath ? null : (
          'Sin foto'
        )}
      </span>
```

- [ ] **Step 4: La foto del producto libre**

`src/features/proforma/components/proforma-free-line.tsx`:
- importa `PhotoField` de `@/components/photo-field`, `thumbPath` de `@/lib/photos`, `usePhotoUrl` de `@/lib/use-photos` y `useWatch` de `react-hook-form`;
- `FreeLineForm({ onClose, uploadPhoto }: { onClose: () => void; uploadPhoto: (file: File) => Promise<string> })`;
- saca `control` y `setValue` de `useForm`, y después:

```ts
  const imagePath = useWatch({ control, name: 'imagePath' })
  const photoUrl = usePhotoUrl(imagePath ? thumbPath(imagePath) : null)
```

- en la fila de Cantidad y Precio, después del precio:

```tsx
        <div className="min-w-0 flex-1 basis-56">
          <PhotoField
            compact
            value={imagePath}
            url={photoUrl}
            alt="Foto del producto libre"
            upload={uploadPhoto}
            onChange={(path) => setValue('imagePath', path)}
          />
        </div>
```

`src/features/proforma/components/proforma-dialog.tsx`: importa `uploadPhoto` desde `@/lib/use-photos` y pasa `uploadPhoto={(file) => uploadPhoto('lines', file)}` a `ProformaPanel`.

- [ ] **Step 5: Ejecutar las pruebas, los tipos y el lint**

Run: `pnpm exec vitest run --project components tests/components/proforma-editor.test.tsx tests/components/proforma-panel.test.tsx && pnpm test && pnpm typecheck && pnpm lint`
Expected: PASS en todo.

- [ ] **Step 6: Commit**

```bash
git add src/features/proforma/draft.ts src/features/proforma/components/proforma-free-line.tsx src/features/proforma/components/proforma-lines.tsx src/features/proforma/components/proforma-summary.tsx src/features/proforma/components/proforma-editor.tsx src/features/proforma/components/proforma-dialog.tsx tests/components/proforma-editor.test.tsx tests/components/proforma-panel.test.tsx
git commit -m "feat: show line photos and choose whether the PDF includes them"
```

---

### Task 20: E2E de fotos y despliegue de la Parte D

**Files:**
- Modify: `tests/e2e/proformas.spec.ts`, `docs/deployment.md`

**Interfaces:**
- Consumes: todo lo de las tareas 15 a 19.

- [ ] **Step 1: Escribir la e2e**

`tests/e2e/proformas.spec.ts`, al final:

```ts
// Foto de prueba: el ícono de la marca (PNG). El navegador la reduce y la sube en JPEG.
const PHOTO = 'public/brand/ventronix-mark.png'

test('sube fotos del producto y del producto libre y salen en el PDF', async ({ page }) => {
  await seed()
  const db = await connect()
  try {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    await db.query(
      `insert into public.products (code, name, category_id, unit_price)
       values ('LAP-001', 'Laptop de 14 pulgadas', $1, 2590)`,
      [rows[0].id],
    )
  } finally {
    await db.end()
  }
  await login(page)

  // La foto del producto, desde su formulario.
  const list = page.getByRole('region', { name: 'Lista de productos' })
  await list.getByRole('button', { name: 'Editar Laptop de 14 pulgadas' }).click()
  const form = page.getByRole('dialog', { name: 'Editar producto' })
  await form.getByLabel('Foto').setInputFiles(PHOTO)
  await expect(form.getByRole('img', { name: 'Foto de Laptop de 14 pulgadas' })).toBeVisible()
  await form.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()
  // La lista vuelve a pedirse: el producto ya trae su foto al añadirlo.
  await page.reload()

  await list.getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' }).click()
  await page
    .getByRole('region', { name: 'Proforma' })
    .getByRole('button', { name: 'Completar proforma' })
    .click()
  const panel = dialog(page)
  await expect(panel.getByRole('img', { name: 'Foto de Laptop de 14 pulgadas' })).toBeVisible()

  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  const free = panel.getByRole('form', { name: 'Añadir producto libre' })
  await free.getByLabel('Foto').setInputFiles(PHOTO)
  await expect(free.getByRole('img', { name: 'Foto del producto libre' })).toBeVisible()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await expect(panel.getByRole('img', { name: 'Foto de Instalación en sitio' })).toBeVisible()
  await expect(panel.getByRole('switch', { name: /Incluir fotos en el PDF/ })).toBeChecked()

  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Descargar PDF' }).click()
  const pdf = readFileSync(await (await download).path())
  // El logotipo, la franja de marcas y las dos fotos.
  expect(pdf.toString('latin1').match(/\/Subtype\s*\/Image\b/g)).toHaveLength(4)
  expect(pdfText(pdf)).toContain('Imágenes referenciales.')
})
```

- [ ] **Step 2: Ejecutar las e2e**

Run: `pnpm exec playwright test tests/e2e/proformas.spec.ts`
Expected: PASS en PC y en móvil.

- [ ] **Step 3: Documentar el despliegue**

`docs/deployment.md`, en «Las más recientes son:», añade:

```md
- `202610060003_photos.sql`: las fotos. Crea el bucket privado `images` con sus políticas (solo la cuenta dueña lee y sube; nadie borra), añade `products.image_path` y vuelve a crear `filter_products` para devolver la foto.
```

y en la lista de comprobaciones, antes de «Cerrar sesión…»:

```md
- [ ] **Fotos:** edita `PRUEBA-001`, elige una foto y guarda: la ficha la muestra. Añádelo a una proforma con un producto libre con foto: las dos se ven en sus líneas y el PDF sale con la columna «FOTO» y «Imágenes referenciales.». Con «Incluir fotos en el PDF» apagado, sale como siempre. Cada foto ocupa unos 50 KB y su miniatura unos 12 KB (panel de Supabase › Storage).
```

- [ ] **Step 4: Ejecutar la batería completa**

Run: `pnpm validate && pnpm test:integration && pnpm exec playwright test`
Expected: PASS en todo: lint, tipos, formato, pruebas, build, integración y e2e en PC y en móvil. Tras el build, recuerda al usuario reiniciar su `pnpm start`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/proformas.spec.ts docs/deployment.md
git commit -m "test: cover product and free-line photos end to end"
```
