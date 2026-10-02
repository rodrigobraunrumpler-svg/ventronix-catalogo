# Filtro de fecha, orden, Excel y carga masiva de productos

Fecha: 02-10-2026. Estado: **revisión 4**. La fase 1 está implementada; la revisión 4 recoge lo que cambió al planificar la fase 2 (§0.1).

Parte del módulo de productos ([spec del catálogo](2026-09-29-catalogo-design.md)). Reglas del proyecto: [PROJECT_CONTEXT.md](../../../PROJECT_CONTEXT.md).

## 0. Qué cambió en la revisión 2

Se revisó cómo usará esto el negocio en su día a día:

- cargar el catálogo por primera vez;
- actualizar precios cuando el proveedor cambia su lista;
- compartir precios con los clientes;
- ver de un vistazo qué cambió.

Cada mejora lleva una prioridad: **[E]** esencial, porque sin ella el uso real tiene huecos, o **[R]** recomendada, porque añade mucho valor por poco coste.

| # | Mejora | Por qué, en la piel del cliente | Prio. | Fase |
| --- | --- | --- | --- | --- |
| 1 | El precio dice **«con IGV»** en el reporte, la plantilla y las ayudas | Los precios del catálogo incluyen IGV (`TAX_CONFIG.mode = 'included'`). Si alguien sube precios sin IGV, todas las proformas salen un 18 % más baratas. | E | 1 y 2 |
| 2 | **Ordenar la lista**: nombre, más recientes, modificados y precio | Tras filtrar por fecha, lo natural es ver lo último primero. El precio sirve para revisar extremos. PROJECT_CONTEXT ya prevé `sort` en la URL. | R | 1 |
| 3 | **Indicadores clicables** junto al título: «123 productos · 15 nuevos este mes · 8 modificados en 7 días» | Da contexto en un vistazo, y cada cifra aplica su filtro con un clic. No ocupa altura extra, así que no quita filas en laptop. | R | 1 |
| 4 | **Lista de precios para clientes**, con datos de contacto y agrupada por categoría | Un negocio de ventas envía listas de precios a diario. El reporte completo es para uso interno. | R | 1 |
| 5 | Barras de datos en el resumen por categoría, nombres de archivo con contexto y enlace «Abrir esta vista en la app» | Se lee de un vistazo, se encuentra el archivo después y se vuelve a la misma vista desde el Excel. | R | 1 |
| 6 | La fecha se ve en cada fila cuando se filtra u ordena por fecha | Responde «¿cuándo entró esto?» sin abrir la ficha. | R | 1 |
| 7 | **Actualización parcial**: un Excel con solo Código y Precio actualiza solo precios | Es la tarea más frecuente. Obligar a traer nombre y categoría es trabajo extra y una fuente de errores. | E | 2 |
| 8 | **Avisos «Para revisar»**: precio que cambia ±50 % o más, y nombre repetido o ya existente con otro código | Atrapa errores de tipeo (1299 → 12.99) y productos duplicados antes de guardar. | E | 2 |
| 9 | **Categorías parecidas**: «"Impresora" se parece a "Impresoras". ¿Usar esa?» | Una categoría duplicada no se puede fusionar ni borrar si tiene productos. Es el error más caro de limpiar. | E | 2 |
| 10 | **Comprobante de la importación** con lo que cambió y una hoja «Para revertir» | Un deshacer práctico sin tablas nuevas: subir esa hoja devuelve los valores anteriores. | R | 2 |
| 11 | Dos accesos al entrar: **«Cargar productos nuevos»** y **«Actualizar precios o datos»** | Cada intención lleva al archivo correcto: la plantilla o «mi catálogo». | R | 2 |
| 12 | Resumen visual de la vista previa (precios que suben y bajan, productos por categoría) y búsqueda en la vista previa | Se entiende el efecto del archivo antes de importar y se encuentra una fila concreta. | R | 2 |
| 13 | Hasta **5 000 filas** por archivo, antes 2 000 | Un distribuidor puede tener miles de modelos. Los límites de Vercel lo permiten (§10). | R | 2 |
| 14 | **Tu propio Excel**: asignar sus columnas a las nuestras, recordar la asignación, elegir hoja y dar una categoría a las filas sin categoría | Las listas de proveedores nunca vienen con nuestras columnas. Evita copiar y pegar a la plantilla. | R | 3 |
| 15 | *(rev. 3)* Al importar, **«Los precios de este archivo no incluyen IGV: sumar 18 %»** | Las listas de proveedores suelen venir sin IGV. Convertirlas a mano en Excel es lento y propenso a errores. | E | 2 |
| 16 | *(rev. 3)* **Modo de importación**: crear y actualizar, solo crear los nuevos o solo actualizar los existentes | Con la lista completa de un proveedor se quiere actualizar solo lo que se vende, o añadir solo lo que falta, sin tocar lo demás. | R | 2 |
| 17 | *(rev. 3)* **«Descargar simulación»** antes de importar | Sirve para revisarlo con calma o pasarlo a quien aprueba precios, antes de cambiar nada. Reutiliza el comprobante. | R | 2 |
| 18 | *(rev. 3)* **«Copiar enlace de esta vista»** | Los filtros viven en la URL, así que guardar en favoritos o compartir «Laptops modificados esta semana» es un clic. | R | 1 |
| 19 | *(rev. 3)* **Valor sin IGV** junto al precio con IGV en el reporte completo | Para contabilidad y para comparar con listas de proveedores sin IGV. | R | 1 |
| 20 | *(rev. 3)* El indicador «modificados» aclara que **incluye los creados** | La cifra debe coincidir con la lista que abre, y el título lo explica para que no confunda. | E | 1 |

### 0.1 Qué cambió al planificar la fase 2 (revisión 4)

El [plan de la fase 2](../plans/2026-10-03-fase-2-carga-masiva.md) se revisó cinco veces. Estas decisiones cambian lo que dice esta spec; el detalle, con el porqué, está en el apéndice «Revisiones del plan».

- La tabla de la vista previa se abre en Con errores, Para revisar, Se actualizan, Nuevos y, por último, Todas (§6.6).
- Los porcentajes llevan punto decimal, como los precios: «+12.5 %» (§6.6).
- Cada archivo nuevo empieza con las opciones por defecto (§6.6).
- Avisos nuevos en la vista previa: las filas «Para revisar» y la columna «Valor sin IGV (S/)», que no se importa (§6.6).
- Un corte de red durante la importación tiene su propio mensaje (§6.9).
- `import_products` recibe el modo (§9.1) y el límite de la petición es de 4,5 MB (§9.2).
- Los mensajes de precio ya no repiten la columna, y se quitan los caracteres invisibles (§9.3).

## 1. Objetivo

Que quien gestiona el catálogo pueda:

1. **Encontrar y entender su catálogo**: filtrar por fecha de registro o de modificación, ordenar y ver indicadores clave.
2. **Sacar datos en Excel**: un **reporte completo** para uso interno y una **lista de precios** lista para enviar a sus clientes.
3. **Cargar y actualizar muchos productos a la vez desde Excel**, en una pantalla guiada que muestra qué pasará con cada fila, avisa de lo sospechoso **antes** de guardar y deja un comprobante para revertir.

El reporte completo usa las mismas columnas que la plantilla, así que se puede volver a subir. Para cambiar todos los precios basta con descargar, editar y subir.

Requisitos transversales pedidos: escalable, robusto, rápido, sin errores, que comunique en todo momento qué pasa, navegable, intuitivo y con un estilo moderno que invite a quedarse.

## 2. Alcance y fases

Se entrega en **tres fases**, cada una publicable por separado y con su propio plan de tareas.

**Fase 1: encontrar y sacar datos**

- Indicadores clicables junto al título de Productos (§4.1).
- Filtro de fecha, por registro o por modificación, con rangos rápidos y personalizado (§4.2–4.3).
- Orden de la lista (§4.4).
- Fecha visible en las filas cuando hay contexto de fechas, y en la ficha del producto.
- «Descargar Excel», con dos formatos: **Reporte completo** y **Lista de precios** (§5).

