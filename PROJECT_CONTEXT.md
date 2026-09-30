# Contexto del Proyecto --- Catálogo de Productos y Proformas

> Documento de contexto para agentes de código (Codex, Claude Code,
> subagentes, etc.).
>
> **Regla principal:** leer este documento antes de modificar o
> implementar funcionalidades relacionadas con este proyecto.

------------------------------------------------------------------------

## 1. Objetivo

Construir una aplicación web moderna para gestionar un catálogo de
productos y, posteriormente, crear proformas comerciales.

El proyecto debe mantenerse simple y evitar un backend separado.

### Objetivos iniciales

-   Gestionar categorías.
-   Gestionar productos.
-   Crear una proforma comercial a partir de productos.
-   Generar una representación de la proforma para compartir.
-   Generar PDF de la proforma cuando se defina el diseño.
-   Integrar envío por WhatsApp.
-   Mantener la arquitectura preparada para cambiar de una integración
    de WhatsApp no oficial a una oficial en el futuro.

### Fuera del alcance inicial

-   Backend independiente con NestJS/Express.
-   Sistema complejo de autenticación, salvo que posteriormente sea
    requerido.
-   Gestión de stock.
-   Inventarios.
-   Almacenes.
-   Historial permanente de proformas, salvo que posteriormente se
    decida implementar la estrategia de URL/persistencia.
-   Almacenamiento permanente de PDFs.
-   Funcionalidades no relacionadas con productos/proformas.

------------------------------------------------------------------------

# 2. Stack tecnológico

## Framework

-   Next.js
-   TypeScript
-   App Router

## UI

-   Tailwind CSS
-   shadcn/ui
-   Diseño moderno, limpio, agradable y responsive.
-   Componentes reutilizables.
-   Priorizar accesibilidad y buena experiencia de usuario.

## Formularios y validación

-   React Hook Form
-   Zod

### Regla

La validación no debe depender únicamente del frontend.

Los datos recibidos por Server Actions deben validarse también en el
servidor mediante schemas de Zod.

------------------------------------------------------------------------

## Datos y backend gestionado

-   Supabase
-   PostgreSQL

No crear un backend independiente.

Supabase será la infraestructura principal para persistencia de datos.

------------------------------------------------------------------------

## Datos del cliente

Para operaciones de consulta/mutación desde componentes cliente se
utilizará:

-   TanStack Query
-   `fetch` nativo cuando corresponda

No agregar Axios.

------------------------------------------------------------------------

## Server Actions

Las Server Actions de Next.js se utilizarán para operaciones que
necesiten ejecutarse del lado servidor, especialmente:

-   Operaciones sensibles.
-   Generación de documentos.
-   Integración con servicios que requieran secretos.
-   Integración con WhatsApp.
-   Otras operaciones que no deban ejecutarse en el navegador.

No crear endpoints/API routes innecesarios si una Server Action resuelve
correctamente el caso.

------------------------------------------------------------------------

## Estado en URL

Utilizar:

-   `nuqs`

`nuqs` debe utilizarse para estado que tenga sentido
persistir/sincronizar en la URL, por ejemplo:

-   Búsqueda.
-   Filtros.
-   Categoría seleccionada.
-   Ordenamiento.
-   Paginación.
-   Tabs cuando sea útil compartir/restaurar el estado mediante URL.

No utilizar `nuqs` para sustituir:

-   React Hook Form.
-   Estado efímero de componentes.
-   Estado interno de modales.
-   Datos temporales de un formulario que no necesiten estar en la URL.

La URL debe ser considerada parte de la UX cuando tenga sentido.

------------------------------------------------------------------------

## Fechas

Utilizar:

-   `date-fns`

No utilizar Moment.js.

------------------------------------------------------------------------

## Notificaciones

Utilizar:

-   Sonner / toast integrado con shadcn/ui.

Ejemplos:

-   Creación exitosa.
-   Actualización exitosa.
-   Eliminación exitosa.
-   Errores de validación.
-   Errores de servidor.
-   Generación de PDF.
-   Envío por WhatsApp.

------------------------------------------------------------------------

## IDs públicos

Utilizar:

-   `nanoid`

