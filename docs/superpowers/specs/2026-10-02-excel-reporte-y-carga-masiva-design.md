# Filtro de fecha, reporte en Excel y carga masiva de productos

Fecha: 02-10-2026. Estado: diseño aprobado en conversación; pendiente de revisar este documento.

Parte del módulo de productos ([spec del catálogo](2026-09-29-catalogo-design.md)). Reglas del proyecto: [PROJECT_CONTEXT.md](../../../PROJECT_CONTEXT.md).

## 1. Objetivo

Que quien gestiona el catálogo pueda:

1. **Filtrar los productos por fecha**, de registro o de última modificación.
2. **Descargar un reporte en Excel** de lo que está viendo, con aspecto profesional y listo para imprimir.
3. **Crear y actualizar muchos productos a la vez desde Excel**, en una pantalla guiada que muestra qué pasará con cada fila **antes** de guardar nada.

Los tres comparten el mismo formato de columnas. Por eso el reporte se puede volver a subir: descargar, cambiar precios en Excel y subir actualiza el catálogo en bloque.

Requisitos transversales pedidos: escalable, robusto, rápido, sin errores, que comunique en todo momento qué pasa, intuitivo y con un estilo moderno y agradable.

## 2. Alcance

Se entrega en **dos fases**, cada una publicable por separado y con su propio plan.

**Fase 1: filtro de fecha y reporte**

- Filtro de fecha en la lista de productos, por registro o por última modificación, con rangos rápidos y un rango personalizado.
- Fechas visibles en la ficha del producto.
- Botón «Descargar Excel» con el reporte de lo filtrado.

**Fase 2: carga masiva**

- Botón «Carga masiva» en Productos y una pantalla propia, `/products/import`, con tres pasos guiados.
- Plantilla Excel con desplegables, ayudas y una hoja de instrucciones.
- Vista previa con el resultado de cada fila, importación en un solo paso y Excel con las filas rechazadas.

**Fuera de alcance:**

- Borrar productos desde Excel: la importación nunca borra.
- Formatos CSV, `.xls` u `.ods`: solo `.xlsx`.
- Campos nuevos como imágenes o stock (PROJECT_CONTEXT §5).
- Reportes programados o enviados por correo.
- Deshacer una importación. Para eso se ofrece descargar un respaldo antes de importar (§6.6).

## 3. Decisiones

| Tema | Decisión |
| --- | --- |
| Librería Excel | **ExcelJS 4.4.0**, la más usada para Excel con estilos: colores, bordes, formatos de moneda y fecha, cabecera fija, filtros, desplegables, ayudas por celda, imágenes y lectura. Solo en el servidor (`import 'server-only'`, `serverExternalPackages`): el navegador no la descarga. Se carga con `await import('exceljs')` dentro de cada acción, para no frenar el arranque de las páginas. |
| Seguridad de la dependencia | `pnpm audit` marca una vulnerabilidad moderada en `uuid` (<11.1.1), dependencia de ExcelJS. Solo afecta a `v3/v5/v6` con búfer, y ExcelJS usa `v4()` sin búfer, así que no es explotable aquí. Aun así se fuerza `uuid` ≥ 11.1.1 con un `override` de pnpm para que la auditoría quede limpia. |
| Fecha del filtro | Por **fecha de registro** (`created_at`, opción por defecto) o por **última modificación** (`updated_at`). Rangos rápidos y personalizado. Días de **Lima** (UTC−5, sin horario de verano). |
| Estado en la URL | Con nuqs, como la búsqueda y la categoría: `date`, `dateBy`, `from` y `to` (§4.3). |
| Filtrado | **Una sola función SQL** con los filtros (búsqueda, categoría y fechas), usada por la lista y por el reporte. Así no pueden desalinearse. |
| Reporte | Lo filtrado en pantalla, como máximo **10 000 filas**. Se genera en una Server Action y llega en base64, igual que el PDF de la proforma. |
| Archivo de importación | `.xlsx`, hasta **4 MB** y **2 000 filas**. `serverActions.bodySizeLimit = '4mb'`, por el límite de 4,5 MB por petición de Vercel. |
| Validación | En el servidor, con **las mismas reglas del formulario** (`productSchema`, `categorySchema`). Se repite al confirmar: nunca se confía en lo que manda el navegador. |
| Vista previa | La calcula **la base**, con la misma lógica que la importación: nuevos, se actualizan, sin cambios y categorías nuevas. Así la vista previa y el resultado coinciden. |
| Importación | Una función SQL **transaccional**: o se guarda todo lo válido o nada. Código existente: se actualiza. Categoría nueva: se crea. Sin cambios: no se toca. Nunca borra. |
| Permisos | Todas las acciones con `withOwner`. Las funciones SQL son `security invoker`, así que aplican las políticas RLS del dueño que ya existen. |
| Pantalla | `/products/import`, dentro del módulo de productos, con migas «Productos › Carga masiva». |

