# Envío automático por WhatsApp (paso 2)

Fecha: 30-09-2026. Estado: enfoque elegido en conversación (Baileys, gratis); implementación directa a pedido del usuario («implementarlo y luego me comentas qué se necesita»).

Sigue el [contexto del proyecto](../../../PROJECT_CONTEXT.md) §11–13 (WhatsApp no oficial, proveedor intercambiable) y el paso 1 de la [spec del documento](2026-09-30-documento-y-whatsapp-design.md) §7.

## 1. Objetivo

Con el WhatsApp de la empresa vinculado, «Enviar por WhatsApp» manda el PDF de la proforma y el mensaje al celular del cliente desde ese número, sin descargar ni adjuntar nada. Sin vincular, todo sigue como en el paso 1.

## 2. Alcance

**Incluye:** vincular el número desde «Empresa» con un código, ver el estado y desvincular; envío automático desde la vista «Proforma N° 0001 lista»; proveedor intercambiable (Baileys y uno de prueba).

**Fuera de alcance:** recibir o leer mensajes, historial de envíos, varios números, vincular con QR y la API oficial (será otro proveedor).

## 3. Decisiones

| Tema | Decisión |
| --- | --- |
| Librería | Baileys `7.0.0-rc14`, versión fija (es la `latest` de npm; la 6.x quedó como `legacy`). La app es un «dispositivo vinculado» del número, como WhatsApp Web. |
| Conexión | Una por operación: Vercel no mantiene procesos abiertos. Cada envío abre la sesión guardada, envía, guarda las claves y cierra (unos 5–10 s). Sin sincronizar el historial ni marcar «en línea». |
| Sesión | Tabla `whatsapp_session`, una sola fila y solo para la cuenta autorizada. El estado de Baileys va cifrado (AES-256-GCM) con `WHATSAPP_SESSION_KEY`, que solo tiene el servidor. Sin esa clave el envío automático queda apagado y se usa el paso 1. |
| Una operación a la vez | `locked_until` reserva la sesión mientras se usa (2 minutos como máximo). Dos conexiones con la misma sesión la estropearían. |
| Vincular | En «Empresa», con el celular de WhatsApp de la empresa. La pantalla genera un código de 8 caracteres y lo muestra al instante; la Server Action se lo pide a WhatsApp para ese número y espera hasta 2 minutos a que se escriba en el teléfono. |
| Proveedor | `WhatsAppProvider` con `sendDocument`, `link` y `unlink`: Baileys en producción y uno de prueba para las e2e (`WHATSAPP_PROVIDER=stub`, nunca en producción), como `RUC_PROVIDER`. |
| Duración | `maxDuration` de 60 s en Productos (enviar) y 150 s en Empresa (vincular). Requiere Vercel Pro, que ya hace falta por el uso comercial. |

## 4. Flujos

**Vincular.** El usuario escribe el celular de la empresa (9 dígitos) y pulsa «Vincular». Aparece el código con los pasos: en el teléfono, WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Vincular con el número de teléfono → escribir el código. El servidor abre una sesión nueva, pide el código para `51<celular>`, espera la confirmación del teléfono y la reconexión que exige WhatsApp, guarda la sesión cifrada con el número y cierra. La pantalla pasa a «Vinculado: 987 654 321».

**Enviar.** Con WhatsApp vinculado, «Enviar por WhatsApp» en la vista «lista» pide al servidor que genere el PDF (el mismo de «Descargar PDF») y lo mande con el mensaje del paso 1 como pie. El servidor reserva la sesión, conecta, comprueba que el celular del cliente tenga WhatsApp, envía el documento, espera la confirmación del servidor de WhatsApp, guarda las claves y libera la sesión.

**Desvincular.** «Desvincular» (con confirmación) cierra la sesión en WhatsApp y la borra. Si el teléfono ya la había cerrado, solo se borra.

## 5. Mensajes

- Enviando: «Enviando por WhatsApp…». Hecho: «Enviada por WhatsApp al 987 654 321.»
- El cliente no tiene WhatsApp: «El 987 654 321 no tiene WhatsApp.»
- Otra operación en curso: «Hay otro envío en curso. Inténtalo en unos segundos.»
- El teléfono cerró la sesión: se borra y «WhatsApp se desvinculó. Vuelve a vincularlo en Empresa.»
- Sin conexión con WhatsApp o tiempo agotado: «No pudimos enviarla por WhatsApp.», con «Abrir el chat» (paso 1).
- Vincular sin confirmar a tiempo: «No se vinculó a tiempo. Genera otro código.»
- En «Empresa», sin clave en el servidor: «Falta configurar WHATSAPP_SESSION_KEY en el servidor para enviar automáticamente.»

## 6. Seguridad

Todas las acciones comprueban la cuenta autorizada y validan lo que reciben con Zod. La sesión de WhatsApp nunca llega al navegador: la fila se protege con RLS y, además, su contenido está cifrado con una clave que solo existe en el servidor (sin `NEXT_PUBLIC_`). El PDF no se guarda.

## 7. Riesgos

- **No es oficial:** WhatsApp puede restringir o bloquear el número. Con un uso normal (proformas a clientes que las esperan) el riesgo es bajo, pero conviene probar primero con un número secundario.
- **Cambios de WhatsApp:** Baileys puede dejar de funcionar hasta que se actualice; mientras tanto, «Abrir el chat» (paso 1) sigue disponible.
- **Teléfono desconectado:** si el teléfono pasa unos 14 días sin internet, WhatsApp cierra los dispositivos vinculados y hay que volver a vincular.

## 8. Pruebas

- **Unitarias:** cifrado de la sesión, código de vinculación, número de WhatsApp del cliente, estado de Baileys (guardar y leer, claves) y elección del proveedor.
- **Integración (Supabase local):** RLS de `whatsapp_session`, reserva de la sesión y las acciones con el proveedor de prueba.
- **Componentes:** tarjeta de WhatsApp en «Empresa» y envío automático en la vista «lista».
- **E2E:** vincular en «Empresa» y enviar desde «lista» con el proveedor de prueba.
- **Manual (con un teléfono real):** vincular, enviar a un número propio y desvincular. Las pruebas automáticas nunca se conectan a WhatsApp.

## 9. Lo que hace falta para usarlo

1. Una clave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, guardada como `WHATSAPP_SESSION_KEY` en `.env.local` y en Vercel (solo servidor).
2. Aplicar la migración en el Supabase de la nube (`pnpm db:push`).
3. Vincular el número en «Empresa» → WhatsApp.
