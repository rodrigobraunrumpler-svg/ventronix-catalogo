# Diseño del catálogo privado y evolución a proformas

Fecha: 2026-09-29.

Fuente de alcance: [PROJECT_CONTEXT.md](../../../PROJECT_CONTEXT.md).
Plan de trabajo: [Catálogo y proformas](../plans/2026-09-29-catalogo-proformas.md).

## 1. Objetivo y estado

Construir una aplicación privada para una persona que administra categorías y productos, y que posteriormente prepara proformas, genera su documento y lo envía por WhatsApp.

Este documento registra el diseño propuesto para ejecutar el trabajo por entregas. La conversación autoriza preparar el plan; todavía no se ha creado la aplicación, contratado servicios ni publicado un despliegue. En la carpeta solo existe el contexto y la documentación de esta planificación; no hay una aplicación ni un repositorio Git operativo que permita hacer un commit ahora.

## 2. Decisiones confirmadas y supuestos

### Confirmado por el contexto y la conversación

- Una sola persona utilizará la aplicación; el catálogo será privado.
- Vercel será el alojamiento de la aplicación.
- Next.js con TypeScript y App Router; Supabase/PostgreSQL para datos.
- Tailwind CSS y shadcn/ui; React Hook Form y Zod; TanStack Query y `nuqs`.
- `fetch` nativo cuando corresponda; Sonner y `date-fns`.
- Toda la aplicación y su lógica de servidor estarán dentro de Next.js.
- Prioridad a PC, con funcionamiento correcto en móvil.
- Primera entrega: categorías y productos. Proformas, documento y WhatsApp tienen etapas propias.
- No incorporar stock, imágenes, marcas, almacenes ni campos adicionales del producto.
- Las proformas no tienen historial permanente ni URL pública en el alcance inicial.
- No almacenar PDF de forma permanente.
- WhatsApp debe utilizar un proveedor intercambiable; primero se evaluará una opción no oficial.

### Supuestos de trabajo propuestos para hacer concreto el plan

Estas son recomendaciones de diseño, no decisiones que estuvieran ya escritas en el contexto. Se utilizarán como base revisable; cualquier corrección del usuario actualiza este documento y el plan antes de ejecutar la tarea afectada.

| Tema | Propuesta |
| --- | --- |
| Acceso | Supabase Auth con una cuenta previamente creada, correo y contraseña; sin registro público ni módulo de usuarios. |
| Código | Entrada manual, obligatoria, única; quitar espacios exteriores y guardar en mayúsculas. |
| Nombre del producto | Obligatorio; se permite que distintos productos tengan el mismo nombre. |
| Descripción | Opcional; el texto vacío se guarda como `null`. |
| Categoría del producto | Obligatoria y existente. |
| Nombre de categoría | Obligatorio y único, ignorando mayúsculas y espacios exteriores. No equiparar automáticamente nombres con y sin tildes. |
| Precio | Mayor que cero; hasta dos decimales; máximo `9999999999.99`. Entrada decimal exacta, sin separadores de miles. |
| Moneda | Una moneda para todo el catálogo; PEN como supuesto provisional que se confirma antes de cargar precios reales. No se añade una columna de moneda. |
| Borrado | Borrado físico de productos con confirmación; categorías con productos no se pueden eliminar. |
| Consulta | Buscar por código o nombre; filtrar por categoría; 20 productos por página. Orden inicial por nombre y luego por ID. |
| Idioma | Interfaz en español. |
| Base técnica | Node.js 24.x, Next.js 16 estable y pnpm; dependencias fijadas mediante lockfile al crear la aplicación. |

La moneda del catálogo no define impuestos, descuentos ni condiciones de la futura proforma. Cambiar de moneda no es cambiar una etiqueta: los precios existentes se tendrían que revisar; por eso se confirma antes de introducir datos reales.

## 3. Enfoque seleccionado

Se compararon tres formas de avanzar:

| Enfoque | Ventaja | Coste o límite |
| --- | --- | --- |
| Catálogo por módulos completos, recomendado | Cada entrega se puede usar y verificar con datos reales. | El documento final y el envío llegan en entregas posteriores. |
| Maqueta completa antes de conectar datos | Permite decidir la apariencia muy pronto. | Retrasa la validación de permisos y reglas de datos; parte del trabajo es provisional. |
| Construir todo el flujo desde el comienzo | Visión funcional completa desde la primera entrega. | Exigiría inventar proforma, PDF e integración aún no definidos; no cumple el contexto actual. |

El diseño propone el primer enfoque, con una investigación temprana de la viabilidad de WhatsApp para detectar dependencias de alojamiento antes de llegar a la última fase.

## 4. Arquitectura y responsabilidades

```text
Navegador
  ├─ React Hook Form + schemas Zod: formularios
  ├─ nuqs: búsqueda, categoría y página
  ├─ TanStack Query: consultas, mutaciones y caché
  │    ├─ Consultas → servicios del catálogo → cliente Supabase con RLS
  │    └─ Mutaciones → Server Actions → autorización + Zod
  │                                      → repositorio con sesión de usuario
  └─ UI: shadcn/ui, Tailwind y Sonner

Supabase
  ├─ Auth: una cuenta autorizada
  └─ PostgreSQL: categories + products, constraints y RLS

Fases siguientes en Next.js
  └─ Proforma temporal → generador de documento → WhatsAppProvider
```

Las rutas componen pantallas. El dominio de catálogo agrupa categorías y productos en `src/features/catalog`, con submódulos separados. Sus tipos, schemas y claves de consulta se comparten dentro de ese dominio. Esto evita colocar reglas de catálogo en una carpeta genérica `shared` o crear dependencias circulares entre funcionalidades.

`src/features/auth` contiene la pantalla y las acciones de acceso. `src/lib/auth` contiene el pequeño control de autorización de servidor usado por las operaciones protegidas. `src/lib/supabase` contiene clientes e infraestructura, no reglas de negocio.

Las consultas cliente usan el SDK de Supabase, que utiliza HTTP; no se incorpora Axios. Las mutaciones de la UI pasan por Server Actions. No se crean API Routes de CRUD adicionales. La sesión usada por las Actions es la del usuario; no se utiliza una clave administrativa para operaciones cotidianas.

Como el usuario autorizado también puede llamar directamente a la API de Supabase, Zod no sustituye las restricciones de PostgreSQL. La base de datos debe asegurar integridad y permisos incluso si se omite la UI.

## 5. Acceso para una persona

La propuesta implementa un único acceso funcional con Supabase Auth. La protección de despliegues de Vercel puede ser una capa adicional, pero la aplicación no dependerá de ella para proteger datos.

- Crear administrativamente una cuenta y deshabilitar registro público e inicio de sesión anónimo.
- Marcar únicamente esa cuenta con `app_metadata.catalog_access = 'owner'`, desde una operación administrativa. No usar `user_metadata` para conceder acceso.
- Habilitar RLS en las dos tablas, retirar acceso a `anon` y restringir operaciones de usuarios autenticados a esa marca administrativa.
- Comprobar la identidad con `getUser()` y la marca autorizante en cada Server Action protegida. Comprobarla también al entrar al área privada.
- Utilizar clientes Supabase separados para navegador y servidor, con renovación de sesión y cookies conforme al adaptador SSR.
- Al cerrar sesión, limpiar la caché de TanStack Query y salir del área privada.
- Mostrar un error de acceso genérico; no imprimir tokens, contraseñas ni claves en logs.
- No añadir tablas `users`, `profiles`, organizaciones o roles del negocio. Supabase administra sus tablas internas de Auth.

La metadata incluida en un JWT puede conservarse hasta que el token se renueve. Revocar acceso requiere contemplar la vigencia de sesiones; no se promete revocación instantánea en consultas directas por cambiar la metadata.

La recuperación de la cuenta será inicialmente administrativa y documentada. No se incorpora un flujo de correo transaccional ni nuevas dependencias de SMTP para la primera entrega.

## 6. Datos e invariantes