Principalmente si posteriormente se implementan URLs públicas para
proformas.

No es necesario introducirlo en funcionalidades que no lo necesiten.

------------------------------------------------------------------------

## Calidad de código

Utilizar:

-   ESLint
-   Prettier
-   Husky
-   lint-staged

Si el proyecto utiliza Conventional Commits, mantener:

-   Conventional Commits
-   Commitlint

------------------------------------------------------------------------

## Testing

Stack previsto:

-   Vitest
-   React Testing Library
-   Playwright

No es necesario implementar una cobertura exhaustiva desde el primer
día.

Priorizar pruebas sobre:

### Vitest

-   Schemas de Zod.
-   Cálculos.
-   Totales.
-   Transformaciones.
-   Funciones de negocio.

### React Testing Library

-   Formularios importantes.
-   Componentes críticos.
-   Interacciones relevantes.

### Playwright

Flujos principales, especialmente:

``` text
Crear producto
    ↓
Seleccionar producto
    ↓
Crear proforma
    ↓
Generar documento
    ↓
Enviar/compartir
```

------------------------------------------------------------------------

# 3. Arquitectura general

La aplicación debe mantenerse dentro de Next.js.

``` text
Next.js
│
├── UI
├── Components
├── TanStack Query
├── React Hook Form
├── Zod
├── Server Actions
│
├── Generación de documentos
│
└── Integración WhatsApp
        │
        ↓
     Supabase
        │
        ├── categories
        └── products
```

No crear:

``` text
❌ NestJS separado
❌ Express
❌ VPS para backend
❌ Docker para backend independiente
❌ API REST separada
```

------------------------------------------------------------------------

# 4. Modelo de datos inicial

## categories

``` text
id
name
created_at
updated_at
```

## products

``` text
id
code
name
description
category_id
unit_price
created_at
updated_at
```

### Relaciones

``` text
categories
    1
    │
    └────── N products
```

`products.category_id` referencia a `categories.id`.

------------------------------------------------------------------------

# 5. Campos que NO se deben agregar por iniciativa propia

No agregar sin requerimiento explícito:

``` text
stock
brand
model
warehouse
supplier
images
cost_price
minimum_stock
maximum_stock
location
```

Si aparece una necesidad relacionada, primero analizarla y consultar
antes de cambiar el modelo.

------------------------------------------------------------------------

# 6. Productos

El módulo de productos debe permitir como mínimo:

-   Listar productos.
-   Buscar productos.
-   Filtrar por categoría.
-   Crear producto.
-   Editar producto.
-   Eliminar/desactivar producto según la estrategia definida.
-   Mostrar código.
-   Mostrar nombre.
-   Mostrar descripción.
-   Mostrar categoría.
-   Mostrar precio.

La UX debe ser moderna y sencilla.

------------------------------------------------------------------------

# 7. Categorías

El módulo de categorías debe permitir:

-   Listar categorías.
-   Crear categoría.
-   Editar categoría.
-   Eliminar/desactivar categoría según las reglas de integridad que se
    definan.

Ejemplos de categorías iniciales pueden incluir:

``` text
Fotocopiadoras
Computadoras
Laptops
Impresoras
Plotters
```

Estas categorías son ejemplos/contexto, no una lista cerrada que deba
hardcodearse.

------------------------------------------------------------------------

# 8. Proformas --- PENDIENTE DE DEFINICIÓN

La proforma se va a construir posteriormente.

**NO inventar todavía el diseño ni el modelo definitivo de la
proforma.**

Pendiente de definir:

-   Diseño visual.
-   Campos del cliente.
-   Datos de la empresa.
-   Numeración.
-   Moneda.
-   IGV/impuestos.
-   Descuentos.
-   Subtotales.
-   Totales.
-   Condiciones comerciales.
-   Vigencia.
-   Información adicional.
-   Diseño del PDF.
-   Diseño de la imagen.
-   Formato final de impresión.

La existencia de una imagen/referencia de una proforma no significa que
el agente deba implementar automáticamente todos sus campos.

Esperar la definición final antes de construir el módulo de proformas.

------------------------------------------------------------------------

# 9. Concepto inicial de la proforma