**Fase 2: carga masiva con la plantilla o el reporte**

- Pantalla `/products/import` con dos accesos según la intención y tres pasos guiados.
- Plantilla con desplegables, ayudas e instrucciones.
- Actualización parcial, vista previa con avisos, categorías parecidas e importación transaccional.
- Excel de filas con errores y comprobante con la hoja «Para revertir».

**Fase 3: tu propio Excel**

- Asignar columnas cuando los títulos no son los nuestros, y recordar esa asignación.
- Elegir hoja cuando hay varias.
- Categoría para las filas que no traen una.

**Fuera de alcance:**

- Borrar productos desde Excel: la importación nunca borra.
- Formatos CSV, `.xls` u `.ods`: solo `.xlsx`.
- Campos nuevos como imágenes o stock (PROJECT_CONTEXT §5).
- Reportes programados o enviados por correo.
- Gráficos nativos de Excel: ExcelJS no los genera. Se usan barras de datos (§5.2).

**Para decidir más adelante** (§16):

- Historial de importaciones en la base, que exigiría una tabla nueva.
- Generar códigos automáticos para filas sin código.

## 3. Decisiones

| Tema | Decisión |
| --- | --- |
| Librería Excel | **ExcelJS 4.4.0**, la más usada para Excel con estilos: colores, bordes, formatos de moneda y fecha, cabecera fija, filtros, desplegables, ayudas por celda, formato condicional (barras de datos), imágenes, hipervínculos y lectura. Solo en el servidor (`import 'server-only'`, `serverExternalPackages`): el navegador no la descarga. Se carga con `await import('exceljs')` dentro de cada acción, para no frenar el arranque de las páginas. |
| Seguridad de la dependencia | `pnpm audit` marca una vulnerabilidad moderada en `uuid` (<11.1.1), dependencia de ExcelJS. Solo afecta a `v3/v5/v6` con búfer, y ExcelJS usa `v4()` sin búfer, así que no es explotable aquí. Aun así se fuerza `uuid` ≥ 11.1.1 con un `override` de pnpm para que la auditoría quede limpia. |
| IGV | El título de la columna de precio sale de `TAX_CONFIG`: «Precio con IGV (S/)» si es `included` (hoy), «Precio sin IGV (S/)» si es `added` y «Precio (S/)» si es `none`. Igual en las ayudas de la plantilla. |
| Fecha del filtro | Por **fecha de registro** (`created_at`, por defecto) o por **última modificación** (`updated_at`). Días de **Lima** (UTC−5, sin horario de verano). |
| Orden | Nombre A–Z (por defecto), más recientes, modificados recientemente y precio en ambos sentidos. Los empates se resuelven por nombre y, al final, por `id`, para que la paginación sea estable. |
| Estado en la URL | Con nuqs, como la búsqueda y la categoría: `date`, `dateBy`, `from`, `to` y `sort` (§4.5). |
| Filtrado | **Una sola función SQL** con filtros y orden, usada por la lista y por los dos Excel. Así no pueden desalinearse. |
| Excel de salida | Lo filtrado y en el orden de pantalla, como máximo **10 000 filas**. Se genera en una Server Action y llega en base64, igual que el PDF de la proforma. |
| Archivo de importación | `.xlsx`, hasta **4 MB** y **5 000 filas**. `serverActions.bodySizeLimit = '4mb'`, por el límite de 4,5 MB por petición de Vercel. |
| Validación | En el servidor, con **las mismas reglas del formulario** (`productSchema`, `categorySchema`), y otra vez al confirmar: nunca se confía en lo que manda el navegador. |
| Columnas presentes | Solo **Código** es obligatoria en el archivo. Las demás se actualizan si vienen y se respetan si no vienen. Un producto nuevo necesita nombre, categoría y precio (§6.7). |
| Vista previa | La calcula **la base**, con la misma lógica que la importación: nuevo, se actualiza o sin cambios, valores actuales y nombres que ya existen. Así la vista previa y el resultado coinciden. |
| Importación | Una función SQL **transaccional**: o se guarda todo lo válido o nada. Código existente: se actualiza. Sin cambios: no se toca. Nunca borra. Devuelve los valores anteriores para el comprobante. |
| Categorías | Coinciden sin distinguir mayúsculas ni espacios, como el índice único. Las **parecidas** (§6.8) se resuelven en la vista previa y viajan como asignación en la petición. |
| Permisos | Todas las acciones con `withOwner`. Las funciones SQL son `security invoker`, así que aplican las políticas RLS del dueño que ya existen. |
| Pantalla | `/products/import`, dentro del módulo de productos, con migas «Productos › Carga masiva». |

## 4. Lista de productos: indicadores, fecha y orden (fase 1)

### 4.1 Indicadores del catálogo

En la fila del título «Productos», a su derecha y antes de los botones, van tres **chips con cifras**. No ocupan altura extra; en móvil pasan a una segunda línea.

| Chip | Cifra | Al pulsarlo |
| --- | --- | --- |
| «123 productos» | Total del catálogo | Quita todos los filtros |
| «15 nuevos este mes» | Registrados desde el día 1 del mes de Lima | `dateBy=created&date=month&sort=newest` |
| «8 modificados en 7 días» | `updated_at` en los últimos 7 días de Lima, **incluidos los creados**, para que la cifra coincida con la lista que abre | `dateBy=updated&date=7d&sort=updated` |

- El chip cuyo filtro está activo se ve **seleccionado** (`aria-pressed`).
- Cada uno tiene un título que explica la cifra, por ejemplo «Productos registrados desde el 1 de octubre» o «Productos creados o modificados en los últimos 7 días».
- Con 0, el chip se muestra pero no se puede pulsar.
- Los datos salen de `catalog_stats()` (§9.1) y se refrescan cuando se crea, edita, borra o importa.

### 4.2 Filtro de fecha: control

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

### 4.3 Filtro de fecha: comportamiento

- Se combina con la búsqueda, la categoría y el orden, y vuelve a la página 1 al cambiar.
- En la cabecera de la lista aparece un chip **«Registro: últimos 7 días ✕»** para quitarlo con un clic. «Limpiar filtros» también lo quita.
- **Fecha en la fila:** con un filtro o un orden por fecha, la segunda línea de cada producto termina con la fecha que importa, en gris: «Registrado el 02/10/2026» o «Modificado hoy».
- **Lista vacía por la fecha:**
  - Título: «No hay productos en esas fechas».
  - Texto: «Prueba con otro rango o quita el filtro de fecha.»
  - Acción: «Quitar filtro de fecha».
- La **ficha del producto** muestra «Registrado el 02/10/2026 · Modificado el 05/10/2026».
- **«Copiar enlace de esta vista»:** un botón con icono de enlace junto a los chips de filtros activos. Solo se ve si hay algún filtro u orden.
  - Copia la URL con todos los parámetros.
  - Avisa con el toast «Enlace copiado: guárdalo en favoritos o compártelo para volver a esta misma vista.»
- **Móvil:** el botón queda en la misma barra, solo con el icono y un punto verde si hay filtro activo, y el panel ocupa el ancho de la pantalla.

### 4.4 Orden

El texto fijo «Nombre A–Z» de la cabecera de la lista pasa a ser un **selector**:

- Nombre A–Z
- Más recientes (registro)
- Modificados recientemente
- Precio: menor a mayor
- Precio: mayor a menor

Cambiarlo vuelve a la página 1. Los dos Excel de salida usan el mismo orden.

### 4.5 URL

| Clave | Valores | Por defecto |
| --- | --- | --- |
| `dateBy` | `created` o `updated` | `created`, que no se escribe |
| `date` | `today`, `7d`, `30d`, `month`, `last-month` o `custom` | sin filtro |
| `from`, `to` | `AAAA-MM-DD`, solo con `date=custom` | — |
| `sort` | `name`, `newest`, `updated`, `price-asc` o `price-desc` | `name`, que no se escribe |

