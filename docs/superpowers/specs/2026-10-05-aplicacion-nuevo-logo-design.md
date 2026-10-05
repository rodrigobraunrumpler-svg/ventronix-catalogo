# Aplicación del nuevo logo de Ventronix

**Fecha:** 2026-10-05  
**Estado:** Aprobado

## Objetivo

Completar la aplicación del nuevo logo de Ventronix en la interfaz y los metadatos visuales de la aplicación, conservando la estructura, los tamaños y el comportamiento actuales.

## Alcance

Se reemplazarán únicamente los recursos gráficos ya consumidos por la aplicación:

- `public/brand/ventronix-mark.png`: isotipo usado en la navegación y vistas compactas.
- `public/brand/ventronix-wordmark.png`: logotipo completo mostrado en el acceso.
- `public/icons/icon-192.png`: icono PWA de 192 píxeles.
- `public/icons/icon-512.png`: icono PWA y variante `maskable` de 512 píxeles.
- `src/app/apple-icon.png`: icono para dispositivos Apple.
- `src/app/favicon.ico`: favicon de 16, 32 y 48 píxeles.
- `src/app/opengraph-image.png`: imagen social de 1200 × 630 píxeles.

El logo de las proformas PDF y de los documentos Excel ya apunta a `public/brand/ventronix-logo-proforma.jpg` y permanece sin cambios.

## Diseño

La actualización será conservadora:

- El isotipo se mostrará centrado sobre fondo negro y con suficiente margen para mantener su legibilidad en tamaños pequeños.
- Los iconos PWA conservarán un área segura compatible con el uso `maskable` declarado en el manifiesto.
- El logotipo completo conservará su relación de aspecto y fondo negro en el panel de acceso.
- La imagen Open Graph centrará el logotipo completo sobre un lienzo negro de 1200 × 630 píxeles.
- No se modificarán componentes React, estilos, textos, rutas ni metadatos descriptivos.

## Fuera de alcance

- Rediseñar la navegación o el acceso.
- Sustituir el texto que acompaña al isotipo en el componente `Brand`.
- Cambiar el eslogan, los colores o la composición entregada por la marca.
- Modificar el logotipo utilizado por PDF y Excel.

## Validación

La entrega se considerará correcta cuando:

1. Los siete archivos existan en sus rutas actuales y tengan las dimensiones esperadas.
2. El favicon contenga variantes de 16, 32 y 48 píxeles.
3. El isotipo sea reconocible en la navegación y los iconos pequeños.
4. El logotipo completo no esté cortado ni deformado en el acceso y Open Graph.
5. Las comprobaciones automatizadas de formato, tipos, pruebas y compilación relevantes terminen correctamente.
6. El árbol de trabajo no incluya cambios de código ajenos a esta actualización.

## Riesgos y mitigaciones

- **Pérdida de detalle en tamaños pequeños:** se utiliza únicamente el isotipo, con margen negro alrededor.
- **Recorte en iconos maskable:** el símbolo se mantiene dentro del área segura central.
- **Peso mayor de las imágenes:** se verificará el tamaño de los archivos y se optimizarán solo si el ahorro no degrada la marca.