La proforma será construida a partir de productos existentes.

Conceptualmente:

``` text
Producto
    ↓
Seleccionar
    ↓
Cantidad
    ↓
Precio
    ↓
Subtotal
    ↓
Total
```

Al seleccionar un producto se deben poder obtener sus datos actuales:

``` text
code
name
unit_price
```

La proforma deberá trabajar con los valores seleccionados en el momento
de su creación.

No modificar el catálogo de productos desde una proforma.

------------------------------------------------------------------------

# 10. Generación de PDF --- PENDIENTE

Se deberá poder generar un PDF de la proforma.

Pero todavía NO se debe elegir definitivamente:

-   Librería de PDF.
-   Diseño.
-   Tamaño de página.
-   Plantilla.
-   Encabezado.
-   Pie de página.
-   Campos finales.

La implementación se definirá cuando se cierre el diseño de la proforma.

La generación debe estar desacoplada de la UI y de WhatsApp.

Conceptualmente:

``` text
ProformaData
    ↓
generateProformaPdf()
    ↓
PDF
```

Esto permitirá reutilizar el PDF para:

-   Descargar.
-   Compartir.
-   Enviar por WhatsApp.
-   Futuras integraciones.

------------------------------------------------------------------------

# 11. WhatsApp

El objetivo es poder enviar una proforma al cliente mediante WhatsApp.

## Estrategia inicial

Se evaluará primero una integración no oficial de WhatsApp para el
prototipo.

Posibles tecnologías:

-   Baileys.
-   whatsapp-web.js.
-   Otra solución que se determine durante la implementación.

La integración no oficial debe considerarse intercambiable y no debe
quedar acoplada a la lógica de negocio.

------------------------------------------------------------------------

# 12. Abstracción de WhatsApp

La aplicación debe evitar depender directamente de una librería
específica.

Conceptualmente:

``` ts
interface WhatsAppProvider {
  sendDocument(input: SendDocumentInput): Promise<SendDocumentResult>
}
```

Posteriormente podrían existir implementaciones como:

``` text
BaileysWhatsAppProvider
WhatsAppWebJsProvider
WhatsAppCloudApiProvider
```

El resto de la aplicación no debería saber cuál implementación está
siendo utilizada.

Esto permitirá migrar posteriormente a la API oficial de WhatsApp sin
rehacer el módulo de proformas.

------------------------------------------------------------------------

# 13. WhatsApp no oficial vs URL pública

Existen dos estrategias posibles.

## Estrategia A --- Envío directo

``` text
Crear proforma
      ↓
Generar PDF
      ↓
WhatsApp no oficial
      ↓
Enviar PDF
      ↓
Cliente recibe el documento
```

Ventajas:

-   No requiere persistir la proforma.
-   No requiere URLs públicas.
-   No requiere almacenamiento permanente.
-   Flujo directo.

Desventajas:

-   Dependencia de una integración no oficial.
-   Riesgo de restricciones/cambios del servicio.
-   La librería puede romperse si WhatsApp cambia su protocolo.

Esta será la estrategia inicial a probar.

------------------------------------------------------------------------

## Estrategia B --- URL pública

Si posteriormente se necesita que el cliente pueda volver a consultar la
proforma:

``` text
Crear proforma
      ↓
Guardar proforma
      ↓
Generar token
      ↓
URL pública
      ↓
Enviar URL por WhatsApp
      ↓
Cliente abre la proforma
      ↓
Puede descargar PDF
```

En ese caso podrían aparecer:

``` text
proformas
proforma_items
```

y un identificador público mediante `nanoid`.

Esta estrategia NO debe implementarse ahora salvo que se solicite
explícitamente.

------------------------------------------------------------------------

# 14. Persistencia de proformas

Decisión inicial:

> Las proformas NO se deben persistir como historial permanente en el
> MVP.

No crear automáticamente:

``` text
proformas
proforma_items
```

Solo deberán introducirse si el requisito cambia y se necesita:

-   Historial.
-   URLs públicas.
-   Reimpresión.
-   Reenvío.
-   Consulta posterior.
-   Estados.
-   Auditoría.

------------------------------------------------------------------------

# 15. Seguridad