- Los rangos rápidos se guardan como **relativos**: un enlace con `date=7d` abierto mañana muestra los 7 días hasta mañana.
- Un valor inválido se ignora y vuelve al valor por defecto, como los demás parámetros.

### 4.6 Días de Lima

El navegador convierte el rango en **días de Lima**: `dateFrom` y `dateTo`, ambos incluidos. Con esos dos días se forma la clave de TanStack Query, así que al cambiar de día se pide de nuevo.

| Rango | `dateFrom` | `dateTo` |
| --- | --- | --- |
| Hoy | hoy | hoy |
| Últimos 7 días | hoy − 6 | hoy |
| Últimos 30 días | hoy − 29 | hoy |
| Este mes | día 1 del mes | hoy |
| Mes anterior | día 1 del mes anterior | último día del mes anterior |

La base convierte cada día en un instante con `(dia::timestamp at time zone 'America/Lima')` y filtra con `>= desde` y `< hasta + 1 día`.

## 5. Excel de salida (fase 1)

### 5.1 Botón «Descargar Excel»

Va en la cabecera de la lista, junto al selector de orden. Es un botón con menú, que muestra «Excel» con el icono de hoja de cálculo; su nombre accesible y su título son «Descargar Excel». El texto corto deja la cabecera en una línea en un laptop de 1366 px, junto al orden y la paginación:

- **Reporte completo**, con la ayuda «Todos los datos, para ti. Se puede volver a subir en Carga masiva.»
- **Lista de precios**, con la ayuda «Para enviar a tus clientes: con tus datos de contacto y agrupada por categoría.»

En móvil queda solo el icono, con `aria-label`.

| Estado | Qué ve el usuario |
| --- | --- |
| Sin productos que descargar | Botón desactivado, con el título «No hay productos para descargar con estos filtros.» |
| Preparando | «Preparando Excel…», con spinner, y el botón desactivado |
| Descargado | Toast «Excel descargado · 123 productos» |
| Recortado | Toast de aviso «Se descargaron los primeros 10 000 productos. Usa los filtros para descargar el resto.» |
| Error | Toast «No se pudo preparar el Excel. Revisa tu conexión e inténtalo de nuevo.» |

**Nombres de archivo**, con fecha de Lima y contexto:

- `productos-AAAA-MM-DD.xlsx`
- `productos-laptops-AAAA-MM-DD.xlsx`, con una categoría elegida
- `lista-de-precios-AAAA-MM-DD.xlsx`

### 5.2 Reporte completo

**Hoja «Productos»**

- **Cabecera (filas 1 a 6):**
  - El logotipo (`public/brand/ventronix-logo-proforma.jpg`, que ya se incluye en la función de `/products`).
  - El nombre comercial, o la razón social, o «Catálogo de productos».
  - El título «Reporte de productos».
  - «Generado el 02/10/2026 a las 14:35 (hora de Lima)».
  - Los filtros y el orden, por ejemplo «Categoría: Laptops · Búsqueda: hp · Registro: últimos 7 días · Orden: Precio de mayor a menor», o «Sin filtros».
  - El total, por ejemplo «123 productos».
  - El hipervínculo **«Abrir esta vista en la app»**, a la URL de producción con los mismos parámetros. Se toma del host de la petición.
- **Tabla, desde la fila 8:**

| Columna | Formato | Ancho |
| --- | --- | --- |
| N° | entero | 6 |
| Código | texto | 16 |
| Nombre | texto | 40 |
| Descripción | texto, con ajuste de línea | 60 |
| Categoría | texto | 20 |
| Precio con IGV (S/) | número, `"S/" #,##0.00` (título según §3) | 18 |
| Valor sin IGV (S/) | número, `"S/" #,##0.00`, calculado con el módulo del IGV (base redondeada, igual que la «Op. gravada» de la proforma) | 16 |
| Fecha de registro | fecha, `dd/mm/yyyy` | 14 |
| Última modificación | fecha, `dd/mm/yyyy` | 16 |

Las columnas de precio dependen de `TAX_CONFIG`:

- `none`: una sola columna, «Precio (S/)».
- `added`: el catálogo guarda el precio sin IGV, así que la columna calculada es «Precio con IGV».

- **Estilo:**
  - Cabecera de la tabla en `#121511` (el foreground de la app), con texto blanco en negrita y un borde inferior verde `#72CE0B` (el primary).
  - Filas alternas en blanco y `#F6FBEF`, y bordes finos `#E3E7DE` (el border).
  - Fuente Calibri 11: Plus Jakarta Sans no viene en Excel.
  - Pestaña de la hoja en verde.
- **Uso:**
  - Cabecera fija hasta la fila 8.
  - Filtros de Excel (`autoFilter`) en la fila de títulos.
  - Impresión horizontal, ajustada al ancho de la página, con los títulos repetidos en cada página.
- Si hubo recorte, una fila de aviso en la cabecera: «Este reporte muestra los primeros 10 000 productos.»

**Hoja «Resumen por categoría»**

- Columnas: Categoría, Productos, Precio mínimo, Precio máximo y Precio promedio, con el mismo estilo y una fila de totales.
- **Barras de datos** verdes (formato condicional) en «Productos», para comparar categorías de un vistazo.
- Se calcula en el servidor con aritmética de céntimos (`BigInt`), sin errores de redondeo.

**Propiedades del libro:** autor «Ventronix · Catálogo comercial» y fecha de creación.

**Seguridad:** todos los textos se escriben como texto, nunca como fórmula, para que un nombre que empiece por `=`, `+`, `-` o `@` no se ejecute en Excel.

### 5.3 Lista de precios

Pensada para enviar a clientes. Una sola hoja, **«Lista de precios»**:

- **Cabecera:**
  - El logotipo y el nombre comercial.
  - RUC, dirección, teléfonos y correo, los que estén completos en «Empresa».
  - El título «Lista de precios».
  - «Vigente al 02/10/2026».
  - La nota fija según el IGV, por ejemplo «Precios en soles (S/), con IGV incluido.»
- **Cuerpo agrupado por categoría**, con las categorías de la A a la Z:
  - Una fila de título por categoría, en negrita sobre fondo verde claro `#EEF7E2`.
  - Debajo, sus productos en el orden elegido: Código · Producto · Descripción · Precio con IGV.
- **Sin datos internos**: ni fechas, ni N°, ni resumen.
- Impresión vertical, ajustada al ancho, con la cabecera de columnas repetida en cada página.
- **No se puede volver a subir**: el lector la reconoce por el nombre de la hoja y explica qué archivo usar (§12.1).

### 5.4 Datos

La función SQL `export_products(...)` devuelve todas las filas filtradas y en el orden pedido, con la categoría y las dos fechas. Usa la misma función interna que `search_products` (§9.1).

Pide como máximo 10 001 filas para saber si hubo recorte. El precio viaja como texto, igual que en la lista. Los datos de contacto salen de `getCompanyProfile()`.

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
2. **¿Qué quieres hacer?** Dos tarjetas grandes, con la primera ya elegida si el catálogo está vacío y la segunda si no lo está:
   - **«Cargar productos nuevos»**: «Empieza con la plantilla: trae tus categorías y te guía columna por columna.»
   - **«Actualizar precios o datos»**: «Descarga tu catálogo, cambia lo que necesites (puede ser solo el precio) y súbelo.»

   La tarjeta elegida cambia el botón principal del paso 1: «Descargar plantilla» o «Descargar mi catálogo». El otro archivo queda como enlace.
3. **Pasos** numerados y unidos por una línea:
   - En PC, el paso 1 y el paso 2 se ven lado a lado, y el paso 3 ocupa todo el ancho.
   - En móvil van uno debajo de otro, con la nota «Es más cómodo desde una PC».
