# Viabilidad de WhatsApp no oficial en Vercel

Fecha: 29-09-2026. Tarea 7 del [plan](../superpowers/plans/2026-09-29-catalogo-proformas.md).

> **Estado:** investigación y comprobaciones locales, sin contactar con WhatsApp. **El ensayo real no se ha hecho:** necesita autorización expresa, una cuenta y un destinatario de prueba. No se ha añadido nada a la app, y el catálogo no depende de este resultado.

## Conclusión

- **Baileys es la única de las dos candidatas que encaja en una Vercel Function.** No usa navegador, cabe holgadamente en el límite de tamaño, y su sesión se puede guardar en Supabase como JSON.
- **whatsapp-web.js no se recomienda en Vercel.** Necesita Chromium dentro de la función, restaura la sesión cargando WhatsApp Web entero y guarda la sesión en MongoDB o S3, un proveedor nuevo, alrededor de un minuto después de conectar.
- **Viable en principio, no comprobado.** Solo el ensayo autorizado (ver más abajo) puede confirmar si en una invocación nueva se restaura la sesión, se envía el documento y se recibe la confirmación a tiempo.
- **Riesgo que no es técnico:** los términos de WhatsApp prohíben usar sus servicios por medios no autorizados y permiten suspender la cuenta. Afecta por igual a las dos librerías.

## Lo que importa de Vercel

Datos de la documentación oficial, consultada el 29-09-2026:

| Límite                            | Valor                                                                |
| --------------------------------- | -------------------------------------------------------------------- |
| Duración máxima de una invocación | Hobby: 300 s. Pro: 300 s por defecto y hasta 800 s (1800 s en beta). |
| Memoria                           | 2 GB y 1 vCPU por defecto. Pro permite hasta 4 GB y 2 vCPU.          |
| Tamaño de la función              | 250 MB sin comprimir (hasta 5 GB en beta).                           |
| Cuerpo de petición o respuesta    | 4,5 MB.                                                              |
| Descriptores de archivo           | 1024, compartidos entre ejecuciones concurrentes.                    |

Hay que distinguir dos cosas:

- **WebSocket de servidor**, cuando el navegador se conecta a Vercel. Vercel lo soporta, pero aquí no hace falta.
- **WebSocket de cliente**, cuando la función se conecta a WhatsApp. Es lo que hace Baileys. Es una conexión saliente normal de Node y dura lo mismo que la invocación. No puede quedar abierta entre dos envíos: cada envío conecta, envía, espera la confirmación y cierra.

Lo mismo ocurre con la persistencia: **el proceso no sobrevive entre invocaciones, pero la sesión sí debe sobrevivir.** Vercel no tiene disco persistente, así que las credenciales de la sesión deben vivir en la base de datos. Guardarlas no resuelve por sí solo la concurrencia, la desconexión ni la duración del proceso: el ensayo tiene que probar cada una.

## Comparación

| Criterio                             | Baileys 7.0.0-rc14                                                                                                           | whatsapp-web.js 1.34.7                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Funcionamiento                       | Cliente del protocolo de WhatsApp Web por WebSocket, sin navegador.                                                          | Controla WhatsApp Web dentro de Chromium con Puppeteer.                                               |
| Tamaño instalado (medido)            | 50 MB en 54 paquetes. Su parte en Rust está compilada a WebAssembly, sin binarios nativos.                                   | 86 MB en 161 paquetes, sin navegador. En Vercel se suma `@sparticuz/chromium` 153.0.0 (70 MB).        |
| Carga del módulo en Node 24 (medido) | 192 ms y 112 MB de memoria.                                                                                                  | 187 ms y 92 MB, sin lanzar Chromium.                                                                  |
| Sesión                               | Credenciales y claves Signal, que se guardan juntas. Las claves cambian con cada envío y hay que guardarlas antes de cerrar. | Perfil de Chromium comprimido (RemoteAuth), que se guarda unos 60 s después de conectar.              |
| Almacenamiento                       | Estado propio respaldado por SQL, como recomienda su documentación. El JSON se comprobó en local.                            | Stores publicados para MongoDB y S3. Supabase necesitaría un store propio.                            |
| Reconexión en cada envío             | WebSocket y handshake (tiempo sin medir).                                                                                    | Lanzar Chromium, restaurar el perfil y cargar WhatsApp Web (tiempo sin medir, previsiblemente mayor). |
| Mantenimiento                        | Activo: última publicación en npm el 29-07-2026. La rama 7 sigue en _release candidate_; la 6.7.24 figura como _legacy_.     | Activo: última publicación en npm el 08-07-2026.                                                      |
| Licencia                             | MIT                                                                                                                          | Apache-2.0                                                                                            |