## 4. Filtro de fecha (fase 1)

### 4.1 Control

En la barra fija de filtros, junto al buscador, va un botón con icono de calendario. Sin filtro dice **«Fecha»**. Con filtro muestra la selección, por ejemplo **«Registro: últimos 7 días»**, **«Modificación: hoy»** o **«Registro: 01/09/2026 – 15/09/2026»**.

Al pulsarlo se abre un panel (Popover de `radix-ui`) con:

1. **¿Qué fecha?** Un selector de dos opciones:
   - **Fecha de registro**, con la ayuda «Cuándo se creó el producto».
   - **Última modificación**, con la ayuda «Cuándo cambió por última vez: precio, nombre, categoría…».
2. **Rango**, como opciones de radio:
   - Cualquier fecha
   - Hoy
   - Últimos 7 días
   - Últimos 30 días
   - Este mes
   - Mes anterior
   - Personalizado
3. Con **Personalizado**, dos campos `<input type="date">` nativos, «Desde» y «Hasta», con `max` = hoy.
   - Si «Desde» es posterior a «Hasta», se muestra el error «La fecha "Desde" no puede ser posterior a "Hasta".» y no se aplica.
   - Si solo se completa uno de los dos, el rango queda abierto por el otro lado.
4. Botones **«Aplicar»** y **«Quitar filtro»**. Los rangos rápidos se aplican al pulsarlos; el personalizado, con «Aplicar».

### 4.2 Comportamiento

- Se combina con la búsqueda y la categoría, y vuelve a la página 1 al cambiar.
- En la cabecera de la lista aparece un chip **«Registro: últimos 7 días ✕»** para quitarlo con un clic. «Limpiar filtros» también lo quita.
- **Lista vacía por la fecha:**
  - Título: «No hay productos en esas fechas».
  - Texto: «Prueba con otro rango o quita el filtro de fecha.»
  - Acción: «Quitar filtro de fecha».
- La **ficha del producto** muestra «Registrado el 02/10/2026 · Modificado el 05/10/2026».
- **Móvil:** el botón queda en la misma barra, solo con el icono y un punto verde si hay filtro activo, y el panel ocupa el ancho de la pantalla.

### 4.3 URL

| Clave | Valores | Por defecto |
| --- | --- | --- |
| `dateBy` | `created` o `updated` | `created`, que no se escribe |
| `date` | `today`, `7d`, `30d`, `month`, `last-month` o `custom` | sin filtro |
| `from`, `to` | `AAAA-MM-DD`, solo con `date=custom` | — |

- Los rangos rápidos se guardan como **relativos**: un enlace con `date=7d` abierto mañana muestra los 7 días hasta mañana.
- Un valor inválido se ignora y vuelve al valor por defecto, como los demás parámetros.

### 4.4 Días de Lima

El navegador convierte el rango en **días de Lima**: `dateFrom` y `dateTo`, ambos incluidos. Con esos dos días se forma la clave de TanStack Query, así que al cambiar de día se pide de nuevo.

| Rango | `dateFrom` | `dateTo` |
| --- | --- | --- |
| Hoy | hoy | hoy |
| Últimos 7 días | hoy − 6 | hoy |
| Últimos 30 días | hoy − 29 | hoy |
| Este mes | día 1 del mes | hoy |
| Mes anterior | día 1 del mes anterior | último día del mes anterior |

La base convierte cada día en un instante con `(dia::timestamp at time zone 'America/Lima')` y filtra con `>= desde` y `< hasta + 1 día`.

## 5. Reporte en Excel (fase 1)

### 5.1 Botón y estados

**«Descargar Excel»**, con icono de archivo, en la cabecera de la lista junto a «Nombre A–Z». En móvil queda solo el icono, con `aria-label`.

| Estado | Qué ve el usuario |
| --- | --- |
| Normal | «Descargar Excel» |
| Sin productos que descargar | Botón desactivado, con el título «No hay productos para descargar con estos filtros.» |
| Preparando | «Preparando Excel…», con spinner, y el botón desactivado |
| Descargado | Toast «Excel descargado · 123 productos» |
| Recortado | Toast de aviso «Se descargaron los primeros 10 000 productos. Usa los filtros para descargar el resto.» |
| Error | Toast «No se pudo preparar el Excel. Revisa tu conexión e inténtalo de nuevo.» |

