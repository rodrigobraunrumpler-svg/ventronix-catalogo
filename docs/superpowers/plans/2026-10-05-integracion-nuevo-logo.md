# Integración del nuevo logo de Ventronix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan must be executed inline and without subagents.

**Goal:** Integrar el nuevo logo de Ventronix en los siete recursos visuales consumidos por la aplicación sin cambiar componentes, estilos ni comportamiento.

**Architecture:** La aplicación conservará las rutas públicas existentes, de modo que los consumidores actuales recibirán la marca nueva sin cambios de código. El isotipo se utilizará para superficies pequeñas y el logotipo completo para el acceso y la imagen Open Graph.

**Tech Stack:** Next.js 16.3.7, recursos PNG/ICO estáticos, Playwright, ESLint, TypeScript, Prettier y Vitest.

## Global Constraints

- Ejecutar todas las tareas en esta sesión, sin subagentes.
- No ejecutar `pnpm build`, `next build` ni `pnpm validate`, porque este último incluye el build.
- No modificar componentes React, estilos, textos, rutas ni metadatos descriptivos.
- No modificar `public/brand/ventronix-logo-proforma.jpg`, utilizado por PDF y Excel.
- Mantener las rutas y dimensiones declaradas en la especificación aprobada.

---

### Task 1: Integrar y verificar los recursos de marca

**Files:**

- Modify: `public/brand/ventronix-mark.png`
- Modify: `public/brand/ventronix-wordmark.png`
- Modify: `public/icons/icon-192.png`
- Modify: `public/icons/icon-512.png`
- Modify: `src/app/apple-icon.png`
- Modify: `src/app/favicon.ico`
- Modify: `src/app/opengraph-image.png`
- Verify unchanged: `public/brand/ventronix-logo-proforma.jpg`

**Interfaces:**

- Consumes: las rutas estáticas usadas por `src/components/brand.tsx`, `src/app/login/showcase.tsx`, `src/app/manifest.ts` y los metadatos de Next.js.
- Produces: archivos de imagen compatibles con las mismas rutas, formatos y dimensiones que esperan esos consumidores.

- [x] **Step 1: Confirmar que el cambio está limitado a los siete recursos aprobados**

Run:

```bash
git status --short
```

Expected: aparecen los siete recursos modificados y los documentos aprobados; no aparecen cambios de código fuente.

- [x] **Step 2: Verificar formatos y dimensiones**

Run:

```bash
file public/brand/ventronix-mark.png public/brand/ventronix-wordmark.png public/icons/icon-192.png public/icons/icon-512.png src/app/apple-icon.png src/app/favicon.ico src/app/opengraph-image.png
```

Expected:

```text
public/brand/ventronix-mark.png: PNG image data, 256 x 256
public/brand/ventronix-wordmark.png: PNG image data, 900 x 510
public/icons/icon-192.png: PNG image data, 192 x 192
public/icons/icon-512.png: PNG image data, 512 x 512
src/app/apple-icon.png: PNG image data, 180 x 180
src/app/favicon.ico: MS Windows icon resource - 3 icons
src/app/opengraph-image.png: PNG image data, 1200 x 630
```

- [x] **Step 3: Inspeccionar visualmente las variantes**

Abrir individualmente los siete recursos y confirmar:

- el isotipo está centrado y no está deformado;
- los iconos pequeños conservan margen negro y legibilidad;
- el logotipo completo no está cortado;
- la imagen Open Graph centra el logotipo sobre el lienzo negro;
- no existen bordes, fondos o artefactos ajenos a la marca.

- [x] **Step 4: Ejecutar comprobaciones sin build**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test
```

Expected: los cuatro comandos terminan con código 0.

- [x] **Step 5: Ejecutar la prueba de metadatos y recursos servidos**

Run:

```bash
pnpm test:e2e tests/e2e/metadata.spec.ts
```

Expected: la prueba confirma que el manifiesto y cada icono expuesto responden correctamente.

- [x] **Step 6: Revisar el diff final y registrar la integración**

Run:

```bash
git diff --check
git status --short
git add public/brand/ventronix-mark.png public/brand/ventronix-wordmark.png public/icons/icon-192.png public/icons/icon-512.png src/app/apple-icon.png src/app/favicon.ico src/app/opengraph-image.png docs/superpowers/plans/2026-10-05-integracion-nuevo-logo.md
git commit -m "feat: apply new Ventronix logo across app assets"
```

Expected: el diff no contiene errores de espacio y el commit incluye únicamente los siete recursos más este plan.
