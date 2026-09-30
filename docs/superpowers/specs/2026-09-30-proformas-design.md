# Diseño de la proforma

Fecha: 30-09-2026. Estado: diseño aprobado en conversación; pendiente de la revisión de este documento antes del plan.

Tarea 9 del [plan del catálogo](../plans/2026-09-29-catalogo-proformas.md). Parte de [PROJECT_CONTEXT.md](../../../PROJECT_CONTEXT.md) §8–14 y de la [spec del catálogo](2026-09-29-catalogo-design.md). Prototipo aprobado: [lienzo, pizarras «Productos + proforma» y «Proforma · Documento A4»](https://claude.ai/artifact/7KjkXAw98vwSPa8hGesjfh) (privado). El ejemplo de proforma que envió el usuario se usó solo como referencia de estructura: ninguno de sus datos entra en la app.

## 1. Objetivo

Armar y generar una proforma en uno o dos minutos **sin salir de la pantalla Productos**, con cálculos exactos al céntimo.

- La proforma se arma con productos del catálogo; sus valores se copian al añadirlos y **el catálogo nunca se modifica** desde la proforma.
- La proforma **no se guarda** como historial: es temporal hasta que se genera y se envía.
- Criterio de éxito: el recorrido «añadir → completar → generar» funciona de punta a punta, y los cálculos cumplen los ejemplos de la sección 5.

## 2. Alcance

**Esta etapa (tarea 9):** carrito en Productos, ventana «Completar proforma», cálculos con IGV, borrador en el navegador, consulta de RUC, datos de la empresa en la base con su pantalla, numeración correlativa, búsqueda sin tildes, atajos de teclado y versión móvil.

**Decidido para después:**

- Tarea 10 (documento): vista previa marcada «Borrador», PDF con la plantilla del prototipo, importe en letras y nombre de archivo claro.
- Tarea 11 (WhatsApp): envío con el mensaje ya escrito (saludo, número, total y validez).

**Fuera de alcance:** historial de proformas, URLs públicas, lista de clientes guardados, clientes recientes, dólares, líneas libres fuera del catálogo, observaciones, descuento por línea y varias proformas a la vez.

## 3. Decisiones

| Tema | Decisión |
| --- | --- |
| Emisor | Ventronix, con su logo y sus propios datos. |
| Pantalla | Dentro de Productos: «Añadir» en cada producto, barra de proforma y ventana centrada «Completar proforma». |
| Moneda | Solo soles (S/). |
| IGV | Precios del catálogo con IGV incluido y desglose al pie. Aislado en un módulo configurable (sección 5.2), pendiente de confirmar con quien envió el ejemplo. |
| Ajustes de precio | Precio editable en cada línea y descuento general en % sobre el total parcial. |
| Envío | Monto opcional que se suma al neto. |
| Cliente | Razón social o nombre, RUC o DNI, celular; en «Más datos», dirección, tiempo de entrega y validez. Se escribe en cada proforma; no se guarda. |
| RUC | Se autocompleta razón social y dirección fiscal desde SUNAT, con aviso si el RUC no está activo o no está habido. El DNI se escribe a mano. |
| Términos y cuentas | Fijos de Ventronix, guardados en la base y editables en la pantalla «Empresa». En cada proforma cambian solo la validez y el tiempo de entrega. |
| Numeración | Correlativa automática al generar. Corregir antes de empezar otra proforma conserva el número. |
| Borrador | En el navegador, una proforma a la vez; se borra al cerrar sesión. |

## 4. Flujo y pantalla

### 4.1 Lista de productos

- Nueva columna **Proforma** (y el mismo control en las tarjetas del móvil): «Añadir» agrega una unidad y se convierte en `[− n +]`. Bajar de 1 quita el producto de la proforma. Las filas incluidas se marcan con un fondo verde claro.
- Búsqueda **sin tildes**: «impresion» encuentra «Impresión» (sección 8). También mejora la búsqueda del catálogo.
- Si la búsqueda deja **un solo producto**, Enter en el buscador lo añade a la proforma (pensado para escribir un código como `LAP-001`).
- La tecla «/» lleva al buscador cuando el foco no está en un campo de texto.

### 4.2 Barra de proforma

Aparece con al menos un producto, fija abajo de la pantalla (a todo el ancho en móvil). Muestra productos y unidades, el **total con IGV**, «Vaciar» y **«Completar proforma»**. «Vaciar» y quitar una línea muestran un aviso con **«Deshacer»** durante 5 segundos, en lugar de pedir confirmación.

### 4.3 Ventana «Completar proforma»

Ventana centrada (pantalla completa en móvil). Esc la cierra; el foco entra en el primer campo pendiente.

- **Productos:** nombre completo (hasta dos líneas) y código; cantidad `[− n +]`; precio unitario editable, que empieza con el del catálogo y, si cambia, muestra «Catálogo S/ X · Restaurar»; total de la línea; quitar. «Seguir eligiendo productos» vuelve a la lista sin perder nada.
- **Cliente:**
  - Razón social o nombre: obligatorio para generar.
  - RUC o DNI: opcional. Con 11 dígitos es RUC y se consulta (sección 7); con 8 dígitos es DNI y no se consulta. Cualquier otro largo es un error junto al campo.
  - Celular: opcional para generar; si se escribe, 9 dígitos que empiezan por 9. Será obligatorio para enviar por WhatsApp (tarea 11).
  - «Más datos», plegado, con un resumen a la vista («Validez 7 días · Entrega: 3 días hábiles»): dirección, tiempo de entrega y validez de la oferta en días (por defecto la de la empresa).
- **Resumen:** total parcial, descuento %, neto, envío, **total** y el desglose del IGV con la nota «Precios incluyen IGV».
- **«Generar proforma»:** deshabilitado mientras falte algo, con el motivo debajo («Añade al menos un producto», «Revisa las cantidades y los precios», «Completa los datos del cliente», «El total debe ser mayor que cero»).

### 4.4 Proforma generada

«Generar» asigna el número (sección 6.3) y muestra **«Proforma N° 0001 lista»** con el cliente y el total. Acciones:

- «Descargar PDF» y «Ver el documento» (tarea 10) y «Enviar por WhatsApp» (tarea 11).
- **«Corregir»:** vuelve a la ventana con todo y conserva el número.
- **«Nueva proforma»:** vacía el borrador y libera el número de la proforma actual.

### 4.5 Estados y errores

- Indicador «Borrador guardado» en la ventana.
- **Precio cambiado:** al abrir la ventana, cada línea cuyo precio del catálogo cambió desde que se añadió muestra «El precio del catálogo cambió a S/ X · Actualizar». Si el producto ya no existe, «Ya no está en el catálogo»: se puede quitar o mantener con los valores copiados.
- **RUC:** cargando, encontrado (rellena razón social y dirección, editables), no encontrado, servicio no disponible (se escribe a mano) y aviso no bloqueante si SUNAT lo tiene de baja o como no habido.
- **Sin conexión o error del servidor al generar o consultar:** mensaje claro y reintento, sin perder lo escrito (mismo patrón que el catálogo).

## 5. Cálculos

### 5.1 Reglas

El dinero se maneja en **céntimos enteros**; el texto se interpreta como el precio del catálogo (punto o coma decimal, hasta dos decimales, sin separador de miles).

| Concepto | Regla |
| --- | --- |
| Cantidad | Entero de 1 a 9 999. |
| Precio unitario | Mayor que 0 y menor que 10 000 000 000, con hasta dos decimales (mismos límites que el catálogo). |
| Total de línea | cantidad × precio unitario. |
| Total parcial | Suma de los totales de línea. |
| Descuento | 0 a 100 %, hasta dos decimales. Importe = redondear(total parcial × % ÷ 100). |
| Neto | Total parcial − descuento. |
| Envío | 0 o más, con hasta dos decimales. |
| Total | Neto + envío. Debe ser mayor que cero para generar. |
| Tope | Cada total de línea y el total, menores que S/ 10 000 000 000. Así los céntimos caben sin pérdida en los enteros de JavaScript. |
| Redondeo | Al céntimo, con las mitades hacia arriba. |

### 5.2 IGV, en un módulo aislado

Configuración única: modo **incluido**, tasa 18 %, con desglose. Con el IGV incluido:

- Base (Op. gravada) = redondear(total ÷ 1,18).
- IGV = total − base. Así la base y el IGV suman exactamente el total.

Otros modos previstos, sin tocar el resto del código: incluido sin desglose, sumado al final (total = neto + envío + 18 %) y sin IGV. Cambiar de modo es cambiar esta configuración.

### 5.3 Ejemplos acordados

| # | Caso | Total parcial | Descuento | Neto | Envío | Total | Op. gravada | IGV |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| E1 | 2 × 2 590.00 + 1 × 850.00 (precio especial) + 1 × 2 490.00; 5 %; envío 20.00 | 8 520.00 | 426.00 | 8 094.00 | 20.00 | **8 114.00** | 6 876.27 | 1 237.73 |
| E2 | 1 × 890.00 | 890.00 | 0.00 | 890.00 | 0.00 | **890.00** | 754.24 | 135.76 |
| E3 | 3 × 333.33; 10 % (99.999 → 100.00) | 999.99 | 100.00 | 899.99 | 0.00 | **899.99** | 762.70 | 137.29 |
| E4 | 1 × 500.00; 100 %; envío 25.00 | 500.00 | 500.00 | 0.00 | 25.00 | **25.00** | 21.19 | 3.81 |
| E5 | 9 999 × 12 490.00 (límite de cantidad) | 124 887 510.00 | 0.00 | 124 887 510.00 | 0.00 | **124 887 510.00** | 105 836 872.88 | 19 050 637.12 |

E5 comprueba un caso grande dentro del tope. Los cinco ejemplos se recalcularon con aritmética decimal exacta.

## 6. Datos

### 6.1 Proforma en curso (navegador)

Una sola proforma en `localStorage` (prefijo de borradores de la app, que se borra al cerrar sesión). Contenido:

- **Líneas:** id y código del producto, nombre y descripción copiados, precio del catálogo al añadirlo, precio unitario escrito y cantidad.
- **Cliente:** nombre, documento, celular, dirección y tiempo de entrega.
- **Condiciones:** validez en días, descuento % y envío.
- **Número asignado**, si ya se generó, y fecha de la última modificación.

Al abrir la ventana se compara cada línea con el catálogo actual (sección 4.5). La proforma nunca escribe en el catálogo.

### 6.2 Datos de la empresa (base)

Tabla nueva de **una sola fila**, `company_profile`, con los permisos del catálogo (solo la cuenta autorizada lee y escribe):

- Razón social, nombre comercial, RUC (11 dígitos), dirección, teléfono y correo.
- Condición de pago y política de devoluciones (texto).
- Validez por defecto de la oferta (1 a 365 días; 7 al crearla).
- Cuentas para el pago: lista de banco, número de cuenta y CCI, más un número de Yape o Plin opcional.

Se edita en una pantalla nueva **«Empresa»** del menú. Son obligatorios la razón social, el RUC, la dirección y el teléfono. Si falta alguno, «Generar» lo indica y enlaza a esa pantalla, porque el documento los necesita.

### 6.3 Numeración

- Una secuencia de la base y una función que solo puede llamar la cuenta autorizada devuelven el siguiente número.
- Formato `N° 0001`: cuatro cifras con ceros a la izquierda, y más cifras cuando haga falta.
- El número se pide al pulsar «Generar» y queda en el borrador: «Corregir» lo conserva y «Nueva proforma» lo libera.
- Una proforma generada que no se envía deja un hueco en la numeración; se acepta.
- No se guardan las proformas: solo el último número usado.

## 7. Consulta de RUC

- Server Action que recibe el RUC, comprueba los 11 dígitos y su dígito verificador antes de consultar, y llama al proveedor con una clave **solo de servidor** (variable de entorno sin `NEXT_PUBLIC_`).
- Devuelve razón social, dirección fiscal, estado y condición. Tiempo máximo de espera de unos 5 segundos; cualquier fallo deja escribir a mano.
- Se consulta al completar los 11 dígitos, no en cada tecla, y el resultado se guarda en la caché de la sesión.
- El proveedor se elige en el plan comparando costo o plan gratuito, límites, disponibilidad y condiciones de uso. Queda detrás de una interfaz para poder cambiarlo y para usar un proveedor de prueba en las pruebas automáticas.
- El DNI no se consulta: son datos personales (Ley 29733).

## 8. Búsqueda sin tildes

Migración que activa la extensión `unaccent` de Postgres y cambia `search_products` para comparar sin tildes ni mayúsculas en nombre y código. Sigue escapando los comodines como hoy. Con el tamaño del catálogo no hace falta un índice nuevo.

## 9. Accesibilidad y teclado

- Controles de 36 px o más, con nombres accesibles (por ejemplo, «Una unidad más de Laptop de 14 pulgadas»).
- Un aviso de lectura para lectores de pantalla al añadir o quitar productos.
- Foco visible, foco en el primer campo pendiente al abrir la ventana y devolución del foco al cerrarla.
- Atajos: «/» busca, Esc cierra y Enter añade el único resultado.

## 10. Seguridad

- `company_profile` y la función de numeración, con los mismos permisos que el catálogo.
- La clave del servicio de RUC solo existe en el servidor.
- El borrador vive en el navegador y se borra al cerrar sesión; los datos del cliente no se guardan en la base.

## 11. Pruebas

- **Unitarias:** cálculos con los ejemplos E1–E5, módulo de IGV en sus modos, validaciones (cantidad, precio, %, envío, RUC con dígito verificador, DNI y celular).
- **Componentes:** «Añadir» y `[− n +]` en la lista, validaciones de la ventana, borrador con aviso de precio cambiado, «Deshacer».
- **Integración (Supabase local):** permisos de `company_profile`, función de numeración y búsqueda sin tildes.
- **E2E (escritorio y móvil):** añadir desde la lista, completar con RUC (proveedor de prueba), generar, corregir conservando el número, nueva proforma y error sin conexión.

## 12. Pendiente de información externa

- Datos de Ventronix: se cargan en la pantalla «Empresa».
- Cuenta y clave del servicio de RUC, una vez elegido el proveedor.
- Confirmar el manejo del IGV con quien envió el ejemplo (por defecto, incluido con desglose; se cambia en el módulo de la sección 5.2).