## Comprobaciones locales

Se hicieron en un directorio temporal, fuera del proyecto, sin scripts de instalación y sin contactar con WhatsApp.

1. **Instalación y tamaño:** son los de la tabla anterior.
2. **Carga en Node 24.20.0:** las dos librerías cargan sin errores.
3. **Credenciales de Baileys:** se crearon con `initAuthCreds()` y se convirtieron a JSON y de vuelta con `BufferJSON`. El JSON reconstruido es idéntico al original (1126 bytes con credenciales nuevas). Solo desaparecen cuatro campos con valor `undefined`, que JSON no representa. Por tanto, caben en una columna `jsonb` o `text`. El tamaño que alcanzan en una sesión real, con muchas claves Signal, no se ha medido.
4. **Portabilidad:** la dependencia `whatsapp-rust-bridge` de Baileys es WebAssembly, así que funciona igual en Linux x64 que en local.

## Diseño que se probaría con Baileys

Un envío ocurre entero dentro de una invocación (Server Action o Route Handler con `maxDuration` de unos 120 s):

1. **Tomar el turno.** Se actualiza la fila de la sesión solo si nadie la tiene reservada o si la reserva ya caducó. Si no se consigue, se responde «hay un envío en curso» y no se abre una segunda conexión con la misma sesión.
2. **Cargar** las credenciales y las claves desde Supabase.
3. **Conectar** y esperar a que la conexión esté abierta.
4. **Enviar** el documento y esperar la confirmación del servidor de WhatsApp.
5. **Guardar** las claves actualizadas. Cada escritura debe ser durable antes de continuar.
6. **Cerrar** la conexión y liberar el turno.

El resultado es uno de tres: **enviado**, **fallido** o **incierto**. Es incierto cuando la invocación se corta entre el envío y la confirmación. Un resultado incierto nunca se reintenta solo: se pide revisar el chat en el teléfono antes de reenviar, para no duplicar el documento al cliente.

**Credenciales.** Equivalen a una clave privada, según la propia documentación de Baileys. El navegador no debe poder leerlas, ni siquiera con la sesión de la cuenta autorizada. Por eso irían en una tabla sin permisos para `authenticated`, accesible solo desde el servidor. Eso exige una clave de servidor en Vercel (la clave secreta de Supabase o una clave de cifrado), que hoy no existe. **Es un cambio de diseño que hay que acordar antes de implementarlo.**

**Vinculación.** La primera vez, y después de un cierre de sesión, la persona vincula el número desde la app con un QR o un código de emparejamiento. La conexión tiene que seguir abierta mientras escanea. Debería caber en 300 s, pero no se ha probado.

## Protocolo del ensayo real (pendiente de autorización)

**Requisitos:**

- Autorización expresa para enviar los mensajes.
- Una cuenta de WhatsApp de prueba, no la principal del negocio.
- Un destinatario de prueba propio.
- Un documento inocuo, por ejemplo «Documento de prueba, sin valor comercial».
- Un proyecto de Supabase de pruebas.
- Un preview en Vercel Pro.