El archivo se llama `productos-AAAA-MM-DD.xlsx`, con la fecha de Lima.

### 5.2 Libro

**Hoja «Productos»**

- **Cabecera (filas 1 a 5):**
  - El logotipo de la marca (`public/brand/ventronix-logo-proforma.jpg`, que ya se incluye en la función de `/products`).
  - El nombre comercial de la empresa, o la razón social, o «Catálogo de productos» si no hay ninguno.
  - El título «Reporte de productos».
  - «Generado el 02/10/2026 a las 14:35 (hora de Lima)».
  - Los filtros aplicados, por ejemplo «Categoría: Laptops · Búsqueda: hp · Registro: últimos 7 días», o «Sin filtros».
  - El total, por ejemplo «123 productos».
- **Tabla, desde la fila 7:**

| Columna | Formato | Ancho |
| --- | --- | --- |
| N° | entero | 6 |
| Código | texto | 16 |
| Nombre | texto | 40 |
| Descripción | texto, con ajuste de línea | 60 |
| Categoría | texto | 20 |
| Precio unitario (S/) | número, `"S/" #,##0.00` | 18 |
| Fecha de registro | fecha, `dd/mm/yyyy` | 14 |
| Última modificación | fecha, `dd/mm/yyyy` | 16 |

- **Estilo:**
  - Cabecera de la tabla en `#121511` (el foreground de la app), con texto blanco en negrita y un borde inferior verde `#72CE0B` (el primary).
  - Filas alternas en blanco y `#F6FBEF`, y bordes finos `#E3E7DE` (el border).
  - Fuente Calibri 11: Plus Jakarta Sans no viene en Excel.
- **Uso:**
  - Cabecera fija: `frozen` hasta la fila 7.
  - Filtros de Excel (`autoFilter`) en la fila de títulos.
  - Impresión horizontal, ajustada al ancho de la página, con los títulos repetidos en cada página.
- Si hubo recorte, una fila de aviso en la cabecera: «Este reporte muestra los primeros 10 000 productos.»

**Hoja «Resumen por categoría»**

Columnas: Categoría, Productos, Precio mínimo, Precio máximo y Precio promedio, con el mismo estilo y una fila de totales al final. Se calcula en el servidor con aritmética de céntimos (`BigInt`), sin errores de redondeo.

**Propiedades del libro:** autor «Ventronix · Catálogo comercial» y fecha de creación.

**Seguridad:** todos los textos se escriben como texto, nunca como fórmula, para que un nombre que empiece por `=`, `+`, `-` o `@` no se ejecute en Excel.

### 5.3 Datos

La función SQL `export_products(...)` devuelve todas las filas filtradas, ordenadas como la lista (nombre e id), con la categoría y las dos fechas. Usa la misma función de filtrado interna que `search_products` (§8.1).

Pide como máximo 10 001 filas para saber si hubo recorte. El precio viaja como texto, igual que en la lista.

## 6. Carga masiva (fase 2)

### 6.1 Entrada

- En la cabecera de Productos, junto a «Nuevo producto», va un botón secundario **«Carga masiva»** con icono de hoja de cálculo. Lleva a `/products/import`.
- En el estado vacío del catálogo («Tu catálogo empieza aquí») se añade el enlace «o súbelos todos desde Excel», porque es justo cuando más sirve.
- La pantalla tiene migas **«Productos › Carga masiva»** y el botón «Volver a Productos».

### 6.2 Estructura de la pantalla

1. **Cabecera:**
   - Título: «Carga masiva de productos».
   - Subtítulo: «Crea y actualiza muchos productos a la vez con un Excel. Antes de guardar te mostramos qué va a pasar con cada fila.»
   - Una ilustración de una hoja de cálculo con los colores de la marca.
2. **Pasos** numerados y unidos por una línea:
   - En PC, el paso 1 y el paso 2 se ven lado a lado, y el paso 3 ocupa todo el ancho.
   - En móvil van uno debajo de otro.
3. **Preguntas frecuentes** al final, plegables:
   - ¿Qué pasa si el código ya existe?
   - ¿Se borran los productos que no estén en el archivo?
   - ¿Puedo subir el Excel del reporte?
   - ¿Qué formatos de precio acepta?
   - ¿Cuántos productos puedo subir a la vez?
   - ¿Puedo deshacer una importación?

### 6.3 Paso 1: Descarga la plantilla

