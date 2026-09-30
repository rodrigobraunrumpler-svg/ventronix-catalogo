# Documento de la proforma y envío por WhatsApp

Fecha: 30-09-2026. Estado: diseño aprobado en conversación; pendiente de revisar este documento.

Tareas 10 y 11 (paso 1) del [plan del catálogo](../plans/2026-09-29-catalogo-proformas.md). Parte de la [spec de la proforma](2026-09-30-proformas-design.md) §2 y §4.4. Referencia visual obligatoria: [lienzo](https://claude.ai/artifact/7KjkXAw98vwSPa8hGesjfh), pizarras «Proforma · Documento A4» y «Productos + proforma» (vista «generada»). **El resultado debe verse igual que esas pizarras.**

## 1. Objetivo

Con la proforma generada, descargar un PDF idéntico a la plantilla del prototipo y enviarlo al cliente por WhatsApp con el mensaje ya escrito, en pocos segundos y sin guardar nada.

## 2. Alcance

**Incluye:**

- PDF A4 con la plantilla del prototipo, varias páginas e importe en letras.
- «Vista previa» antes de generar, con marca de agua «BORRADOR».
- En la vista «Proforma N° 0001 lista»: «Descargar PDF», «Enviar por WhatsApp», «Ver el documento», «Corregir» y «Nueva proforma».
- Paso 1 de WhatsApp: compartir desde el teléfono o abrir el chat del cliente en la PC, con el mensaje escrito.

**Fuera de alcance:** envío automático (Baileys o API oficial, paso 2), guardar PDFs, historial, imagen de la proforma y otras monedas.

## 3. Decisiones

| Tema | Decisión |
| --- | --- |
| Generación | `@react-pdf/renderer` 4, en el servidor, dentro de una Server Action. Sin navegador ni Chromium. |
| Fuentes | Plus Jakarta Sans (400, 600, 700, 800) y JetBrains Mono (400, 700), incrustadas en el PDF. Licencia OFL; los archivos TTF se versionan. |
| Datos | La Server Action recibe la proforma del navegador, la valida con Zod, recalcula los totales con los mismos módulos y lee los datos de la empresa de la base. |
| Almacenamiento | Ninguno. El PDF se genera al pedirlo y se entrega al navegador. |
| Fecha | Queda fija al pulsar «Generar», junto con el número (`issuedAt` en el borrador). «Válida hasta» = fecha + validez. Zona horaria de Lima. |
| Nombre del archivo | `Proforma-0001-Cliente-de-ejemplo-SAC.pdf` (sin tildes ni símbolos). Borrador: `Proforma-borrador-….pdf`. |
| WhatsApp | Requiere el celular del cliente. Móvil: menú de compartir con el PDF y el mensaje. PC: descarga el PDF y abre `wa.me` con el chat y el mensaje. |

## 4. El documento (igual a la pizarra A4)

Medidas y colores de la pizarra, pasados a puntos (1 px = 0,75 pt).

1. **Franja negra** a todo el ancho: logotipo de Ventronix a la izquierda; a la derecha, «PROFORMA», el número en verde lima (JetBrains Mono), «Fecha: dd/mm/aaaa» y «Válida hasta: dd/mm/aaaa».
2. **Fila de la empresa** en cuatro columnas: RUC, Dirección, Teléfono (todos, separados por « / ») y Correo (se omite si no hay).
3. **Recuadro del cliente**, en dos columnas: Cliente (en negrita), RUC o DNI, Dirección, Celular y Tiempo de entrega. Solo aparecen los datos escritos.
4. **Tabla** con cabecera negra: CANT., CÓDIGO, DESCRIPCIÓN (nombre y, debajo, la descripción del producto), P. UNIT. y TOTAL. Importes sin «S/», con separador de miles.
5. **Totales** a la derecha:
   - «Total parcial», «Descuento (5%)» (en negativo), «Neto» y «Envío». Descuento y neto solo si hay descuento; envío solo si hay envío; total parcial solo si hay descuento o envío.
   - Banda negra «TOTAL» con el importe en verde lima.
   - Nota «Precios incluyen IGV · Op. gravada S/ … · IGV (18%) S/ …», según el módulo del IGV.
   - Importe en letras: «SON: OCHO MIL CIENTO CATORCE CON 00/100 SOLES».
6. **Términos y condiciones** (izquierda): 1. Validez de la oferta: N días. 2. Condición de pago. 3. Política de devoluciones (solo las que existan).
7. **Cuentas para el pago** (derecha): «Banco · Cta. número · CCI … · Titular» por cuenta y «Yape: …», «Plin: …» o «Yape / Plin: …» por número.
8. **Pie**: «Gracias por su preferencia» al final del documento y la franja verde lima abajo en cada página.
9. **Varias páginas**: las filas no se parten; la cabecera de la tabla se repite arriba de cada página siguiente y aparece «Página N de M».
10. **Borrador**: la marca de agua «BORRADOR» en diagonal en cada página; sin número si aún no se generó.

## 5. Importe en letras

Mayúsculas con tildes: «UNO», «VEINTIUNO», «VEINTIDÓS», «CIEN», «CIENTO UNO», «MIL», «VEINTIÚN MIL», «UN MILLÓN», «DOS MILLONES», «MIL MILLONES». Formato: `SON: <entero en letras> CON <céntimos>/100 SOLES`. Cubre hasta el tope de la proforma (menos de S/ 10 000 000 000).

## 6. Vista «Proforma N° 0001 lista» (igual al prototipo)

Check verde, título, «Cliente · Total S/ …» y luego:

- Dos botones principales: **«Descargar PDF»** (verde) y **«Enviar por WhatsApp»** (blanco con borde).
- Enlace «Ver el documento».
- «Corregir» y «+ Nueva proforma», discretos.

El PDF se prepara solo al entrar en esta vista («Preparando el PDF…»). Así, al pulsar, descargar, ver o compartir es inmediato y el navegador no bloquea la acción. Si falla: «No pudimos preparar el PDF.» con «Reintentar».

Sin celular del cliente, «Enviar por WhatsApp» queda deshabilitado con el aviso «Añade el celular del cliente para enviarla por WhatsApp.».

## 7. Mensaje de WhatsApp

«Hola, {Cliente}. Le envío la proforma N° 0001 por S/ 8,114.00, válida hasta el 07/10/2026. Quedamos atentos. — {Nombre comercial o razón social}»

- **Móvil** (pantalla táctil y el navegador puede compartir archivos): menú de compartir con el PDF y el mensaje.
- **PC**, o si no se puede compartir: se descarga el PDF y se abre `https://wa.me/51<celular>?text=<mensaje>` en otra pestaña.

## 8. Errores

- Proforma no válida o empresa incompleta: la Server Action responde con el motivo y la vista lo muestra.
- Sin conexión: «No pudimos preparar el PDF.» y «Reintentar», sin perder la proforma.
- Cancelar el menú de compartir no es un error.

## 9. Seguridad

La Server Action comprueba la cuenta autorizada y valida todo lo que recibe. El PDF no se guarda. No hay claves nuevas: el paso 1 de WhatsApp no usa ninguna integración de servidor.

## 10. Pruebas

- **Unitarias:** importe en letras, fechas en Lima (cambio de día), nombre del archivo, mensaje y enlace de WhatsApp, y el modelo del documento con el ejemplo E1.
- **Integración (Supabase local):** genera un PDF válido, pasa a varias páginas con muchas líneas y rechaza una empresa incompleta o una proforma no válida.
- **Componentes:** vista «lista» (preparando, error, descargar, WhatsApp sin celular y con celular) y «Vista previa».
- **E2E (escritorio y móvil):** descargar el PDF con su nombre y abrir WhatsApp con el mensaje.
- **Revisión visual:** el PDF dibujado como imagen, comparado con la pizarra A4.