Se mantienen exactamente las columnas del contexto:

| Tabla | Columnas |
| --- | --- |
| `categories` | `id`, `name`, `created_at`, `updated_at` |
| `products` | `id`, `code`, `name`, `description`, `category_id`, `unit_price`, `created_at`, `updated_at` |

- UUID generado en PostgreSQL para IDs internos. `nanoid` no se necesita en esta entrega.
- Timestamps `timestamptz`, generados y actualizados en servidor.
- Índice único sobre `lower(btrim(categories.name))`.
- Código almacenado normalizado, con unicidad en PostgreSQL.
- Nombre/código de producto y nombre de categoría no pueden quedar vacíos.
- FK de `products.category_id` a `categories.id`, con `ON DELETE RESTRICT`.
- Índice sobre `products.category_id`; índice de ordenación por nombre e ID si lo justifica la consulta inicial.
- `unit_price` decimal exacto con restricciones de positividad, rango y máximo dos decimales. Evitar una coerción SQL que redondee silenciosamente una entrada inválida antes de validarla.
- Límites propuestos: código 64 caracteres, nombres 120, descripción 2000, búsqueda 120.

El precio viaja como string decimal en formularios, DTO y Server Actions. Para leerlo, proyectar `unit_price::text` en PostgREST y validar/normalizar la respuesta. No convertir con `parseFloat` para validarlo ni calcular dinero con valores de coma flotante.

Errores esperados: código repetido, categoría repetida, categoría ocupada, categoría inexistente, registro eliminado mientras se editaba, precio inválido, sesión vencida y fallo de conexión. Mostrar un mensaje útil y conservar el formulario cuando se pueda corregir o reintentar.

## 7. Pantallas y comportamiento

| Ruta | Responsabilidad |
| --- | --- |
| `/login` | Acceso de la cuenta existente. |
| `/` | Llevar al catálogo o al acceso según sesión. |
| `/products` | Pantalla única del catálogo: categorías y productos se gestionan aquí sin cambiar de página. |

Decisión validada con el prototipo (2026-09-29): productos y categorías comparten la pantalla **Productos**. Sustituye las rutas separadas `/products/new`, `/products/[id]/edit` y `/categories` de la versión anterior de este diseño.

- **Navegación:** menú lateral con un único destino, Productos. No añadir dashboard con métricas ni enlaces a módulos que aún no funcionan.
- **Tarjeta Categorías**, a la izquierda de la tabla: «Todos los productos» y cada categoría con su número de productos; un clic filtra la tabla. «Nueva» abre el diálogo de creación. Renombrar y eliminar aparecen al pasar el cursor, al enfocar la fila o al seleccionarla. Solo se eliminan categorías sin productos, y la tarjeta lo indica.
- **Tabla de productos**, a la derecha: buscador, tabla y paginación. «Nuevo producto» y editar abren el formulario en una ventana centrada (`Dialog` de shadcn/ui) sobre la misma pantalla, con los campos en dos columnas en PC. Al crear, «Crear y añadir otro» guarda, deja la categoría elegida y vuelve a Código para cargar productos seguidos. El borrado se confirma en un diálogo. El estado de las ventanas no va en la URL.
- **Borradores del formulario de producto** (pedido del usuario): lo escrito se guarda en el navegador (`localStorage`) a cada cambio. Cerrar la ventana o recargar no lo pierde. Al volver a abrir se recupera con el aviso «Recuperamos lo que estabas escribiendo» y la opción «Descartar». Al guardar se borra el borrador. Cada producto en edición tiene el suyo, que se descarta si el producto cambió después. Cerrar sesión borra todos los borradores.

En PC, tabla legible con nombre, código, descripción abreviada, categoría, precio y acciones. La descripción completa se consulta en edición; no se pierde información del catálogo. En móvil, presentación adaptada y formularios utilizables sin desbordamiento horizontal de la página.

`nuqs` controla `search`, `category` y `page`. Un cambio de búsqueda o categoría vuelve a página 1. Búsqueda con debounce de 300 ms; navegación atrás/adelante restaura filtros. No guardar credenciales ni borradores de formularios en la URL.