- Texto: «Tiene las columnas listas, tus categorías en un desplegable y una hoja con instrucciones y ejemplos.»
- Botón principal **«Descargar plantilla»**, con estados como los del reporte.
- Un bloque «¿Ya tienes productos?»:
  - Texto: «Descarga tu catálogo, cambia lo que necesites y súbelo aquí: así actualizas precios en bloque.»
  - Enlace «Descargar mi catálogo», que es el reporte sin filtros.

### 6.4 Paso 2: Complétala

Una **maqueta interactiva de la plantilla**, una tabla HTML con aspecto de Excel: letras A–E, la fila de títulos con el estilo de la plantilla y dos filas de ejemplo.

Cada columna tiene su ficha de reglas. Se resalta al pasar el cursor o al enfocar la columna, y también aparece como lista de texto debajo, para el teclado y los lectores de pantalla:

| Columna | Regla mostrada |
| --- | --- |
| Código | Obligatorio y único, hasta 64 caracteres. Se guarda en mayúsculas. **Si ya existe, se actualiza ese producto.** |
| Nombre | Obligatorio, hasta 120 caracteres. |
| Descripción | Opcional, hasta 2 000 caracteres. Puede tener varias líneas. |
| Categoría | Obligatoria. Elígela del desplegable o escribe una nueva: **se creará**. No distingue mayúsculas. |
| Precio | Obligatorio y mayor que 0, con hasta 2 decimales. Vale `1250.50`, `1250,50`, `1,250.50` o `S/ 1250.50`. |

Debajo van tres consejos breves:

- «No cambies los títulos de la primera fila.»
- «Una fila por producto.»
- «Puedes dejar filas vacías: se ignoran.»

### 6.5 Paso 3: Súbela y revisa

**Zona de carga.** Se puede arrastrar el archivo o hacer clic en ella: es un `button` real con un `input type="file"` oculto que acepta `.xlsx`.

- Texto: «Arrastra tu Excel aquí o elige un archivo». Debajo: «Solo .xlsx · hasta 4 MB · hasta 2 000 productos».
- Al arrastrar encima, el borde y el fondo pasan a verde.
- El tamaño y la extensión se comprueban en el navegador antes de enviar, y otra vez en el servidor.

**Estados**, anunciados en una región `aria-live`:

1. Con el archivo elegido se muestra un chip con el nombre, el tamaño y el botón «Cambiar archivo».
2. «Leyendo tu Excel…» y «Revisando 1 234 filas…», con una barra de progreso indeterminada.
3. Si el archivo no sirve se muestra un mensaje a nivel de archivo (§11.1) con lo que hay que hacer, y la zona de carga vuelve a estar disponible.

**Vista previa: «Esto es lo que va a pasar»**

- **Tarjetas de resumen**, cada una con su icono y un color que nunca va solo, siempre con texto:
  - **Nuevos**, en verde: se crearán.
  - **Se actualizan**, en azul: el código ya existe y algo cambia.
  - **Sin cambios**, en gris: ya están iguales y no se tocan.
  - **Con errores**, en rojo: no se importan.
- **Categorías nuevas:** «Se crearán 2 categorías: Monitores, Redes».
- **Pestañas** (`Tabs` de `radix-ui`, igual que en Empresa): Todas · Nuevos · Se actualizan · Sin cambios · Con errores. Cada una con su contador; si hay errores, se abre en «Con errores».
- **Tabla** con columnas Fila (número de fila en Excel) · Estado · Código · Nombre · Categoría · Precio · Detalle:
  - Una actualización muestra en «Detalle» qué cambia: «Precio: S/ 1,200.00 → S/ 1,350.00», «Nombre cambia», «Categoría: Laptops → Computadoras».
  - Un error muestra cada motivo en una línea: «Precio: escribe solo números con hasta dos decimales.»
  - Una categoría nueva lleva la etiqueta «nueva».
- **Paginación** de 50 filas: nunca se dibujan 2 000 filas de golpe.
- **En móvil** cada fila es una tarjeta con la misma información.

**Barra de acción fija abajo:**

- Botón principal **«Importar 60 productos»**, la suma de nuevos y actualizados.
  - Si hay 0, queda desactivado con el texto «No hay filas para importar.»
  - Si solo hay filas sin cambios: «Tu catálogo ya está al día con este archivo.»
- Botón secundario «Elegir otro archivo».
- Si hay errores:
  - Aviso: «3 filas con errores no se importarán. Corrígelas y vuelve a subir el archivo, o descárgalas aparte.»
  - Botón «Descargar filas con errores».