4. **Preguntas frecuentes** al final, plegables:
   - ¿Qué pasa si el código ya existe?
   - ¿Puedo actualizar solo los precios?
   - ¿Se borran los productos que no estén en el archivo?
   - ¿Qué formatos de precio acepta?
   - ¿Cuántos productos puedo subir a la vez?
   - ¿Puedo deshacer una importación?

### 6.3 Paso 1: Descarga el archivo

Muestra el botón principal según la intención de §6.2, con estados como los del reporte.

- **Plantilla:** «Tiene las columnas listas, tus categorías en un desplegable y una hoja con instrucciones y ejemplos.»
- **Mi catálogo:** es el reporte completo sin filtros. «Trae todos tus productos con su código: cambia lo que necesites y súbelo. Lo que no cambies se queda igual.»

### 6.4 Paso 2: Complétalo

El título es «Complétalo» o, si se actualiza, «Cambia lo que necesites».

Una **maqueta de la plantilla**, una tabla HTML con aspecto de Excel: letras A–E, la fila de títulos con el estilo de la plantilla y dos filas de ejemplo.

Cada columna tiene su ficha de reglas. Se resalta al pasar el cursor o al enfocar la columna, y también aparece como lista de texto debajo, para el teclado y los lectores de pantalla:

| Columna | Regla mostrada |
| --- | --- |
| Código | **Siempre obligatorio** y único, hasta 64 caracteres. Se guarda en mayúsculas. **Si ya existe, se actualiza ese producto.** |
| Nombre | Hasta 120 caracteres. Obligatorio para productos nuevos. |
| Descripción | Opcional, hasta 2 000 caracteres. Puede tener varias líneas. |
| Categoría | Obligatoria para productos nuevos. Elígela del desplegable o escribe una nueva: **se creará**. No distingue mayúsculas. |
| Precio con IGV | Mayor que 0, con hasta 2 decimales, en soles y **con IGV incluido**. Obligatorio para productos nuevos. Vale `1250.50`, `1250,50`, `1,250.50` o `S/ 1250.50`. |

Debajo van cuatro consejos breves:

- «No cambies los títulos de la primera fila.»
- «Una fila por producto.»
- «Para actualizar solo precios, deja las columnas Código y Precio con IGV y borra las demás.»
- «Puedes dejar filas vacías: se ignoran.»

### 6.5 Paso 3: Súbelo

**Zona de carga.** Se puede arrastrar el archivo o hacer clic en ella: es un `button` real con un `input type="file"` oculto que acepta `.xlsx`.

- Texto: «Arrastra tu Excel aquí o elige un archivo». Debajo: «Solo .xlsx · hasta 4 MB · hasta 5 000 productos».
- Al arrastrar encima, el borde y el fondo pasan a verde.
- El tamaño y la extensión se comprueban en el navegador antes de enviar, y otra vez en el servidor.

**Estados**, anunciados en una región `aria-live`:

1. Con el archivo elegido se muestra un chip con el nombre, el tamaño y el botón «Cambiar archivo».
2. «Leyendo tu Excel…» y «Revisando 1 234 filas…», con una barra de progreso indeterminada.
3. Si el archivo no sirve se muestra un mensaje a nivel de archivo (§12.1) con lo que hay que hacer, y la zona de carga vuelve a estar disponible.

### 6.6 Vista previa: «Esto es lo que va a pasar»

**Aviso de actualización parcial.** Si el archivo no trae todas las columnas, va primero:

> «Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios. El resto de los datos se mantiene.»

**Opciones de importación**, arriba y siempre visibles. Al cambiarlas, la vista previa se recalcula. Cada archivo nuevo empieza con las opciones por defecto, para que la hoja «Para revertir» nunca se suba con «No incluyen IGV» de la carga anterior:

- **Los precios de este archivo:** «Incluyen IGV» (por defecto) o «No incluyen IGV: sumar 18 %».
  - Con la segunda, el detalle muestra el precio final: «S/ 1,000.00 + IGV → S/ 1,180.00».
  - La tasa sale de `TAX_CONFIG.ratePercent`.
- **Qué hacer:** «Crear y actualizar» (por defecto), «Solo crear los nuevos» o «Solo actualizar los existentes».
  - Las filas que el modo deja fuera no se importan y se cuentan aparte: «12 filas omitidas por el modo "Solo actualizar"».

**Tarjetas de resumen**, cada una con su icono y un color que nunca va solo, siempre con texto:

- **Nuevos**, en verde: se crearán.
- **Se actualizan**, en azul: el código ya existe y algo cambia.
- **Para revisar**, en ámbar: se importan, pero conviene mirarlos (§9.4).
- **Sin cambios**, en gris: ya están iguales y no se tocan.
- **Con errores**, en rojo: no se importan.

Cada fila cuenta en una sola tarjeta, por este orden de prioridad: Con errores, Para revisar y luego Nuevos, Se actualizan o Sin cambios. Una fila con aviso cuenta solo en «Para revisar».

**Resumen visual:**

- **Precios:** «Suben 150 (promedio +8.2 %) · Bajan 3 (promedio −4.0 %)», con una barra de dos colores proporcional. Los porcentajes llevan punto decimal, como los precios.
- **Por categoría:** una lista de barras horizontales con los productos del archivo en cada una. Las nuevas llevan la etiqueta «nueva» y las parecidas, «¿parecida?».

**Categorías nuevas y parecidas** (§6.8), en un bloque propio y antes de la tabla, porque son decisiones que hay que tomar.

**Avisos:**

- Si hay filas «Para revisar»: «3 filas para revisar se importarán igual. Si alguna no es correcta, corrígela en el Excel y vuelve a subir el archivo.»
- Si el archivo trae «Valor sin IGV (S/)» del reporte: «La columna «Valor sin IGV (S/)» no se importa: los precios se cambian en «Precio con IGV (S/)».»

**Pestañas** (`Tabs` de `radix-ui`, igual que en Empresa):

- Todas · Nuevos · Se actualizan · Para revisar · Sin cambios · Con errores.
- Cada una lleva su contador.
- Se abre en la primera pestaña con contenido de este orden: Con errores, Para revisar, Se actualizan, Nuevos y Todas. Así, con el catálogo completo, unos pocos cambios no quedan entre miles de filas sin cambios.

**Búsqueda** por código o nombre dentro de la vista previa, en el navegador.

**Tabla** con columnas Fila (número de fila en Excel) · Estado · Código · Nombre · Categoría · Precio · Detalle:

- Una actualización muestra en «Detalle» qué cambia: «Precio: S/ 1,200.00 → S/ 1,350.00 (+12.5 %)», «Nombre cambia», «Categoría: Laptops → Computadoras».
- Un aviso muestra su motivo en ámbar: «El precio baja un 90 %. ¿Es correcto?»
- Un error muestra cada motivo en una línea: «Precio: escribe solo números con hasta dos decimales.»
- **Paginación** de 50 filas: nunca se dibujan miles de filas de golpe.
- **En móvil** cada fila es una tarjeta con la misma información.

**Barra de acción fija abajo:**

- Botón principal **«Importar 60 productos»**, la suma de nuevos, actualizados y para revisar.
  - Si hay 0, queda desactivado con el texto «No hay filas para importar.»
  - Si solo hay filas sin cambios: «Tu catálogo ya está al día con este archivo.»
  - Si quedan categorías parecidas sin decidir: «Decide 2 categorías antes de importar.»
- Botón secundario «Elegir otro archivo». En la vista previa es la única forma de cambiar de archivo; «Cambiar archivo» queda en el chip del paso 3.
- Botón secundario **«Descargar simulación»**: el mismo Excel que el comprobante de §6.10, sin la hoja «Para revertir» y con el título «Simulación: todavía no se guardó nada». Sirve para revisarlo con calma o pasarlo a quien aprueba los precios.
- En el teléfono, los dos botones secundarios muestran solo su icono, con su nombre para los lectores de pantalla: la barra ocupa dos filas cortas.
- Si hay errores:
  - Aviso: «3 filas con errores no se importarán. Corrígelas y vuelve a subir el archivo, o descárgalas aparte.»
  - Botón «Descargar filas con errores».