Regla crítica:

> Ningún secreto debe exponerse al cliente.

Especialmente:

``` text
WhatsApp access tokens
WhatsApp session credentials
API keys privadas
Service role keys
Secrets de Supabase
```

No utilizar:

``` text
NEXT_PUBLIC_...
```

para secretos.

Las operaciones que necesiten secretos deben ejecutarse del lado
servidor.

------------------------------------------------------------------------

# 16. Supabase

Supabase será la base de datos principal.

Inicialmente:

``` text
Supabase
├── categories
└── products
```

Las migraciones deben ser reproducibles.

No asumir que `db push` es suficiente para un entorno
compartido/producción.

Cuando se establezca el esquema definitivo:

-   Utilizar migraciones.
-   Definir índices necesarios.
-   Definir constraints.
-   Definir relaciones.
-   Definir políticas RLS cuando correspondan.

------------------------------------------------------------------------

# 17. TanStack Query

Usar TanStack Query para manejar el estado remoto cuando corresponda.

Casos esperados:

``` text
productos
categorías
búsquedas
filtros
paginación
mutaciones
invalidación de cache
loading/error states
```

Evitar duplicar innecesariamente el mismo estado remoto en `useState`.

No usar TanStack Query como sustituto de:

-   React Hook Form.
-   Estado local de componentes.
-   Estado de URL manejado por nuqs.

------------------------------------------------------------------------

# 18. nuqs

Utilizar `nuqs` para parámetros de URL tipados.

Ejemplos:

``` text
/products?search=laptop
/products?category=laptops
/products?page=2
/products?sort=price
```

Preferir parsers tipados.

Ejemplo conceptual:

``` ts
parseAsInteger
parseAsString
parseAsBoolean
```

Cuando varias keys formen parte del mismo estado de página, considerar
`useQueryStates`.

No llenar la URL con estado que no sea útil para navegación, compartir,
refrescar o restaurar.

------------------------------------------------------------------------

# 19. UX / Diseño

El diseño debe sentirse:

-   Moderno.
-   Profesional.
-   Limpio.
-   Agradable.
-   Rápido.
-   Responsive.
-   Fácil de usar.

No construir interfaces excesivamente cargadas.

Priorizar:

-   Espaciado consistente.
-   Jerarquía visual clara.
-   Estados de loading.
-   Estados vacíos.
-   Estados de error.
-   Confirmaciones antes de acciones destructivas.
-   Feedback mediante toast.
-   Formularios claros.
-   Tablas cómodas para gestión desde PC.
-   Buena experiencia en móvil.

------------------------------------------------------------------------

# 20. Responsive

La aplicación se utilizará principalmente desde PC, pero también debe
funcionar correctamente en móvil.

### PC

Será el entorno principal para:

-   Gestionar productos.
-   Gestionar categorías.
-   Crear proformas.

### Móvil

Debe permitir:

-   Consultar productos.
-   Crear/consultar proformas cuando corresponda.
-   Utilizar las funcionalidades de compartir disponibles en el
    dispositivo.

No asumir que la aplicación será exclusivamente móvil.

------------------------------------------------------------------------

# 21. Server Actions y responsabilidades

Las Server Actions son parte del backend server-side de Next.js.

No crear un backend separado.

Usarlas para:

``` text
Operaciones sensibles
Generación de documentos
Integraciones externas
WhatsApp
Operaciones que requieran secretos
```

El frontend no debe tener acceso directo a secretos de integraciones
externas.

------------------------------------------------------------------------

# 22. Separación de responsabilidades

Evitar componentes gigantes.

Separar:

``` text
UI
    ↓
Hooks / Query
    ↓
Actions / Services
    ↓
Data access / integrations
```

La integración de WhatsApp no debe estar dentro de un componente visual.

La generación de PDF no debe estar directamente mezclada con JSX de una
página.

Los schemas de Zod deben estar centralizados y reutilizables.

------------------------------------------------------------------------

# 23. Dependencias

Antes de instalar una nueva librería:

1.  Revisar si el stack actual ya resuelve el problema.
2.  Revisar si Next.js lo resuelve nativamente.
3.  Revisar si shadcn/ui ya proporciona el componente.
4.  Revisar si existe una solución simple con APIs nativas.
5.  Solo agregar una dependencia si aporta valor real.