| #   | Caso                                         | Se considera éxito si…                                                                                                   |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Vincular y guardar la sesión                 | La sesión queda en la base y la invocación termina.                                                                      |
| 2   | Enviar desde una invocación nueva            | El destinatario recibe el documento. Se registran tiempos de conexión, envío y confirmación, y la memoria usada.         |
| 3   | Tres envíos en invocaciones seguidas         | Los tres se leen bien en el destinatario, lo que demuestra que las claves se guardaron.                                  |
| 4   | Dos solicitudes casi simultáneas             | Nunca hay dos conexiones a la vez. La segunda espera o recibe «hay un envío en curso», y no se duplica ningún documento. |
| 5   | Desvincular el dispositivo desde el teléfono | El siguiente envío detecta el cierre, marca la sesión como inválida y pide vincular de nuevo, sin reintentos infinitos.  |
| 6   | Corte entre el envío y la confirmación       | El resultado queda como incierto y no se reintenta solo.                                                                 |
| 7   | Enviar tras 24 a 72 horas sin uso            | La sesión sigue siendo válida.                                                                                           |

Cada caso se registra como éxito, fallo o no comprobado. Un caso que no se ejecutó no cuenta como prueba de compatibilidad.

## Estado de cada punto

| Punto                                             | Estado                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| Límites de Vercel                                 | Comprobado en la documentación                           |
| Instalación, tamaño y carga                       | Comprobado en local                                      |
| Credenciales de Baileys como JSON                 | Comprobado en local, con credenciales nuevas             |
| Conexión, envío y confirmación desde Vercel       | No comprobado                                            |
| Restauración de la sesión en una invocación nueva | No comprobado                                            |
| Dos solicitudes cercanas                          | No comprobado                                            |
| Desconexión y nueva vinculación                   | No comprobado                                            |
| Resultado incierto                                | No comprobado                                            |
| Suspensión de la cuenta                           | Riesgo recogido en los términos; no medible sin uso real |

## Recomendación

Probar **Baileys** como primer proveedor no oficial, detrás de `WhatsAppProvider`, con estas condiciones:

1. Antes de implementar el envío, hacer el ensayo real autorizado con los siete casos.
2. Acordar la clave de servidor en Vercel para proteger las credenciales.
3. Fijar la versión exacta, porque la rama 7 sigue en _release candidate_.
4. Aceptar el riesgo de suspensión de la cuenta y empezar con un número secundario.
5. Mantener activo el teléfono principal. Según la FAQ de WhatsApp, los dispositivos vinculados se desconectan tras 14 días sin usar el teléfono. La página no se pudo leer directamente, así que este dato no está verificado aquí.
6. Si el ensayo falla por los límites de Vercel, presentar las alternativas con su coste antes de cambiar nada: la API oficial (WhatsApp Cloud API) o un proceso persistente fuera de Vercel. Ninguna sustituye automáticamente al envío directo previsto.

whatsapp-web.js queda como segunda opción. Solo tendría sentido si Baileys fallara en el ensayo y se aceptaran un almacenamiento externo (S3 o MongoDB) y envíos más lentos.

## Fuentes

- [Límites de Vercel Functions](https://vercel.com/docs/functions/limitations)
- [WebSockets en Vercel Functions](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
- [Sesiones de Baileys](https://baileys.wiki/authentication/session-management)
- [Autenticación de whatsapp-web.js](https://wwebjs.dev/guide/creating-your-bot/authentication.html)
- [Términos del servicio de WhatsApp](https://www.whatsapp.com/legal/terms-of-service): prohíben la ingeniería inversa y el acceso no autorizado, y permiten suspender la cuenta.
- [FAQ de WhatsApp sobre dispositivos vinculados](https://faq.whatsapp.com/378279804439436) (no se pudo leer directamente)
- Registro de npm (`npm view`) para versiones, licencias y fechas, consultado el 29-09-2026.