### 6.7 Actualización parcial

- **Código** es la única columna obligatoria del archivo.
- **Columna ausente** del archivo: en los productos que ya existen se mantiene su valor. Si es Nombre, Categoría o Precio, los productos nuevos de ese archivo dan error: «Producto nuevo: falta el nombre.»
- **Columna presente con la celda vacía:**
  - Descripción: se borra la descripción. El archivo manda en las columnas que trae.
  - Nombre, Categoría o Precio: es error, tanto en productos nuevos como en los que se actualizan.
- La importación solo escribe las columnas presentes (`columns text[]` en la función SQL, §9.1).
- El comprobante de §6.10 solo lista lo que cambió.

### 6.8 Categorías nuevas y parecidas

Cada categoría del archivo que no existe tal cual se compara con las existentes (§9.4):

| Caso | Ejemplo | Opción marcada por defecto |
| --- | --- | --- |
| **Casi igual**: solo cambian tildes, mayúsculas, espacios o el plural | «Impresora» ↔ «Impresoras», «Impresion» ↔ «Impresión» | **Usar «Impresoras»** |
| **Parecida**: hasta 2 letras de diferencia en nombres de 5 o más letras | «Laptps» ↔ «Laptops» | **Ninguna**: hay que elegir, con el aviso destacado |
| **Nueva** | «Monitores» | Crear |

- Cada caso parecido muestra dos botones: **«Usar "Impresoras"»** y **«Crear "Impresora"»**.
- La decisión se aplica a todas las filas con esa categoría y se envía como `categoryMap` al importar. El servidor vuelve a comprobar que la categoría de destino existe.
- No se puede importar con una categoría parecida sin decidir. La casi igual ya viene decidida, pero se muestra en el bloque para poder cambiarla. Así nunca aparece un duplicado por descuido.

### 6.9 Confirmación e importación

**Confirmación**, si se van a actualizar productos que ya existen (AlertDialog):

- Título: «¿Actualizar 12 productos existentes?»
- Texto: «Sus datos se reemplazarán por los del Excel. Al terminar podrás descargar un comprobante para revertirlo.»
- Acciones: «Cancelar» e «Importar».

Si solo hay productos nuevos, no se pide confirmación.

**Importando:**

- El botón pasa a «Importando 60 productos…» y se desactivan los demás.
- Se avisa con `beforeunload` si se intenta salir de la página.
- El archivo y las decisiones (`categoryMap`) se vuelven a enviar, y el servidor lee y valida todo otra vez antes de guardar (§9.2).

Si falla al guardar, nada queda a medias: «No se importó nada. Revisa tu conexión e inténtalo de nuevo; tu archivo sigue seleccionado.»

Si se corta la red, no se sabe si la base alcanzó a guardar. Entonces se revisa el archivo otra vez y la vista previa muestra cómo quedó el catálogo: «Se cortó la conexión durante la importación. Revisamos tu archivo otra vez: la vista previa muestra cómo quedó tu catálogo.»

### 6.10 Resultado y comprobante

**Título: «¡Listo! Tu catálogo está actualizado»**, con un icono de confirmación animado (respeta `prefers-reduced-motion`).

- Cifras: «48 productos creados · 12 actualizados · 5 sin cambios · 2 categorías nuevas».
- Si hubo errores: «3 filas no se importaron» y el botón «Descargar filas con errores».
- **«Descargar comprobante»**: un Excel generado con el resultado y sin otra petición. Tiene tres hojas:
  1. **«Resumen»**: fecha y hora, nombre del archivo, cifras y categorías creadas.
  2. **«Cambios»**: una fila por dato cambiado (Código · Producto · Acción · Dato · Antes · Después), y los creados con Acción «Creado».
  3. **«Para revertir»**: los productos actualizados con sus **valores anteriores**, en formato de plantilla. Lleva arriba la nota «Sube esta hoja en Carga masiva para devolver estos productos a como estaban. Los productos creados no se borran: están en la hoja Cambios.»
- **Acciones:**
  - **«Ver productos»**, que lleva a `/products?dateBy=updated&date=today&sort=updated` y muestra exactamente lo creado y lo actualizado, lo último primero.
  - «Hacer otra carga».
- Se invalidan las consultas de productos, categorías e indicadores, así que la lista ya está al día al volver.

### 6.11 Estilo visual

Moderno, luminoso y coherente con la app: Plus Jakarta Sans, fondo `#F4F5F2`, tarjetas blancas con bordes `#E3E7DE` y verde `#72CE0B` como acento.

- **Cabecera:** una banda con un degradado verde muy suave y la ilustración de la hoja de cálculo, que es el elemento memorable. El resto se queda sobrio.
- **Tarjetas de intención:** grandes, con icono, y la elegida con borde verde y check.
- **Pasos:** tarjetas con el número del paso en un círculo verde, unidas por una línea; aquí la numeración sí es una secuencia real.
- **Zona de carga:** grande, con borde discontinuo e icono, que reacciona al arrastrar.
- **Vista previa:** las tarjetas de resumen con su cifra grande; las barras de precios y categorías, finas y con etiquetas legibles.
- **Movimiento:** solo como respuesta a una acción. La vista previa aparece con un fundido corto y la confirmación final tiene una animación breve. Nada se mueve solo; se respeta `prefers-reduced-motion`.
- **Accesibilidad:**
  - Contraste AA y foco visible.
  - Ningún estado se comunica solo con color.
  - La tabla tiene `caption`.
  - Al terminar cada fase, el foco va al título de la vista previa o del resultado.
  - Las barras tienen su cifra en texto.

## 7. Tu propio Excel (fase 3)

Hay archivos que no traen nuestros títulos, como la lista de un proveedor con «Cod. Prov», «Descripción del artículo» o «P.V.P.». En vez de rechazarlos, se abre el paso **«Dinos qué es cada columna»**:

**Asignar columnas**

- Para cada dato nuestro (Código, Nombre, Descripción, Categoría y Precio con IGV) hay un selector con las columnas del archivo.
- Debajo de cada opción se ven los 3 primeros valores de esa columna.
- La opción «No está en mi archivo» se permite en todas menos en Código.
- **Selección automática** por parecido de títulos: «P.V.P.» se propone para el precio, «Cod» para el código.
- **Fila de títulos:** se toma la primera fila con texto en 2 o más celdas, y se puede cambiar con «Los títulos están en la fila…».
- **«Recordar esta asignación»** (`localStorage`, solo en este navegador): la próxima vez que se suba un archivo con los mismos títulos, se aplica sola, con el aviso «Usamos la asignación que guardaste». Se puede cambiar.

**Elegir hoja:** si varias hojas tienen productos, se pregunta «¿Qué hoja importamos?», con el número de filas de cada una.

**Categoría para todas las filas:** si no hay columna de categoría, o hay filas sin ella, se ofrece «Asignar una categoría a las N filas sin categoría», con las categorías existentes y la opción de crear una.

La asignación, la hoja y la categoría por defecto viajan con el archivo en cada petición y el servidor las valida. La vista previa y la importación son las de la fase 2.

## 8. Plantilla de importación (fase 2)

**Hoja «Instrucciones»**, la primera al abrir:

- Pasos y reglas en frases cortas, incluida la actualización parcial.
- Una tabla de ejemplo con tres productos.
- Aviso: «Las filas de ejemplo de esta hoja no se importan.»

**Hoja «Productos»**