### 6.6 Confirmación e importación

**Confirmación**, si se van a actualizar productos que ya existen (AlertDialog):

- Título: «¿Actualizar 12 productos existentes?»
- Texto: «Sus datos se reemplazarán por los del Excel. Si quieres un respaldo, descarga tu catálogo antes.»
- Acciones: «Descargar respaldo» (el reporte sin filtros), «Cancelar» e «Importar».

Si solo hay productos nuevos, no se pide confirmación.

**Importando:**

- El botón pasa a «Importando 60 productos…» y se desactivan los demás.
- Se avisa con `beforeunload` si se intenta salir de la página.
- El archivo se vuelve a enviar, y el servidor lo lee y lo valida otra vez antes de guardar (§8.2).

**Resultado: «¡Listo! Tu catálogo está actualizado»**, con un icono de confirmación animado (respeta `prefers-reduced-motion`):

- Cifras: «48 productos creados · 12 actualizados · 5 sin cambios · 2 categorías nuevas».
- Si hubo errores: «3 filas no se importaron» y el botón «Descargar filas con errores».
- Acciones:
  - **«Ver productos»**, que lleva a `/products?dateBy=updated&date=today` y muestra exactamente lo creado y lo actualizado hoy, gracias al filtro de la fase 1.
  - «Hacer otra carga».
- Se invalidan las consultas de productos y categorías, así que la lista ya está al día al volver.

Si falla al guardar, nada queda a medias: «No se importó nada. Revisa tu conexión e inténtalo de nuevo; tu archivo sigue seleccionado.»

### 6.7 Estilo visual

Moderno, luminoso y coherente con la app: Plus Jakarta Sans, fondo `#F4F5F2`, tarjetas blancas con bordes `#E3E7DE` y verde `#72CE0B` como acento.

- **Cabecera:** una banda con un degradado verde muy suave y la ilustración de la hoja de cálculo, que es el elemento memorable. El resto se queda sobrio.
- **Pasos:** tarjetas con el número del paso en un círculo verde, unidas por una línea; aquí la numeración sí es una secuencia real.
- **Zona de carga:** grande, con borde discontinuo e icono, que reacciona al arrastrar.
- **Movimiento:** solo como respuesta a una acción. La vista previa aparece con un fundido corto y la confirmación final tiene una animación breve. Nada se mueve solo; se respeta `prefers-reduced-motion`.
- **Accesibilidad:**
  - Contraste AA y foco visible.
  - Ningún estado se comunica solo con color.
  - La tabla tiene `caption`.
  - Al terminar cada fase, el foco va al título de la vista previa o del resultado.

## 7. Plantilla de importación (fase 2)

**Hoja «Productos»**

- Fila 1 con los títulos **Código · Nombre · Descripción · Categoría · Precio**, con el mismo estilo que la cabecera del reporte. Fila 1 fija y anchos cómodos.
- Validaciones de datos hasta la fila 2 001, con mensajes de ayuda al seleccionar una celda (`promptTitle` / `prompt`):
  - **Código:** formato texto (`@`), para que Excel no convierta «00123» ni «1E5»; longitud de 1 a 64.
  - **Nombre:** longitud de 1 a 120.
  - **Descripción:** longitud de 0 a 2 000 y ajuste de línea.
  - **Categoría:** lista desplegable con las categorías actuales. Se toma de un rango de una hoja oculta, «Categorías», porque una lista escrita no puede pasar de 255 caracteres. Al escribir una que no está, solo **avisa** (`errorStyle: 'warning'`) y deja continuar, porque las nuevas se crean.
  - **Precio:** decimal mayor que 0 (`errorStyle: 'stop'`), con formato `#,##0.00`.

**Hoja «Instrucciones»**, la primera al abrir:

- Pasos y reglas en frases cortas.
- Una tabla de ejemplo con tres productos.
- Aviso: «Las filas de ejemplo de esta hoja no se importan.»

**Hoja oculta «Categorías»** con la lista para el desplegable.

## 8. Servidor y base de datos

### 8.1 Migraciones

**Fase 1: `…_product_date_filters.sql`**