Evitar dependencias innecesarias.

------------------------------------------------------------------------

# 24. Reglas para agentes

## Antes de modificar

-   Leer este documento.
-   Revisar la estructura existente del proyecto.
-   Respetar convenciones existentes.
-   No reemplazar tecnologías sin una razón clara.

## No hacer por iniciativa propia

``` text
❌ Crear un backend separado
❌ Crear NestJS
❌ Agregar Axios
❌ Agregar Redux
❌ Agregar Zustand sin necesidad
❌ Agregar Moment
❌ Crear tablas de proformas antes de definir el requisito
❌ Guardar PDFs sin requerimiento
❌ Crear autenticación sin requerimiento
❌ Agregar stock
❌ Inventar campos de la proforma
❌ Inventar diseño definitivo de la proforma
❌ Agregar funcionalidades fuera del alcance
```

## Antes de decisiones arquitectónicas

Si una tarea requiere:

-   Nueva tabla.
-   Nueva integración.
-   Nueva dependencia importante.
-   Cambio de arquitectura.
-   Cambio de modelo de datos.
-   Persistencia de información que antes era temporal.

Primero explicar la decisión y sus implicaciones.

------------------------------------------------------------------------

# 25. Roadmap

## Fase 1 --- Base

-   Configurar Next.js.
-   TypeScript.
-   Tailwind.
-   shadcn/ui.
-   TanStack Query.
-   React Hook Form.
-   Zod.
-   nuqs.
-   Supabase.
-   Sonner.
-   date-fns.
-   ESLint/Prettier.
-   Husky/lint-staged.
-   Testing base.

## Fase 2 --- Categorías

-   CRUD de categorías.
-   Validaciones.
-   Estados de loading/error.
-   Búsqueda/filtros si son necesarios.

## Fase 3 --- Productos

-   CRUD de productos.
-   Categorías.
-   Búsqueda.
-   Filtros.
-   Paginación.
-   Validaciones.
-   UX responsive.

## Fase 4 --- Proforma

**Pendiente de definición.**

Primero definir:

-   Diseño.
-   Campos.
-   Cálculos.
-   Reglas comerciales.
-   Documento final.

## Fase 5 --- Generación de documento

**Pendiente de definición.**

-   PDF.
-   Imagen si es necesaria.
-   Plantilla.
-   Descarga.

## Fase 6 --- WhatsApp

Primera implementación:

``` text
WhatsApp no oficial
```

Mantener provider desacoplado.

## Fase 7 --- Futuro

Opcional:

``` text
Persistencia de proformas
URL pública
Historial
Reenvío
WhatsApp Cloud API
```

------------------------------------------------------------------------

# 26. Decisiones actuales

  Tema                        Decisión
  --------------------------- -------------------------------
  Framework                   Next.js
  Lenguaje                    TypeScript
  UI                          shadcn/ui
  CSS                         Tailwind CSS
  Server state                TanStack Query
  HTTP                        fetch nativo
  Formularios                 React Hook Form
  Validación                  Zod
  URL state                   nuqs
  Fechas                      date-fns
  Toast                       Sonner
  Base de datos               Supabase/PostgreSQL
  IDs públicos                nanoid cuando sean necesarios
  Backend separado            No
  Server-side                 Next.js Server Actions
  PDF                         Pendiente
  Diseño de proforma          Pendiente
  Persistencia de proformas   No inicialmente
  WhatsApp inicial            No oficial
  WhatsApp oficial            Futuro / alternativa
  Testing                     Vitest + RTL + Playwright

------------------------------------------------------------------------

# 27. Principio general del proyecto

> **Mantener el sistema simple hasta que exista una necesidad real de
> complejidad.**

No diseñar funcionalidades futuras como si fueran requisitos actuales.

La aplicación debe poder evolucionar posteriormente hacia:

``` text
Catálogo
    ↓
Proformas
    ↓
Historial
    ↓
URLs públicas
    ↓
WhatsApp oficial
```

pero el MVP debe implementar únicamente lo que esté definido y validado.