Si no existen categorías, el formulario de producto explica que debe crearse una y ofrece crearla ahí mismo, con el diálogo de nueva categoría. Si un borrado deja vacía la última página, ajustar la página de consulta. No simular ordenamiento sin tenerlo implementado; el MVP usa orden fijo estable.

Cada pantalla contempla carga, vacío inicial, ningún resultado para filtros, error con reintento y estado satisfactorio. Formularios con etiquetas, errores asociados a campos, navegación por teclado y foco visible. Confirmación de borrado con nombre del elemento; feedback mediante Sonner.

### Dirección visual

Referencia: [prototipo en el lienzo de diseño](https://claude.ai/artifact/7KjkXAw98vwSPa8hGesjfh) (privado; se comparte desde su menú Share).

- **Tipografía:** Plus Jakarta Sans para la interfaz y JetBrains Mono para códigos, cargadas con `next/font`. Ningún texto por debajo de 12 px; tabla y formularios a 14 px.
- **Marca:** Ventronix. El isotipo (V en círculo) aparece en el menú, los íconos y la 404, y el logotipo en el panel negro del acceso. Todos se generan a partir de `public/logo.png` y `public/portada.png`, que tienen fondo negro.
- **Color:** verde lima de marca `#72CE0B`, reservado para rellenar acciones (botones principales) siempre con texto oscuro `#0C0F0A` (9.6:1). No se usa como texto ni como foco sobre blanco (2:1); el foco usa el verde oscuro `#3F7D0A` (5:1) y los enlaces van en texto oscuro con subrayado lima. El resto va en neutros: `#F4F5F2` de fondo, `#E3E7DE` en bordes y texto `#121511`. Menú lateral claro; el negro queda para la marca. Se definen como variables del tema de shadcn/ui en `globals.css`.
- **Íconos:** lucide-react, que ya incluye shadcn/ui.
- **Categorías con color:** cada una recibe un color de una paleta fija sin tonos cercanos al verde de las acciones, derivado de forma determinista de su ID. El color aparece solo en la etiqueta de la tabla y en la tarjeta Categorías; las filas no llevan miniatura. No se añaden columnas de color ni de ícono; el prototipo elige los íconos por nombre solo para ilustrar. El nombre siempre aparece en texto.
- **Accesibilidad:** contraste de texto de al menos 4.5:1 (etiquetas de categoría incluidas), controles de 36 px o más, foco visible y errores junto a cada campo.

## 8. Caché y consistencia

- Claves TanStack Query bajo el prefijo `catalog`, con filtros normalizados en las listas.
- Crear/editar/eliminar producto invalida listas y el detalle afectado.
- Cambiar categorías invalida lista de categorías, opciones de formularios y listas/detalles de productos que muestran su nombre.
- No duplicar los datos remotos en `useState`.
- Los formularios editan un borrador con React Hook Form; un refetch no sobrescribe cambios sin guardar.
- Evitar caché pública para datos autenticados. La primera entrega no añade otra caché persistente de servidor al catálogo.
- Doble clic en guardar no genera dos mutaciones de la UI; los constraints siguen siendo la protección final ante concurrencia.

## 9. Pruebas y definición de terminado

Una entrega queda terminada cuando cumple sus criterios funcionales, pasa las comprobaciones que le corresponden y tiene instrucciones reproducibles para ejecutarla.

- Vitest: schemas, normalización de códigos, precios y parámetros de consulta.
- React Testing Library: errores y envío de formularios críticos, confirmación de borrado y estado sin categorías.
- Integración contra Supabase de pruebas: constraints, RLS, usuario autorizado/no autorizado y errores concurrentes.
- Playwright: acceso, categoría, producto, búsqueda/filtro, edición, borrado y protección de acceso.
- ESLint, TypeScript, Prettier y build de producción.
- Comprobación de teclado, foco y tamaños de pantalla representativos de PC y móvil.

Las pruebas usan datos desechables y un proyecto de Supabase separado del de producción. Nunca ejecutar un reset, fixtures destructivos ni pruebas de permisos sobre datos reales.

## 10. Evolución sin inventar requisitos

### Proformas

El siguiente diseño debe cerrar cliente, empresa, numeración, moneda, cantidades, IGV/impuestos, descuentos, redondeos, totales, vigencia y condiciones. Antes de implementar habrá ejemplos de cálculo con resultados esperados y una referencia visual validada.

Los datos seleccionados de cada producto se capturan en el borrador; editar el catálogo después no altera silenciosamente esa selección. Crear una proforma tampoco modifica el catálogo. El borrador es temporal; no se asume persistencia entre recargas.

Punto de entrada validado en el prototipo: casillas de selección en la tabla de productos y, cuando hay productos marcados, una barra sobre la tabla con el botón «Generar proforma». No forma parte de la primera entrega; se implementa con la fase de proformas.

### Documento

Definir formato, diseño, tamaño de página, contenido y comportamiento multipágina antes de seleccionar librería. La generación recibe datos de proforma y produce un documento reutilizable por descarga y envío. La imagen se incorpora solo si existe un requisito concreto.

### WhatsApp

La investigación temprana evalúa primero una integración no oficial y registra viabilidad en Vercel. Las Functions tienen límites de ejecución; una sesión requiere recuperación y coordinación entre invocaciones. El resultado no se presupone favorable.

Credenciales de sesión y PDF/proformas son clases de datos diferentes: no conservar documentos no elimina la necesidad de resolver cómo se guardan y protegen las credenciales. Antes de añadir un almacenamiento o proveedor externo se documentará su impacto y se acordará el cambio.

El envío real se integra detrás de `WhatsAppProvider` después de definir el documento. Una prueba que contacte un teléfono real exige un destinatario de prueba y autorización expresa; el plan por sí solo no autoriza mensajes.

Si la opción no oficial no resulta fiable dentro de las restricciones, se presentará la evidencia y alternativas concretas. No sustituir automáticamente el envío por un enlace, adjunto manual, API oficial o backend separado.

## 11. Despliegue y operación

- Desarrollo local, Supabase de pruebas y Supabase de producción separados.
- Migraciones versionadas y verificadas sobre una base vacía de pruebas antes de aplicarlas a producción.
- `.env.example` explica variables; valores reales permanecen fuera del repositorio.
- Clave publicable de Supabase y URL pueden usarse en navegador con RLS. Claves administrativas, credenciales de WhatsApp y demás secretos permanecen en servidor.
- Una cuenta de acceso y procedimiento administrativo de recuperación documentado.
- Vercel con runtime compatible, build reproducible y variables diferenciadas entre preview y producción.
- Preparar y verificar el resultado antes de efectuar cambios externos que requieran autorización o contratación.
- Documentar costes operativos; el uso privado no modifica por sí mismo las condiciones comerciales del alojamiento.

## 12. Referencias técnicas verificadas

Consultadas el 2026-09-29; comprobar de nuevo si la ejecución ocurre después de cambios relevantes de versión.

- [Instalación oficial de Next.js](https://nextjs.org/docs/app/getting-started/installation): base de App Router y herramientas de scaffolding.
- [Node.js en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions): soporte de Node.js 24.x.
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client): clientes y renovación de sesión.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): permisos de datos y metadata confiable.
- [Supabase Auth](https://supabase.com/docs/guides/auth/general-configuration): deshabilitar nuevos registros.
- [Casting en PostgREST](https://postgrest.org/en/stable/references/api/tables_views.html#casting-columns): lectura decimal como texto.
- [Límites de Vercel Functions](https://vercel.com/docs/functions/limitations): duración y límites de ejecución que debe considerar la investigación de WhatsApp.
- [Sesiones de Baileys](https://baileys.wiki/authentication/session-management): credenciales y claves de sesión.
- [Autenticación de whatsapp-web.js](https://wwebjs.dev/guide/creating-your-bot/authentication.html): almacenamiento y restauración de sesión.