- Índices `products_created_at_idx` y `products_updated_at_idx`.
- `public.filter_products(search, category, date_by, date_from, date_to)`:
  - Devuelve `setof` filas con la categoría.
  - Es `stable` y `security invoker`.
  - Concentra la lógica de búsqueda sin tildes y el escape de `% _ \` de la versión actual.
- `public.search_products(...)`:
  - Se borra la versión actual y se crea de nuevo con `date_by text default 'created'`, `date_from date default null` y `date_to date default null`, además de los parámetros de hoy.
  - Pagina sobre `filter_products`.
  - **Compatible hacia atrás:** el código publicado sigue llamándola con los parámetros de siempre.
- `public.export_products(search, category, date_by, date_from, date_to, max_rows)`: todas las filas ordenadas, hasta `max_rows`.
- Se regeneran los tipos (`pnpm db:types`).

**Fase 2: `…_product_import.sql`**

- `public.preview_product_import(rows jsonb)`:
  - Es `stable`.
  - Para cada fila válida devuelve si es nueva, se actualiza o no cambia, con los valores actuales para mostrar el detalle.
  - Devuelve también las categorías que se crearían, comparando sin mayúsculas ni espacios, como el índice único `lower(btrim(name))`.
- `public.import_products(rows jsonb)`. En una sola llamada, que ya es una transacción:
  1. Comprueba que la cuenta es la dueña y que hay como máximo 2 000 filas.
  2. Crea las categorías que faltan con `on conflict ((lower(btrim(name)))) do nothing`.
  3. Inserta o actualiza los productos con `on conflict (code) do update … where (los datos) is distinct from (los nuevos)`. Las filas idénticas no se tocan y no cambian su `updated_at`.
  4. Devuelve `{ created, updated, unchanged, categories_created }`.
- Las dos funciones son `security invoker`: las políticas RLS del dueño ya permiten leer, crear y actualizar.

**Orden de despliegue:** primero la migración (`pnpm db:push`) y después el código. Cada migración solo añade cosas y es compatible con la versión publicada.

### 8.2 Módulos

`src/features/catalog/excel/`, todo con `import 'server-only'`:

- `theme.ts`: colores, fuentes y bordes, para que el reporte, la plantilla y el archivo de errores se vean igual.
- `report.ts`: arma el libro del reporte a partir de filas y de los datos de la empresa.
- `template.ts`: arma la plantilla a partir de las categorías.
- `read.ts`: lee un `.xlsx`.
  - Busca la hoja y la fila de títulos en las primeras 20 filas, así que vale para la plantilla, el reporte y el archivo de errores.
  - Acepta títulos sin tildes ni mayúsculas, con alias: «Codigo», «Cód.», «SKU», «Precio unitario (S/)», etc.
  - Ignora las columnas que no conoce.
- `normalize.ts`: convierte cada celda de ExcelJS a texto o número (§8.3).
- `validate.ts`: valida cada fila con `productSchema` y `categorySchema`, detecta códigos repetidos y devuelve filas válidas y errores por columna.
- `errors-file.ts`: arma el Excel de filas con errores. Tiene las columnas de la plantilla más «Motivo» en rojo, y se puede volver a subir.

Server Actions, en `src/features/catalog/products/excel-actions.ts`, todas con `withOwner`:

- `exportProductsReport(filters)`
- `downloadImportTemplate()`
- `previewProductImport(formData)`
- `importProducts(formData)`
- `downloadImportErrors(formData)`

Las que devuelven un archivo dan `{ base64, fileName, … }`. Las funciones `base64ToFile` y `downloadFile` pasan de `features/proforma/document/files.ts` a `src/lib/files.ts`, para compartirlas sin que una función importe de otra.

`next.config.ts`:

- `exceljs` se añade a `serverExternalPackages`.
- `experimental.serverActions.bodySizeLimit: '4mb'`.

### 8.3 Lectura de celdas y precios

**Tipos de celda de ExcelJS.** Hay que tratarlos todos: es la principal fuente de errores al importar.

- **Texto y número:** se usan tal cual.
- **Texto enriquecido** (`richText`): se unen sus partes.
- **Fórmula:** se usa su `result`; si no tiene, la fila da error «Fórmula sin calcular».
- **Hipervínculo:** se usa su `text`.
- **Fecha o booleano:** el código y el nombre se convierten a texto; en precio son error.
- **Error de Excel** (`#N/A`, `#VALUE!`…): «La celda tiene un error de Excel (#N/A).»
- **Vacía:** se trata como texto vacío.

**Textos:**

- Se quitan los espacios de los extremos y los espacios no separables.
- En el código y el nombre, los saltos de línea pasan a espacio. En la descripción se conservan.

**Código numérico:** un 123 de Excel pasa a «123» sin notación científica. Para enteros se usa `toFixed(0)`; si tiene decimales, es error.

**Precio numérico:**