- Fila 1 con los títulos **Código · Nombre · Descripción · Categoría · Precio con IGV (S/)**, con el mismo estilo que la cabecera del reporte. Fila 1 fija y anchos cómodos.
- Validaciones de datos hasta la fila 5 001, con mensajes de ayuda al seleccionar una celda (`promptTitle` / `prompt`):
  - **Código:** formato texto (`@`), para que Excel no convierta «00123» ni «1E5»; longitud de 1 a 64.
  - **Nombre:** longitud de 1 a 120.
  - **Descripción:** longitud de 0 a 2 000 y ajuste de línea.
  - **Categoría:** lista desplegable con las categorías actuales. Se toma de un rango de la hoja oculta «Categorías», porque una lista escrita no puede pasar de 255 caracteres.
    - Al escribir una que no está, Excel muestra un aviso **informativo** (`errorStyle: 'information'`), con el título «Categoría nueva», el texto «No está en tu lista: se creará al importar.» y «Aceptar».
    - Se usa información y no advertencia para que una categoría nueva no parezca un error.
    - Las categorías escritas a mano no se añaden al desplegable de las demás filas; se pueden volver a escribir o copiar.
  - **Precio con IGV:** decimal mayor que 0 (`errorStyle: 'stop'`), con formato `#,##0.00` y la ayuda «En soles, con IGV incluido».

**Hoja oculta «Categorías»** con la lista para el desplegable.

## 9. Servidor y base de datos

### 9.1 Migraciones

**Fase 1: `…_product_list_filters.sql`**

- **Sin índices nuevos.** La búsqueda ya recorre la tabla (`ilike` con `%…%` y `unaccent`), y el filtro de fecha y el orden dependen de parámetros, así que la base no usaría índices por fecha o precio. Con miles de productos, filtrar y ordenar tarda milisegundos. Si el catálogo pasara de unas 50 000 filas, se añadirían índices junto con una consulta dinámica (`plpgsql` con `format`).
- `public.filter_products(search, category, date_by, date_from, date_to, sort)`:
  - Devuelve `setof` filas con la categoría y su posición en el orden pedido: el orden se escribe una sola vez, para la lista y los Excel.
  - Es `stable` y `security invoker`.
  - Concentra la búsqueda sin tildes y el escape de `% _ \` de la versión actual.
- `public.search_products(...)`:
  - Se borra la versión actual y se crea de nuevo con `date_by text default 'created'`, `date_from date default null`, `date_to date default null` y `sort text default 'name'`, además de los parámetros de hoy.
  - Pagina sobre `filter_products`, con su orden.
  - **Compatible hacia atrás:** el código publicado sigue llamándola con los parámetros de siempre.
- `public.export_products(search, category, date_by, date_from, date_to, sort, max_rows)`: todas las filas ordenadas, hasta `max_rows`.
- `public.catalog_stats()`: devuelve `{ products, created_this_month, updated_last_7_days }` en días de Lima.
- Se regeneran los tipos (`pnpm db:types`).

**Fase 2: `…_product_import.sql`**

- `public.preview_product_import(rows jsonb, columns text[])`:
  - Es `stable`.
  - Para cada fila devuelve si es nueva, se actualiza o no cambia, con los valores actuales de las columnas presentes.
  - Indica si su nombre ya existe en otro producto con un código distinto.
  - Las categorías se comparan sin mayúsculas ni espacios, como el índice único `lower(btrim(name))`.
- `public.product_import_plan(rows jsonb, columns text[])`: el plan de cada fila (se crea, se actualiza o no cambia). Lo usan las otras dos funciones, así que la vista previa y la importación deciden igual.
- `public.import_products(rows jsonb, columns text[], mode text default 'all')`. Con el modo en la base, «Solo actualizar» no crea un producto que otra pestaña borró entre la vista previa y la importación. En una sola llamada, que ya es una transacción:
  1. Comprueba que la cuenta es la dueña y que hay como máximo 5 000 filas.
  2. Guarda una foto de los valores actuales de los códigos afectados.
  3. Crea las categorías que faltan con `on conflict ((lower(btrim(name)))) do nothing`.
  4. Inserta los productos nuevos. Actualiza los existentes **solo en las columnas de `columns`**, y solo si algo cambia (`where … is distinct from …`). Las filas idénticas no se tocan y no cambian su `updated_at`.
  5. Devuelve `{ created, updated, unchanged, skipped, categories_created, changes, previous }`: `changes` lleva los valores anteriores y nuevos para el comprobante, y `previous`, los valores anteriores de cada producto actualizado para la hoja «Para revertir».
- Las dos funciones son `security invoker`: las políticas RLS del dueño ya permiten leer, crear y actualizar.

La fase 3 no necesita migraciones.

**Orden de despliegue:** primero la migración (`pnpm db:push`) y después el código. Cada migración solo añade cosas y es compatible con la versión publicada.

### 9.2 Módulos

`src/features/catalog/excel/`, todo con `import 'server-only'` salvo lo indicado:

- `theme.ts`: colores, fuentes, bordes y el título del precio según `TAX_CONFIG`, para que todos los archivos se vean igual.
- `report.ts`: el reporte completo.
- `price-list.ts`: la lista de precios.
- `template.ts`: la plantilla.
- `read.ts`: lee un `.xlsx`.
  - Busca la hoja y la fila de títulos en las primeras 20 filas, así que vale para la plantilla, el reporte, el archivo de errores y la hoja «Para revertir».
  - **Ignora las hojas** «Instrucciones», «Categorías», «Resumen», «Resumen por categoría» y «Cambios».
  - Reconoce la «Lista de precios» para dar el mensaje de §12.1.
  - Acepta títulos sin tildes ni mayúsculas, con alias exactos: «Codigo», «Cód.», «SKU», «Precio», «Precio unitario (S/)», «Precio con IGV (S/)», etc.
  - Ignora las columnas que no conoce. En la fase 3 aplica la asignación recibida.
- `normalize.ts`: convierte cada celda de ExcelJS a texto o número (§9.3).
- `validate.ts`:
  - Valida cada fila con `productSchema` y `categorySchema`, aplicando las reglas de columnas presentes (§6.7).
  - Detecta códigos y nombres repetidos dentro del archivo.
  - Devuelve filas válidas y errores por columna.
- `similar.ts`: compara categorías (§9.4). No depende del servidor y se prueba aparte.
- `errors-file.ts`: el Excel de filas con errores. Tiene las columnas presentes más «Motivo» en rojo, y se puede volver a subir.
- `receipt.ts`: el comprobante (§6.10).

**Server Actions** en `src/features/catalog/products/excel-actions.ts`, todas con `withOwner`:

- `exportProducts(filters, format)`, donde `format` es `report` o `price-list`.
- `downloadImportTemplate()`
- `previewProductImport(formData)`
- `importProducts(formData)`, que devuelve el resultado y el comprobante en base64.
- `downloadImportSimulation(formData)`

Las acciones de importación reciben, junto al archivo, las opciones `{ pricesIncludeTax, mode, categoryMap }` y, en la fase 3, la asignación de columnas. El servidor las valida con Zod.
- `downloadImportErrors(formData)`

Las acciones que devuelven un archivo dan `{ base64, fileName, … }`. Las funciones `base64ToFile` y `downloadFile` pasan de `features/proforma/document/files.ts` a `src/lib/files.ts`, para compartirlas sin que una función importe de otra.

`next.config.ts`:

- `exceljs` se añade a `serverExternalPackages`.
- `experimental.serverActions.bodySizeLimit: '4.5mb'`. El límite cuenta también lo que añade el FormData; el archivo sigue limitado a 4 MB, y Vercel admite 4,5 MB.

### 9.3 Lectura de celdas y precios

**Tipos de celda de ExcelJS.** Hay que tratarlos todos: es la principal fuente de errores al importar.

- **Texto y número:** se usan tal cual.
- **Texto enriquecido** (`richText`): se unen sus partes.
- **Fórmula:** se usa su `result`; si no tiene, la fila da error «Fórmula sin calcular».
- **Hipervínculo:** se usa su `text`.
- **Fecha o booleano:** el código y el nombre se convierten a texto; en precio son error.
- **Error de Excel** (`#N/A`, `#VALUE!`…): «La celda tiene un error de Excel (#N/A).»
- **Vacía:** se trata como texto vacío.

**Textos:**

