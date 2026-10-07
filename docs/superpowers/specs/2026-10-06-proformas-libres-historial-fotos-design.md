# Proformas: productos libres, historial, fotos y mensaje editable

Fecha: 06-10-2026. Estado: **aprobada** (06-10-2026).

Maqueta de las pantallas: [Proformas: maqueta de la nueva fase](https://claude.ai/artifact/EBXHNm17egfCJnVCJZJb5T).

Parte del módulo de proformas ([spec de proformas](2026-09-30-proformas-design.md), [documento y WhatsApp](2026-09-30-documento-y-whatsapp-design.md)). Reglas del proyecto: [PROJECT_CONTEXT.md](../../../PROJECT_CONTEXT.md).

## 0. Lo acordado con el cliente

| # | Pedido | Decisión |
| --- | --- | --- |
| 1 | Hacer proformas sin crear categorías ni productos | **Productos libres** en la proforma: descripción, cantidad, precio y, opcionalmente, código y foto. No se guardan en el catálogo ni se pasan a él después. |
| 2 | Editar el mensaje que acompaña al PDF | **Mensaje de WhatsApp editable** en Empresa, con datos que se reemplazan solos. |
| 3 | Historial para reenviar, porque los clientes pierden la proforma | **Historial de proformas**: se guardan **para siempre**. Búsqueda por cliente, filtro por fechas, **páginas desde el primer día**, «Descargar Excel» como el de Productos y **«Reenviar»**. |
| 4 | Imagen opcional por producto en la proforma | **Fotos opcionales** en los productos del catálogo **y en los productos libres**. Columna «Foto» en el PDF, con el interruptor «Incluir fotos». |

Estas decisiones cambian tres reglas de PROJECT_CONTEXT, por pedido explícito del cliente:

- la proforma ya no se construye solo con productos existentes (§9);
- las proformas se guardan (§14: historial, reenvío y consulta posterior);
- los productos tienen foto (§5: `images`).

## 1. Objetivo

Que preparar, enviar y volver a enviar una proforma sea rápido aunque los productos no estén en el catálogo. Que ninguna proforma enviada se pierda.

## 2. Alcance y orden

Cuatro entregas, cada una publicable por separado:

1. **Mensaje editable** (Empresa). Pequeña: una columna nueva.
2. **Productos libres y «Nueva proforma»**, sin pasar por el catálogo.
3. **Historial**: guardar al generar, páginas, filtros, Excel y reenvío.
4. **Fotos**: en productos y productos libres, y en el PDF.

**Fuera de alcance:**

- estados de la proforma (aceptada o rechazada);
- pasar un producto libre al catálogo;
- borrar o anular proformas;
- un enlace público para el cliente;
- guardar los PDF como archivos;
- historial de precios.

## 3. Decisiones

| Tema | Decisión |
| --- | --- |
| Código de un producto libre | Opcional. En el PDF sale «—». |
| Proformas guardadas | Para siempre. No hay borrado. |
| Qué se guarda | Una **copia** al generar: líneas, cliente, condiciones, totales, rutas de las fotos y los datos de la empresa de ese día. Un reenvío sale idéntico aunque después cambien los precios o la empresa. |
| PDF del historial | No se guarda el archivo: se vuelve a generar desde la copia, al ver, descargar o reenviar. |
| «Corregir» una proforma generada | Conserva el número (como hoy) y actualiza la misma fila del historial. |
| Proformas anteriores a esta fase | No están en el historial: no se guardaban. |
| Páginas del historial | 20 proformas por página, contadas en la base. La página, la búsqueda y las fechas van en la URL. |
| Fotos | Opcionales. Se eligen con un selector de imagen (JPG, PNG o WebP) y el navegador las reduce a 600 px por el lado mayor, en JPEG (unos 40–60 KB), con una miniatura de 200 px (unos 12 KB) para el PDF y las listas, antes de subirlas a Supabase Storage. No se guarda el original. |
| Fotos en el PDF | Columna «Foto» de unos 1,5 cm, con la miniatura. Solo crecen las filas con foto. Interruptor «Incluir fotos en el PDF», activado si algún producto tiene foto. Debajo de la tabla: «Imágenes referenciales.» Hasta unos 2,5 MB de fotos por PDF (unas 200): si hubiera más, las demás se omiten y el PDF se genera igual. |
| Cambiar la foto de un producto | Se sube un archivo nuevo. Las proformas anteriores conservan la que tenían. |
| Mensaje de WhatsApp | Uno para toda la empresa, hasta 500 caracteres, con `{cliente}`, `{numero}`, `{total}`, `{vence}` y `{empresa}`. Vacío vuelve al mensaje actual. |

## 4. Pantallas

### 4.1 Menú

«Proformas» se añade entre «Productos» y «Empresa», en PC y en el teléfono.

### 4.2 Proformas: historial

Maqueta: «Proformas · historial en PC» y «… en el teléfono».

- **Cabecera:**
  - título «Proformas» con las cifras «N proformas · N este mes»;
  - subtítulo «Todas las proformas generadas. Búscalas por cliente o fecha y reenvíalas cuando el cliente las pierda.»;
  - botones «Descargar Excel» (secundario) y «Nueva proforma» (principal). Sin nada que descargar, «Descargar Excel» se ve desactivado y explica por qué al pasar el mouse o al pulsarlo: «Todavía no hay proformas para descargar.» o «No hay proformas para descargar con estos filtros.». El «Excel» de Productos hace lo mismo.
- **Filtros:**
  - búsqueda por nombre del cliente, RUC, DNI, celular o N° de proforma, sin tildes ni mayúsculas; con un número, esa proforma va primero;
  - filtro de fecha como el de Productos (hoy, 7 y 30 días, este mes, mes anterior y un rango propio), en días de Lima;
  - «Limpiar filtros».
- **Resumen del periodo:** cuántas proformas y la suma de sus totales.
- **Tabla:**
  - columnas N° · Fecha · Cliente · RUC/DNI · Productos · Total · Vence · Acciones;
  - ordenada por número, de la más reciente a la más antigua;
  - acciones: «Ver PDF», «Descargar PDF» y «Reenviar»;
  - «Vence» dice «Vencida» cuando la fecha ya pasó (en días de Lima);
  - el nombre del cliente muestra todas sus proformas, de cualquier fecha.
- **Páginas:** «Proformas 1–20 de 48», con Anterior, los números de página y Siguiente.
- **Todo se resuelve en el servidor:** la base filtra, cuenta y suma, y devuelve solo las 20 proformas de la página.
  - La búsqueda espera a que se termine de escribir.
  - Cambiar un filtro vuelve a la página 1.
  - Filtros y página van en la URL: recargar o compartir el enlace muestra lo mismo.
- **En el teléfono:** tarjetas con N°, fecha, cliente, documento, total, «Descargar» y «Reenviar», y las páginas abajo.
- **Estados vacíos:**
  - «Todavía no hay proformas guardadas», con el botón «Nueva proforma»;
  - «Ninguna proforma coincide con la búsqueda», con «Limpiar filtros».

### 4.3 Nueva proforma y productos libres

Maqueta: «Nueva proforma con producto libre».

- **Dónde se abre:**
  - desde «Proformas › Nueva proforma», con la proforma vacía. Si hay una sin generar, pregunta antes: «Seguir con la actual» o «Empezar una nueva». La barra de la proforma también se ve en Proformas;
  - desde la barra de Productos, como hoy.
- **La ventana** es la misma de hoy.
  - Junto al buscador del catálogo va el botón **«Añadir producto libre»**. Abre un formulario con:
    - Descripción (obligatoria);
    - Código (opcional);
    - Cantidad;
    - Precio con IGV;
    - Foto (opcional).
  - El formulario lleva la nota «Para productos que no están en el catálogo. No se guardan en él.».
  - Tras añadir uno, avisa «Añadiste «…»» y queda vacío para el siguiente; «Cancelar» pasa a «Cerrar».
  - Cada línea muestra su foto, o «Sin foto». Las libres llevan la etiqueta «Producto libre».
  - Las líneas libres no avisan de «precio cambiado» ni de «Ya no está en el catálogo».
- **Cliente** (confirmado): al escribir un RUC (11 dígitos) o un DNI (8) que ya tiene proformas, se toma su proforma más reciente, con una consulta por el índice del documento.
  - Se completan el nombre, el celular y la dirección, solo en los campos vacíos, y todo sigue editable.
  - El tiempo de entrega no se copia: cambia en cada venta.
  - Aviso: «Cliente con 6 proformas: datos completados».
  - Un RUC sin historial se consulta en SUNAT, como hoy. El aviso de SUNAT (baja o no habido) se mantiene en los dos casos.
  - No hay una lista aparte de clientes: los datos salen del historial.
- **Resumen:**
  - el interruptor **«Incluir fotos en el PDF»** (§4.5);
  - «Generar proforma», con «Recibe su número correlativo y queda guardada en el historial de Proformas.»;
  - ya generada: «Quedó guardada en el historial», con el enlace a Proformas si se generó desde Productos.

### 4.4 Reenviar

Maqueta: «Reenviar una proforma».

- **Título:** «Reenviar proforma N° 0042», con el cliente, el total y la fecha en que se generó.
- **Celular del cliente:** el de la proforma, editable solo para este envío.
- **Mensaje:** el de Empresa, con los datos de esa proforma.
- **Nota:** «Se envía el mismo documento que se generó: mismos productos, precios, fotos y datos de la empresa de ese día.»
- **Si ya venció:** «Venció el 09/10/2026. Si los precios cambiaron, genera una proforma nueva antes de enviarla.»
- **Acciones:**
  - «Enviar por WhatsApp»: se envía solo con el WhatsApp de la empresa vinculado; si no, abre el chat con el mensaje listo, como hoy;
  - «Descargar PDF»;
  - «Cancelar».

### 4.5 PDF con fotos

Maqueta: «PDF con fotos».

- Primera columna «Foto», de unos 1,5 cm. La foto va completa, sin recortar, sobre fondo claro.
- Las filas sin foto siguen tan compactas como hoy, y un producto libre sin código muestra «—».
- Debajo de la tabla: «Imágenes referenciales.»
- **Con fotos** entran unos 10 a 12 productos por hoja. La regla actual sigue igual: primero el diseño normal; si no cabe, el compacto; si aun así no cabe, varias hojas.
- **Sin fotos** (interruptor apagado), el PDF queda exactamente como hoy.

### 4.6 Empresa: mensaje de WhatsApp

Maqueta: «Empresa · mensaje de WhatsApp».

- **Pestaña nueva «Mensaje»** con:
  - el texto del mensaje;
  - botones para insertar los datos (Cliente, N° de proforma, Total, Válida hasta y Empresa);
  - el contador «112 / 500»;
  - «Volver al mensaje original».
- **Vista previa** «Así lo recibe el cliente»: un globo de WhatsApp con el PDF adjunto y el mensaje con datos de ejemplo.
- **Datos tolerantes:** `{Número}`, `{ CLIENTE }` y `{numero}` son el mismo dato. Lo que va entre llaves y no es un dato se avisa: «{precio} no es un dato y se enviará tal cual.».
- **Dónde se usa:** al enviar por WhatsApp (automático o abriendo el chat) y al reenviar desde el historial.

### 4.7 Producto con foto

Maqueta: «Producto con foto».

- En el formulario del producto, un campo **«Foto (opcional)»** con:
  - la vista previa;
  - «Elegir foto», o «Cambiar foto» y «Quitar foto» si ya tiene;
  - la ayuda «JPG, PNG o WebP. Antes de guardarla se reduce a 600 px (unos 50 KB).»;
  - la foto elegida se ve al instante, mientras se sube.
- La ficha del producto muestra la foto. La lista no cambia.

## 5. Datos

Migraciones nuevas, todas solo añaden cosas:

- **`company_profile.whatsapp_message`** (`text`, nulo = mensaje original, hasta 500 caracteres).
- **`products.image_path`** (`text`, nulo = sin foto).
- **Storage:** bucket privado `images`.
  - Rutas: `products/<uuid>.jpg` y `lines/<uuid>.jpg`, cada una con su miniatura `<uuid>.thumb.jpg`.
  - Políticas: solo la cuenta dueña lee y sube. No se borran archivos: una proforma guardada puede usarlos.
- **`proformas`:**
  - `id`, `number` (único);
  - `issued_at`, `valid_until`;
  - `client_name`, `client_document`, `client_phone`;
  - `item_count`, `total`, `include_photos`;
  - `document` (`jsonb`): la copia de líneas, cliente, condiciones y empresa;
  - `created_at`, `updated_at`.
  - Índices: por número, por fecha y por documento del cliente.
  - RLS: solo la cuenta dueña.
- **Funciones:**
  - `search_proformas`: búsqueda, fechas y página; devuelve las filas, el total de proformas y la suma del periodo;
  - `export_proformas`: lo filtrado para el Excel, con el mismo tope de 10 000 filas que Productos.
- **Borrador del navegador:** las líneas pueden no tener producto (libres) y guardan la ruta de su foto. Los borradores antiguos se siguen leyendo.

## 6. Flujos

- **Generar:**
  1. reserva el número (como hoy);
  2. el servidor valida y recalcula todo;
  3. arma el PDF;
  4. guarda o actualiza la copia en `proformas`, por número.
- **Ver y descargar PDF:** se arma desde la copia.
- **Reenviar:** el PDF desde la copia y el mensaje de Empresa con sus datos, por el mismo envío de WhatsApp de hoy.
- **Excel del historial:**
  - columnas: N°, fecha, cliente, RUC/DNI, celular, productos, total y vence;
  - debajo, la suma del periodo;
  - el nombre del archivo lleva el filtro, como en Productos.
- **Subir una foto:**
  1. se elige en el selector;
  2. el navegador la reduce a 600 px en JPEG;
  3. se sube al bucket con la sesión de la cuenta;
  4. el servidor solo acepta rutas dentro de `products/` o `lines/` de ese bucket.

## 7. Rendimiento y escala

- **Historial:** se pide de 20 en 20 y la base cuenta el total. Con decenas de miles de proformas, los índices por fecha y documento mantienen la consulta en milisegundos.
- **Fotos:** 1 000 productos con foto ocupan unos 62 MB (foto y miniatura). Los productos libres, a 10 fotos al día, unos 190–250 MB al año. El plan gratuito trae 1 GB y el Pro, 100 GB.
- **PDF con fotos:** el servidor descarga las miniaturas del bucket al armarlo. Con 30 productos con foto son unos 360 KB, y el PDF pesa unas cinco veces menos que con las fotos de 600 px. Así queda muy por debajo del límite de 4,5 MB de una respuesta en Vercel.
- **Excel:** el mismo tope y el mismo motor que el de Productos.

## 8. Seguridad

- **Tablas y bucket privados**, con RLS para la cuenta dueña, como el catálogo.
- **El navegador no decide los totales ni las rutas:** el servidor recalcula la proforma y valida cada ruta de foto.
- **Ningún secreto en el navegador:** la subida usa la sesión de la cuenta.

## 9. Pruebas

- **Unitarias:**
  - el mensaje con sus datos, el vacío y el límite de caracteres;
  - las líneas libres en el borrador y en el PDF;
  - la copia que se guarda;
  - la reducción de la foto.
- **Integración:**
  - `search_proformas` con búsqueda, fechas y páginas;
  - `export_proformas`;
  - guardar y actualizar por número;
  - las políticas del bucket y de las tablas.
- **Componentes:**
  - el formulario de producto libre;
  - el interruptor de fotos;
  - el historial (filtros y páginas);
  - el editor del mensaje;
  - el campo de foto.
- **E2E en PC y en el teléfono:**
  1. proforma con un producto libre con foto;
  2. generarla;
  3. encontrarla en el historial;
  4. filtrar, cambiar de página y descargar el Excel;
  5. reenviar (con el proveedor de prueba);
  6. subir la foto de un producto.

## 10. Despliegue

1. Copia de seguridad.
2. `pnpm db:push`: las columnas, la tabla, las funciones, el bucket y sus políticas.
3. Push.
4. Create Deployment en Vercel.

Cada entrega del §2 se publica por separado.

## 11. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El espacio de fotos crece | Fotos reducidas a ~50 KB. Se revisa el uso en el panel de Supabase; el plan Pro trae 100 GB. |
| Proformas largas con fotos ocupan más hojas | El interruptor «Incluir fotos» deja el PDF de siempre. |
| El cliente espera ver proformas antiguas | Se avisa: el historial empieza con esta versión. |
| «Corregir» cambia una proforma ya enviada | Mantiene el número, como hoy. El historial muestra la última versión. |

## 12. Confirmaciones

- **Confirmado:** completar los datos del cliente desde el historial al escribir su RUC o DNI (§4.3).
- **Confirmado:** 20 proformas por página, con los filtros y las páginas resueltos en el servidor (§4.2).
- **Confirmado:** «Corregir» (el botón que ya existe tras «Generar») conserva el número y actualiza la misma proforma del historial: un número, una proforma, siempre su última versión, sin guardar versiones anteriores.

## 13. Mejoras de rendimiento, robustez y uso (06-10-2026)

Añadidas a pedido del usuario, sobre lo acordado:

- **Rendimiento:**
  - miniatura de 200 px para el PDF y las listas;
  - el PDF de cada proforma se reutiliza un minuto en el navegador («Ver», «Descargar» y «Reenviar» no lo generan otra vez);
  - la foto elegida se ve al instante;
  - la lista se atenúa mientras se actualiza, sin vaciarse.
- **Robustez:**
  - «Nueva proforma» pregunta antes de borrar una proforma sin generar;
  - tope de fotos por PDF;
  - una copia guardada que no se puede leer lo dice con claridad;
  - una prueba fija la copia tal como se guarda hoy, para que un cambio futuro no deje sin leer las proformas guardadas;
  - pruebas de que Proformas llena el contenedor sin desbordarse.
- **Uso:**
  - búsqueda por N° de proforma y por celular;
  - «Vencida» en la lista y aviso en «Reenviar»;
  - el nombre del cliente muestra todas sus proformas;
  - datos del mensaje tolerantes y aviso de los desconocidos;
  - confirmación de cada producto libre añadido;
  - «Quedó guardada en el historial» al generar;
  - al cambiar de página desde abajo, la lista vuelve a su inicio;
  - «Descargar Excel» sin nada que descargar explica por qué, en Proformas y en Productos.