- Se redondea a 2 decimales si la diferencia es menor que 0,000001, porque son restos de coma flotante (1299.8999999 → 1299.90).
- Si tiene más decimales de verdad, da error: «El precio tiene más de dos decimales.»

**Precio en texto:**

1. Se quitan «S/», «S/.» y los espacios.
2. Se resuelven los separadores:
   - Si hay `.` y `,`, el último es el decimal y el otro se elimina: «1,299.90» y «1.299,90» valen 1299.90.
   - Si hay uno solo seguido de exactamente 3 dígitos, es de miles: «1,299» vale 1299.
   - Si hay uno solo seguido de 1 o 2 dígitos, es el decimal.
3. El resultado pasa por `unitPriceSchema`, la misma regla del formulario.

**Filas:**

- Una fila con todas las columnas vacías se ignora y no cuenta como error.
- Un código repetido dentro del archivo es error en la segunda y siguientes apariciones: «Código repetido: ya está en la fila 8.»

## 9. Rendimiento y escalabilidad

- **Una consulta por vista previa y una por importación.** Las operaciones son por conjuntos (`jsonb_to_recordset`, `insert … on conflict`), no una petición por fila. Con 2 000 filas se espera menos de 3 s por paso en Vercel `gru1`, junto a Supabase `sa-east-1`.
- **Índices** por fecha de registro y de modificación. Con miles de productos, el filtro de fecha sigue siendo inmediato.
- **ExcelJS fuera del navegador** y cargado con `await import()` solo en las acciones que lo usan. Las demás páginas no arrancan más lentas.
- **Límites en constantes únicas**, para ajustarlos si el negocio crece:
  - `EXPORT_MAX_ROWS` = 10 000
  - `IMPORT_MAX_ROWS` = 2 000
  - `IMPORT_MAX_BYTES` = 4 MB
- **Vista previa paginada**, para que el navegador no dibuje miles de filas. La respuesta de 2 000 filas pesa unos 0,5 MB.
- **Reporte de 10 000 filas:** pesa menos de 1 MB y viaja bien en base64, por debajo de los 4,5 MB de Vercel.
- **Invalidación precisa:** solo se invalidan las claves de productos y categorías.

## 10. Robustez y casos límite

| Caso | Comportamiento |
| --- | --- |
| Archivo `.xls`, `.csv` u otro | Se rechaza por extensión y por firma ZIP (`PK\x03\x04`), con un mensaje que explica cómo guardarlo como `.xlsx` (§11.1). |
| Archivo dañado o con contraseña | «No pudimos abrir el archivo…» (§11.1). No se cae la página. |
| Hojas de más | Se usa la primera que tenga los títulos esperados. «Instrucciones» y «Categorías» no los tienen. |
| Faltan columnas | «Faltan las columnas: Precio, Categoría.» |
| Fila de títulos en la fila 7 (reporte) | Se detecta: se busca en las primeras 20 filas. |
| Columnas extra (N°, fechas, Motivo) | Se ignoran. |
| Mismo archivo subido dos veces | La segunda vez todo sale «Sin cambios» y no se escribe nada. Es idempotente. |
| Otra pestaña cambia el catálogo entre la vista previa y la importación | La importación vuelve a calcularlo todo en su transacción. El resultado muestra las cifras reales. |
| Categoría «laptops» y existe «Laptops» | Se usa la existente: misma regla que el índice único. |
| Restricción de la base que falla | Se revierte todo, no se guarda nada y se muestra el mensaje de §6.6. |
| Cortes de red | `settle()` convierte el rechazo en un mensaje y el archivo sigue elegido para reintentar. |
| Archivo enorme comprimido | Límite de 4 MB en la petición y de 2 000 filas al leer. Solo la cuenta dueña puede subir archivos. |
| Fórmulas en textos del reporte | Se escriben como texto (§5.2). |
| Cambio de día con la pantalla abierta | La clave de la consulta incluye los días concretos, así que «Hoy» se recalcula. |

## 11. Comunicación con el usuario

- **Cada espera tiene un texto:**
  - «Preparando Excel…»
  - «Leyendo tu Excel…»
  - «Revisando N filas…»
  - «Importando N productos…»
- **Cada final tiene un resultado claro**, con un toast y, en la carga masiva, la vista de resultado.
- **Los errores dicen qué pasó y qué hacer**, en español y sin disculpas, con fila y columna.
- **Nada destructivo sin aviso:** confirmación antes de actualizar productos y oferta de respaldo.
- **Nada importante solo con color,** en badges, tarjetas y bordes.

### 11.1 Mensajes de archivo