- Se quitan los espacios de los extremos y los espacios no separables, y los espacios dobles pasan a uno.
- Se quitan los caracteres invisibles que llegan al copiar de una web o un PDF (espacios de ancho cero), y las tildes se unen a su letra (NFC). Así «LAP-001» copiado nunca crea otro producto.
- En el código y el nombre, los saltos de línea pasan a espacio. En la descripción se conservan.

**Código numérico:** un 123 de Excel pasa a «123» sin notación científica. Para enteros se usa `toFixed(0)`; si tiene decimales, es error.

**Precio numérico:**

- Se redondea a 2 decimales si la diferencia es menor que 0,000001, porque son restos de coma flotante (1299.8999999 → 1299.90).
- Si tiene más decimales de verdad, da error: «Precio: tiene más de dos decimales.» Los mensajes van tras el nombre de la columna, así que no lo repiten: «Precio: debe ser mayor que cero.», «Precio: no puede pasar de 9,999,999,999.99.»

**Precio en texto:**

1. Se quitan «S/», «S/.» y los espacios.
2. Se resuelven los separadores:
   - Si hay `.` y `,`, el último es el decimal y el otro se elimina: «1,299.90» y «1.299,90» valen 1299.90.
   - Si hay uno solo seguido de exactamente 3 dígitos, es de miles: «1,299» vale 1299.
   - Si hay uno solo seguido de 1 o 2 dígitos, es el decimal.
3. El resultado pasa por `unitPriceSchema`, la misma regla del formulario.

### 9.4 Filas, avisos y categorías parecidas

**Filas:**

- Una fila con todas las columnas vacías se ignora y no cuenta como error.
- **Código repetido** dentro del archivo: es error en la segunda y siguientes apariciones. «Código repetido: ya está en la fila 8.»

**Avisos «Para revisar»**, que se importan igual:

- **Cambio fuerte de precio:** `|nuevo − actual| / actual ≥ 0,5` (`PRICE_CHANGE_WARNING`). «El precio sube un 120 %» o «baja un 90 %. ¿Es correcto?»
- **Nombre repetido en el archivo** con códigos distintos: «Mismo nombre que la fila 12 (otro código).»
- **Nombre ya existente** en otro producto del catálogo, con otro código: «Ya existe "HP LaserJet Pro M404dn" con el código IMP-001.»

**Opciones de importación:**

- **Sumar IGV:** `precio × (100 + tasa) / 100`, redondeado al céntimo con la mitad hacia arriba. Se calcula con `BigInt` y el módulo del IGV, sin coma flotante. Se aplica antes de validar, así que un precio que pasa el máximo da su error normal.
- **Modo «Solo crear los nuevos»:** las filas con códigos que ya existen quedan omitidas.
- **Modo «Solo actualizar los existentes»:** las filas con códigos nuevos quedan omitidas.
- Una fila omitida no se valida contra las reglas de producto nuevo. Así un archivo de «solo precios» con códigos desconocidos no llena la vista previa de errores.

**Categorías parecidas.** Ambos nombres se normalizan: minúsculas, sin tildes ni espacios dobles, y sin `s` o `es` final.

- **Casi igual:** los nombres normalizados coinciden.
- **Parecida:** distancia de Levenshtein ≤ 2 (`CATEGORY_SIMILARITY_DISTANCE`), con 5 o más letras.
- Se elige la existente más cercana.

## 10. Rendimiento y escalabilidad

- **Una consulta por vista previa y una por importación.** Las operaciones son por conjuntos (`jsonb_to_recordset`, `insert … on conflict`), no una petición por fila. Con 5 000 filas se espera menos de 3 s por paso en Vercel `gru1`, junto a Supabase `sa-east-1`.
- **Sin índices nuevos** (§9.1): a la escala del catálogo (miles de productos), el recorrido completo tarda milisegundos y todo ocurre en una sola consulta. Hay un umbral documentado para revisarlo.
- **ExcelJS fuera del navegador** y cargado con `await import()` solo en las acciones que lo usan. Las demás páginas no arrancan más lentas.
- **Límites en constantes únicas**, para ajustarlos si el negocio crece:
  - `EXPORT_MAX_ROWS` = 10 000
  - `IMPORT_MAX_ROWS` = 5 000
  - `IMPORT_MAX_BYTES` = 4 MB
- **Pesos:**
  - Un `.xlsx` de 5 000 filas pesa unos 0,4 MB, y su vista previa unos 1,5 MB de JSON. Todo por debajo de los 4,5 MB de Vercel.
  - Un reporte de 10 000 filas pesa menos de 1 MB en base64.
- **Vista previa paginada y búsqueda en el navegador**, sin dibujar miles de filas.
- **Indicadores** en una sola consulta.
- **Invalidación precisa:** productos, categorías e indicadores.

## 11. Robustez y casos límite

| Caso | Comportamiento |
| --- | --- |
| Archivo `.xls`, `.csv` u otro | Se rechaza por extensión y por firma ZIP (`PK\x03\x04`), con un mensaje que explica cómo guardarlo como `.xlsx` (§12.1). |
| Archivo dañado o con contraseña | «No pudimos abrir el archivo…» (§12.1). No se cae la página. |
| Lista de precios subida por error | Se reconoce y se explica qué archivo usar (§12.1). |
| Hojas de más | Fase 2: la primera hoja con los títulos esperados, ignorando las reservadas (§9.2). Fase 3: se pregunta. |
| Títulos que no son los nuestros | Fase 2: «No encontramos las columnas…». Fase 3: asignar columnas (§7). |
| Falta la columna Código | «Falta la columna Código: es la que identifica cada producto.» |
| Fila de títulos en la fila 8 (reporte) | Se detecta: se busca en las primeras 20 filas. |
| Columnas extra (N°, fechas, Motivo) | Se ignoran. |
| Solo Código y Precio | Actualización parcial (§6.7). Los productos nuevos de ese archivo dan error con el motivo. |
| Mismo archivo subido dos veces | La segunda vez todo sale «Sin cambios» y no se escribe nada. Es idempotente. |
| Subir la hoja «Para revertir» | Devuelve los valores anteriores: es una actualización parcial normal. |
| Otra pestaña cambia el catálogo entre la vista previa y la importación | La importación vuelve a calcularlo todo en su transacción. El resultado muestra las cifras reales. |
| Categoría «laptops» y existe «Laptops» | Se usa la existente: misma regla que el índice único. |
| Categoría «Impresora» y existe «Impresoras» | Decisión obligatoria en la vista previa (§6.8). |
| La categoría de destino se borra antes de importar | El servidor lo detecta y pide volver a revisar el archivo. No se importa nada. |
| Restricción de la base que falla | Se revierte todo, no se guarda nada y se muestra el mensaje de §6.9. |
| Cortes de red | `settle()` convierte el rechazo en un mensaje y el archivo sigue elegido para reintentar. |
| Archivo enorme comprimido | Límite de 4 MB en la petición y de 5 000 filas al leer. Solo la cuenta dueña puede subir archivos. |
| Fórmulas en textos de los Excel de salida | Se escriben como texto (§5.2). |
| Cambio de día con la pantalla abierta | La clave de la consulta incluye los días concretos, así que «Hoy» se recalcula. |
| Empresa sin datos de contacto | La lista de precios muestra solo lo que haya. Si no hay nada, solo el nombre y el título. |

## 12. Comunicación con el usuario

- **Cada espera tiene un texto:**
  - «Preparando Excel…»
  - «Leyendo tu Excel…»
  - «Revisando N filas…»
  - «Importando N productos…»
- **Cada final tiene un resultado claro**, con un toast y, en la carga masiva, la vista de resultado y el comprobante.
- **Los errores y avisos dicen qué pasó y qué hacer**, en español y sin disculpas, con fila y columna.
- **Nada destructivo sin aviso:** confirmación antes de actualizar productos, decisión obligatoria en categorías parecidas y comprobante para revertir.
- **Nada importante solo con color,** en badges, tarjetas, barras y bordes.
- **Navegación sin callejones:**
  - Cada estado vacío o de error ofrece la acción siguiente.
  - Los indicadores aplican su filtro.
  - El resultado lleva a la lista filtrada.
  - El Excel lleva de vuelta a la vista con «Abrir esta vista en la app».