| Situación | Mensaje |
| --- | --- |
| No es `.xlsx` | «Ese archivo no es un Excel .xlsx. Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)".» |
| Más de 4 MB | «El archivo pesa más de 4 MB. Divide los productos en varios archivos.» |
| Más de 2 000 filas | «El archivo tiene más de 2 000 productos. Divídelo en archivos de hasta 2 000.» |
| Sin títulos | «No encontramos las columnas de la plantilla. La primera fila debe tener: Código, Nombre, Descripción, Categoría y Precio.» |
| Faltan columnas | «Faltan las columnas: …» |
| Sin productos | «El archivo no tiene productos. Completa la plantilla desde la fila 2.» |
| Dañado o con contraseña | «No pudimos abrir el archivo. Si tiene contraseña, quítasela; si no, vuelve a guardarlo desde Excel.» |

## 12. Pruebas

Con TDD, como el resto del proyecto. Cada fase deja su CI en verde: formato, lint, tipos, unitarias, componentes, integración y e2e.

**Fase 1**

- **Unitarias:**
  - Rangos de fecha en Lima: hoy, 7 y 30 días, este mes, mes anterior (incluidos enero y meses de 28, 30 y 31 días), y la hora límite de las 23:59 en Lima, que ya es el día siguiente en UTC.
  - Lectura de los parámetros de la URL.
  - Armado del reporte, leyéndolo de vuelta con ExcelJS: títulos, formatos de moneda y fecha, panel fijo, filtros, filas, resumen por categoría, aviso de recorte y textos con `=` escritos como texto.
- **Integración** (Supabase local):
  - `search_products` y `export_products` con fechas de registro y de modificación, con los límites del día de Lima.
  - La compatibilidad de `search_products` con la llamada antigua.
  - El tope de filas y el permiso de dueño.
- **Componentes:** el control de fecha, con los rangos, el personalizado, el error «Desde > Hasta» y el chip para quitarlo.
- **E2E:**
  - Elegir un rango actualiza la URL y la lista, y se conserva al recargar.
  - Descargar el Excel con filtros: se lee el archivo con ExcelJS y coincide con la lista.

**Fase 2**

- **Unitarias:**
  - Cada tipo de celda (§8.3).
  - Precios en todos sus formatos, incluidos los erróneos.
  - Alias de títulos, fila de títulos en la fila 7, columnas extra, filas vacías, códigos repetidos y límites.
  - Plantilla: desplegable de categorías desde la hoja oculta, validaciones y formato texto del código.
  - Archivo de errores que se puede volver a leer.
- **Integración:**
  - `preview_product_import` e `import_products`: nuevo, actualiza y sin cambios.
  - Categoría nueva sin duplicar por mayúsculas.
  - Transacción completa: si una fila rompe una restricción, no se guarda nada.
  - `updated_at` intacto en las filas sin cambios, límite de filas y solo el dueño.
- **Componentes:** vista previa con pestañas, contadores, paginación, detalle de cambios, errores y estados del botón.
- **E2E**, en PC y en móvil:
  - Descargar la plantilla.
  - Subir un archivo con filas nuevas, cambios y errores: vista previa, confirmación, resultado y «Ver productos».
  - Descargar las filas con errores.
  - Subir el reporte de la fase 1 modificado: actualiza precios.

## 13. Despliegue

Cada fase:

1. Copia de seguridad de la base y `pnpm db:push` con su migración.
2. Push a `main`; el CI se ejecuta solo.
3. En Vercel, **Deployments → Create Deployment → `main`**, porque el plan Hobby bloquea los despliegues automáticos de otros autores.
4. Comprobación en producción con la cuenta dueña, solo leyendo o con datos de prueba fáciles de reconocer (`PRUEBA-…`), que se borran al terminar.

Además se actualizan [setup.md](../../setup.md) y [deployment.md](../../deployment.md) con las migraciones nuevas y la carga masiva.

## 14. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| ExcelJS se mantiene poco (última versión estable de 2023) | Es estable y muy usado. Su uso queda aislado en `features/catalog/excel/`: si hubiera que cambiarla, solo se tocan esos módulos. Hay pruebas que leen de vuelta cada archivo generado. |
| Excel en otro idioma o región cambia separadores | Los precios se escriben como número en los archivos generados. Al leer, se aceptan ambos separadores (§8.3). |
| Vercel corta peticiones de más de 4,5 MB | Límite de 4 MB comprobado en el navegador y en el servidor. |
| Una importación grande actualiza datos por error | Vista previa obligatoria, confirmación con el número de actualizaciones y respaldo a un clic. |