### 12.1 Mensajes de archivo

| Situación | Mensaje |
| --- | --- |
| No es `.xlsx` | «Ese archivo no es un Excel .xlsx. Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)".» |
| Más de 4 MB | «El archivo pesa más de 4 MB. Divide los productos en varios archivos.» |
| Más de 5 000 filas | «El archivo tiene más de 5 000 productos. Divídelo en archivos de hasta 5 000.» |
| Sin títulos (fase 2) | «No encontramos las columnas de la plantilla. La primera fila debe tener al menos Código y lo que quieras cargar o actualizar.» |
| Falta Código | «Falta la columna Código: es la que identifica cada producto.» |
| Es una lista de precios | «Este archivo es una lista de precios, para clientes. Para actualizar precios usa "Descargar mi catálogo" o la plantilla.» |
| Sin productos | «El archivo no tiene productos. Completa la plantilla desde la fila 2.» |
| Dañado o con contraseña | «No pudimos abrir el archivo. Si tiene contraseña, quítasela; si no, vuelve a guardarlo desde Excel.» |

## 13. Pruebas

Con TDD, como el resto del proyecto. Cada fase deja su CI en verde: formato, lint, tipos, unitarias, componentes, integración y e2e.

**Fase 1**

- **Unitarias:**
  - Rangos de fecha en Lima: hoy, 7 y 30 días, este mes, mes anterior (incluidos enero y meses de 28, 30 y 31 días), y la hora límite de las 23:59 en Lima, que ya es el día siguiente en UTC.
  - Parámetros de la URL, incluido `sort`.
  - Título del precio según `TAX_CONFIG`.
  - Reporte, leído de vuelta con ExcelJS: títulos, formatos, panel fijo, filtros, hipervínculo, resumen con barras de datos, aviso de recorte y textos con `=` escritos como texto.
  - Lista de precios, leída de vuelta: agrupación, contacto, nota del IGV y sin columnas internas.
  - Valor sin IGV igual que la «Op. gravada» de la proforma, y las columnas de precio para cada modo de `TAX_CONFIG`.
- **Integración** (Supabase local):
  - `search_products` y `export_products` con fechas de registro y de modificación (límites del día de Lima) y con cada orden, incluido el desempate estable entre páginas.
  - La llamada antigua de `search_products`.
  - `catalog_stats` en días de Lima.
  - El tope de filas y el permiso de dueño.
- **Componentes:** el control de fecha (rangos, personalizado, error «Desde > Hasta», chip), el selector de orden y los indicadores (cifras, estado pulsado, 0 desactivado).
- **E2E:**
  - Cada indicador aplica su filtro.
  - Elegir un rango y un orden actualiza la URL y la lista, y se conserva al recargar.
  - Descargar los dos formatos con filtros: se leen los archivos con ExcelJS y coinciden con la lista.

**Fase 2**

- **Unitarias:**
  - Cada tipo de celda (§9.3) y los precios en todos sus formatos, incluidos los erróneos.
  - Alias de títulos, hojas reservadas, lista de precios reconocida, fila de títulos en la fila 8, columnas extra, filas vacías, códigos y nombres repetidos y límites.
  - Reglas de columnas presentes y vacías (§6.7).
  - Categorías parecidas: casi igual, parecida, nueva y la más cercana.
  - Plantilla: desplegable desde la hoja oculta, validaciones, código en formato texto y título del precio.
  - Archivo de errores y comprobante leídos de vuelta. La hoja «Para revertir» se puede volver a subir.
  - Opciones: sumar IGV (redondeo al céntimo y precios límite) y los dos modos con sus filas omitidas. La simulación se lee de vuelta.
- **Integración:**
  - `preview_product_import` e `import_products`: nuevo, actualiza, sin cambios, actualización parcial (solo precio) y nombre existente.
  - Categoría nueva sin duplicar por mayúsculas.
  - Transacción completa: si una fila rompe una restricción, no se guarda nada.
  - `updated_at` intacto en las filas sin cambios, `changes` con los valores anteriores, límite de filas y solo el dueño.
- **Componentes:** vista previa (pestañas, contadores, búsqueda, paginación, detalle con %, avisos, bloque de categorías parecidas que impide importar sin decidir) y estados del botón.
- **E2E**, en PC y en móvil:
  - Las dos intenciones descargan el archivo correcto.
  - Subir un archivo con nuevos, cambios, avisos, una categoría parecida y errores: decidir, confirmar, resultado, comprobante y «Ver productos».
  - Subir solo Código y Precio: actualiza precios.
  - Subir la hoja «Para revertir»: vuelve a los valores anteriores.

**Fase 3**

- **Unitarias:** selección automática de columnas, fila de títulos, hojas con productos y aplicación de la asignación.
- **Componentes:** el paso «Dinos qué es cada columna» y el recordatorio de la asignación.
- **E2E:** un archivo con títulos de proveedor y dos hojas: asignar, elegir hoja, poner una categoría a las filas sin ella e importar.

## 14. Despliegue

Cada fase:

1. Copia de seguridad de la base y `pnpm db:push` con su migración, si la tiene.
2. Push a `main`; el CI se ejecuta solo.
3. En Vercel, **Deployments → Create Deployment → `main`**, porque el plan Hobby bloquea los despliegues automáticos de otros autores.
4. Comprobación en producción con la cuenta dueña, solo leyendo o con datos de prueba fáciles de reconocer (`PRUEBA-…`), que se borran al terminar.

Además se actualizan [setup.md](../../setup.md) y [deployment.md](../../deployment.md) con las migraciones nuevas y la carga masiva.

## 15. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| ExcelJS se mantiene poco (última versión estable de 2023) | Es estable y muy usado. Su uso queda aislado en `features/catalog/excel/`: si hubiera que cambiarla, solo se tocan esos módulos. Hay pruebas que leen de vuelta cada archivo generado. |
| Excel en otro idioma o región cambia separadores | Los precios se escriben como número en los archivos generados. Al leer, se aceptan ambos separadores (§9.3). |
| Vercel corta peticiones de más de 4,5 MB | Límite de 4 MB comprobado en el navegador y en el servidor. |
| Una importación grande actualiza datos por error | Vista previa obligatoria, avisos de cambios fuertes de precio, confirmación con el número de actualizaciones y hoja «Para revertir». |
| Categorías duplicadas por errores de tipeo | Detección de parecidas con decisión obligatoria (§6.8). |
| Precios cargados sin IGV | Título y ayudas «con IGV» en todos los archivos y en la pantalla (§3). |
| El alcance crece | Tres fases independientes. Cada una se publica y se prueba antes de empezar la siguiente. |

## 16. Para decidir más adelante

- **Historial de importaciones en la app**, para ver quién importó qué y cuándo. Exige una tabla nueva (PROJECT_CONTEXT §24: hay que explicarlo y aprobarlo antes). Mientras tanto, el comprobante cumple esa función.
- **Códigos automáticos** para filas sin código, por ejemplo con el prefijo de la categoría y un número. Es una regla de negocio y hay que definir el formato.
- **Precios por volumen u otras monedas**: fuera del modelo actual.
- **Ajuste masivo de precios sin Excel** *(rev. 3)*:
  - Por ejemplo, «subir 5 % a lo que estoy viendo», con redondeo opcional.
  - Reutilizaría la vista previa, la importación transaccional y el comprobante de la fase 2, así que sería una fase 4 corta.
- **Lista de precios en PDF y envío por WhatsApp** *(rev. 3)*:
  - Para mandarla a un cliente desde la app, reutilizando el PDF y el envío de la proforma.
- **Historial de precios por producto** *(rev. 3)*:
  - Para ver cómo cambió el precio de un modelo.
  - Exige una tabla nueva, igual que el historial de importaciones.
