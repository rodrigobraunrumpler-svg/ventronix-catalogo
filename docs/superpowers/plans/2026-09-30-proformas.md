# Proforma en Productos — Implementation Plan

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:executing-plans (ejecución inline: el usuario pidió no usar subagentes). Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Goal:** Armar y generar una proforma desde la pantalla Productos, con cálculos exactos al céntimo, los datos de la empresa guardados en la base y numeración correlativa.

**Architecture:** El dinero, el IGV, las validaciones y el borrador son funciones puras en `src/features/proforma/`, con pruebas unitarias. La proforma en curso vive en el navegador (un almacén por pantalla con `useSyncExternalStore` sobre `localStorage`) y nunca se guarda en la base. Supabase guarda solo los datos de la empresa (`company_profile`, una fila) y la secuencia de números. La consulta de RUC es una Server Action detrás de un proveedor intercambiable.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Supabase/PostgreSQL (RLS, `unaccent`), TanStack Query, React Hook Form + Zod, Sonner, date-fns, Vitest + Testing Library, Playwright. Sin dependencias nuevas.

**Spec:** [Diseño de la proforma](../specs/2026-09-30-proformas-design.md). Prototipo: [lienzo «Catálogo — Prototipo»](https://claude.ai/artifact/7KjkXAw98vwSPa8hGesjfh), pizarras «Productos + proforma», «Proforma · Documento A4» y «Empresa».

## Global Constraints

- «No crear un backend independiente.» Lo que usa secretos va en Server Actions.
- «Ningún secreto debe exponerse al cliente.» `DECOLECTA_TOKEN` solo en el servidor, nunca con `NEXT_PUBLIC_`.
- Dinero en céntimos enteros (`bigint`), redondeo al céntimo con las mitades hacia arriba.
- Cantidad: entero de 1 a 9 999. Precio: mayor que 0 y menor que 10 000 000 000, hasta dos decimales. Descuento: 0 a 100 %, hasta dos decimales. Envío: 0 o más, hasta dos decimales. Total mayor que cero para generar. Cada total de línea y el total, menores que S/ 10 000 000 000.
- IGV: modo incluido, 18 %, con desglose, aislado en `src/features/proforma/tax.ts`.
- La proforma no se guarda en la base: solo `company_profile` y la secuencia de números.
- «No modificar el catálogo de productos desde una proforma.»
- Solo soles (S/).
- Textos de la interfaz en español, como en la spec: «Añadir», «Vaciar», «Deshacer», «Completar proforma», «Seguir eligiendo productos», «Más datos», «Generar proforma», «Corregir», «Nueva proforma».
- Pruebas y operaciones destructivas solo contra el Supabase local. Las migraciones de producción las aplica el usuario con `pnpm db:push`.
- Antes de escribir rutas o metadata, leer la guía correspondiente en `node_modules/next/dist/docs/` (AGENTS.md).
- Commits en `main`, con una sola línea de asunto: sin cuerpo y sin `Co-Authored-By`. Añadir archivos por nombre, nunca `git add -A`: `example-proforma.png` no se versiona.

## Review Focus

1. **Borrador dañado o de una versión anterior en `localStorage`:** la pantalla abre con la proforma vacía, sin error. Prueba en la tarea 8.
2. **Montos pegados con otro formato («1,234.50», «S/ 850», «850.»):** se marcan como no válidos y nunca se leen como otro importe. Prueba en la tarea 1.
3. **Doble clic en «Generar proforma» mientras se pide el número:** se pide un solo número. Prueba en la tarea 12.
4. **Respuesta tardía de SUNAT después de cambiar el documento:** no pisa la razón social ni la dirección. Prueba en la tarea 11.
5. **Cerrar sesión con una proforma a medias:** al volver a entrar no aparece. Prueba en la tarea 8.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
| --- | --- | --- |
| `src/features/proforma/money.ts` | Texto ↔ céntimos, porcentajes y redondeo | 1 |
| `src/features/proforma/tax.ts` | Módulo del IGV y su configuración | 1 |
| `src/features/proforma/totals.ts` | Totales, tope y lectura de lo escrito | 1 |
| `src/lib/peru.ts` | RUC, DNI y celular | 2 |
| `supabase/migrations/202609300001_search_unaccent.sql` | Búsqueda sin tildes | 3 |
| `supabase/migrations/202609300002_company_profile.sql` | Tabla de la empresa con RLS | 4 |
| `src/features/company/{schemas,format,queries,repository,actions}.ts` | Datos de la empresa | 4 |
| `src/features/company/hooks.ts`, `components/*`, `src/app/(private)/company/page.tsx` | Pantalla «Empresa» | 5 |
| `src/components/app-shell.tsx` | Menú con «Empresa», también en móvil | 5 |
| `supabase/migrations/202609300003_proforma_number.sql` | Secuencia y función de numeración | 6 |
| `src/features/proforma/number.ts`, `actions.ts` | Formato `N° 0001` y Server Actions | 6, 7 |
| `src/features/proforma/ruc.ts`, `ruc-provider.ts` | Tipos del RUC y proveedores (Decolecta y prueba) | 7 |
| `src/features/proforma/draft.ts`, `store.tsx` | Proforma en curso y su almacén | 8 |
| `src/features/proforma/components/proforma-control.tsx`, `hooks.ts` | «Añadir» / `[− n +]` y Enter | 9 |
| `src/features/proforma/components/proforma-bar.tsx` | Barra de proforma | 10 |
| `src/features/proforma/readiness.ts`, `components/proforma-{editor,lines,client,summary}.tsx` | Ventana: productos, cliente y resumen | 11 |
| `src/features/proforma/queries.ts`, `components/proforma-{panel,dialog}.tsx` | Generar, proforma lista y ventana | 12 |

Pruebas compartidas: `tests/support/company.ts` (tarea 4) y `tests/support/proforma.ts` (tarea 8).

Comandos útiles:

- Un archivo unitario: `pnpm vitest run --project unit tests/unit/<archivo>.test.ts`
- Un archivo de componentes: `pnpm vitest run --project components tests/components/<archivo>.test.tsx`
- Un archivo de integración (Supabase local encendido): `pnpm vitest run --project integration tests/integration/<archivo>.test.ts`
- Aplicar migraciones locales: `pnpm exec supabase migration up --local`, y luego `pnpm db:types`.

---

### Tarea 1: Dinero, IGV y totales

**Archivos:**
- Crear: `src/features/proforma/money.ts`, `src/features/proforma/tax.ts`, `src/features/proforma/totals.ts`
- Pruebas: `tests/unit/proforma-money.test.ts`, `tests/unit/proforma-totals.test.ts`

**Interfaces:**
- Produce: `ZERO`, `HUNDRED`, `parseCents(text: string): bigint | null`, `parsePercent(text: string): number | null` (centésimas de punto: 12,5 % → 1250), `divideRoundingHalfUp(n: bigint, d: bigint): bigint`, `formatCents(cents: bigint): string` («8,114.00»).
- Produce: `TaxMode`, `TaxConfig`, `TAX_CONFIG`, `TaxResult = { base; tax; total; showBreakdown; pricesIncludeTax }`, `applyTax(amount: bigint, config?): TaxResult`.
- Produce: `MAX_QUANTITY = 9999`, `AMOUNT_LIMIT`, `isValidQuantity(q: number): boolean`, `Totals = TaxResult & { lineTotals; subtotal; discount; net; shipping; withinLimit }`, `calculateTotals(input: TotalsInput, config?): Totals`, `totalsFromText(values: WrittenValues, config?): Totals | null`.

- [ ] **Paso 1: Escribir la prueba de `money.ts`**

`tests/unit/proforma-money.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  divideRoundingHalfUp,
  formatCents,
  parseCents,
  parsePercent,
} from '@/features/proforma/money'

describe('parseCents', () => {
  it.each([
    ['2590', BigInt(259000)],
    ['2590.5', BigInt(259050)],
    ['2590,55', BigInt(259055)],
    [' 0.01 ', BigInt(1)],
    ['0', BigInt(0)],
    ['9999999999.99', BigInt('999999999999')],
  ])('lee %j', (text, cents) => expect(parseCents(text)).toBe(cents))

  it.each(['', '1.234', '1,234.50', 'S/ 850', '850.', '-5', '12345678901', 'abc', '1e3'])(
    'rechaza %j sin leerlo como otro importe',
    (text) => expect(parseCents(text)).toBeNull(),
  )
})

describe('parsePercent', () => {
  it.each([
    ['5', 500],
    ['12,5', 1250],
    ['99.99', 9999],
    ['0', 0],
    ['100', 10000],
  ])('lee %j', (text, basisPoints) => expect(parsePercent(text)).toBe(basisPoints))

  it.each(['', '100.01', '101', '-1', '5%', '1.234'])('rechaza %j', (text) =>
    expect(parsePercent(text)).toBeNull(),
  )
})

describe('divideRoundingHalfUp', () => {
  it.each([
    [5, 2, 3],
    [7, 2, 4],
    [1, 3, 0],
    [2, 3, 1],
  ])('%i ÷ %i = %i', (n, d, expected) =>
    expect(divideRoundingHalfUp(BigInt(n), BigInt(d))).toBe(BigInt(expected)),
  )
})

describe('formatCents', () => {
  it.each([
    [BigInt(811400), '8,114.00'],
    [BigInt(5), '0.05'],
    [BigInt(12488751000), '124,887,510.00'],
  ])('%s → %s', (cents, text) => expect(formatCents(cents)).toBe(text))
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/proforma-money.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/money`.

- [ ] **Paso 3: Implementar `money.ts`**

`src/features/proforma/money.ts`:

```ts
// Dinero de la proforma en céntimos enteros (bigint): nunca pasa por coma flotante (spec §5.1).
export const ZERO = BigInt(0)
export const HUNDRED = BigInt(100)

// Como el precio del catálogo: punto o coma decimal, hasta dos decimales, sin separador de miles.
const AMOUNT_TEXT = /^\d{1,10}(?:[.,]\d{1,2})?$/
const PERCENT_TEXT = /^\d{1,3}(?:[.,]\d{1,2})?$/

function splitDecimal(text: string) {
  const [whole, fraction = ''] = text.replace(',', '.').split('.')
  return { whole, fraction: fraction.padEnd(2, '0') }
}

export function parseCents(text: string): bigint | null {
  const value = text.trim()
  if (!AMOUNT_TEXT.test(value)) return null
  const { whole, fraction } = splitDecimal(value)
  return BigInt(whole) * HUNDRED + BigInt(fraction)
}

// De 0 a 100 %, en centésimas de punto: 12,5 % → 1250.
export function parsePercent(text: string): number | null {
  const value = text.trim()
  if (!PERCENT_TEXT.test(value)) return null
  const { whole, fraction } = splitDecimal(value)
  const basisPoints = Number(whole) * 100 + Number(fraction)
  return basisPoints <= 10000 ? basisPoints : null
}

// Redondeo al entero más cercano, con las mitades hacia arriba (valores no negativos).
export function divideRoundingHalfUp(numerator: bigint, denominator: bigint) {
  return (numerator * BigInt(2) + denominator) / (denominator * BigInt(2))
}

export function formatCents(cents: bigint) {
  const whole = (cents / HUNDRED).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${whole}.${(cents % HUNDRED).toString().padStart(2, '0')}`
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/proforma-money.test.ts`
Expected: PASS.

- [ ] **Paso 5: Escribir la prueba del IGV y los totales**

`tests/unit/proforma-totals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatCents, parseCents, ZERO } from '@/features/proforma/money'
import { applyTax } from '@/features/proforma/tax'
import { calculateTotals, totalsFromText } from '@/features/proforma/totals'

const soles = (text: string) => parseCents(text) ?? ZERO
const line = (quantity: number, price: string) => ({ quantity, unitPrice: soles(price) })

// Ejemplos acordados en la spec (§5.3), recalculados con aritmética decimal exacta.
describe('calculateTotals con IGV incluido', () => {
  it.each([
    [
      'E1',
      [line(2, '2590'), line(1, '850'), line(1, '2490')],
      500,
      '20',
      ['8,520.00', '426.00', '8,094.00', '20.00', '8,114.00', '6,876.27', '1,237.73'],
    ],
    ['E2', [line(1, '890')], 0, '0', ['890.00', '0.00', '890.00', '0.00', '890.00', '754.24', '135.76']],
    [
      'E3',
      [line(3, '333.33')],
      1000,
      '0',
      ['999.99', '100.00', '899.99', '0.00', '899.99', '762.70', '137.29'],
    ],
    ['E4', [line(1, '500')], 10000, '25', ['500.00', '500.00', '0.00', '25.00', '25.00', '21.19', '3.81']],
    [
      'E5',
      [line(9999, '12490')],
      0,
      '0',
      [
        '124,887,510.00',
        '0.00',
        '124,887,510.00',
        '0.00',
        '124,887,510.00',
        '105,836,872.88',
        '19,050,637.12',
      ],
    ],
  ])('%s', (_, lines, discountBasisPoints, shipping, expected) => {
    const totals = calculateTotals({ lines, discountBasisPoints, shipping: soles(shipping) })
    const { subtotal, discount, net, total, base, tax } = totals
    expect([subtotal, discount, net, totals.shipping, total, base, tax].map(formatCents)).toEqual(
      expected,
    )
    expect(totals.withinLimit).toBe(true)
  })
})

describe('tope de S/ 10 000 000 000', () => {
  const totalsOf = (lines: ReturnType<typeof line>[], shipping = '0') =>
    calculateTotals({ lines, discountBasisPoints: 0, shipping: soles(shipping) })

  it('admite el precio máximo del catálogo', () => {
    expect(totalsOf([line(1, '9999999999.99')]).withinLimit).toBe(true)
  })
  it('rechaza un total de línea que llega al tope', () => {
    expect(totalsOf([line(2, '9999999999.99')]).withinLimit).toBe(false)
  })
  it('rechaza un total que llega al tope por el envío', () => {
    expect(totalsOf([line(1, '9999999999.99')], '0.01').withinLimit).toBe(false)
  })
})

describe('applyTax', () => {
  const amount = soles('890')
  it('incluido: la base se redondea y el IGV es la diferencia', () => {
    expect(applyTax(amount)).toEqual({
      base: soles('754.24'),
      tax: soles('135.76'),
      total: amount,
      showBreakdown: true,
      pricesIncludeTax: true,
    })
  })
  it('incluido sin desglose: mismos importes, sin mostrar el detalle', () => {
    expect(applyTax(amount, { mode: 'included-hidden', ratePercent: 18 })).toMatchObject({
      base: soles('754.24'),
      showBreakdown: false,
      pricesIncludeTax: true,
    })
  })
  it('sumado al final: el IGV se añade al total', () => {
    expect(applyTax(soles('1000'), { mode: 'added', ratePercent: 18 })).toMatchObject({
      base: soles('1000'),
      tax: soles('180'),
      total: soles('1180'),
      pricesIncludeTax: false,
    })
  })
  it('sin IGV', () => {
    expect(applyTax(amount, { mode: 'none', ratePercent: 18 })).toMatchObject({
      tax: ZERO,
      total: amount,
      showBreakdown: false,
    })
  })
})

describe('totalsFromText', () => {
  const written = (overrides = {}) => ({
    lines: [{ quantity: 2, unitPrice: '2590' }],
    discountPercent: '',
    shipping: '',
    ...overrides,
  })

  it('descuento y envío vacíos cuentan como cero', () => {
    expect(formatCents(totalsFromText(written())!.total)).toBe('5,180.00')
  })
  it('lee descuento y envío escritos con coma', () => {
    const totals = totalsFromText(written({ discountPercent: '5', shipping: '20,50' }))!
    expect(formatCents(totals.total)).toBe('4,941.50')
  })
  it.each([
    ['precio no válido', { lines: [{ quantity: 1, unitPrice: 'abc' }] }],
    ['precio cero', { lines: [{ quantity: 1, unitPrice: '0' }] }],
    ['cantidad cero', { lines: [{ quantity: 0, unitPrice: '10' }] }],
    ['cantidad sobre el máximo', { lines: [{ quantity: 10000, unitPrice: '10' }] }],
    ['descuento mayor que 100 %', { discountPercent: '101' }],
    ['envío negativo', { shipping: '-1' }],
  ])('devuelve null con %s', (_, overrides) => expect(totalsFromText(written(overrides))).toBeNull())
})
```

- [ ] **Paso 6: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/proforma-totals.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/tax`.

- [ ] **Paso 7: Implementar `tax.ts` y `totals.ts`**

`src/features/proforma/tax.ts`:

```ts
import { divideRoundingHalfUp, HUNDRED, ZERO } from './money'

// IGV en un módulo aislado (spec §5.2): cambiar de modo es cambiar TAX_CONFIG, nada más.
export type TaxMode = 'included' | 'included-hidden' | 'added' | 'none'
export type TaxConfig = { mode: TaxMode; ratePercent: number }

// ponytail: incluido con desglose por defecto; falta confirmarlo con quien envió el ejemplo (spec §12).
export const TAX_CONFIG: TaxConfig = { mode: 'included', ratePercent: 18 }

export type TaxResult = {
  base: bigint // Op. gravada
  tax: bigint // IGV
  total: bigint // lo que paga el cliente
  showBreakdown: boolean
  pricesIncludeTax: boolean
}

export function applyTax(amount: bigint, config: TaxConfig = TAX_CONFIG): TaxResult {
  const rate = BigInt(config.ratePercent)
  if (config.mode === 'added') {
    const tax = divideRoundingHalfUp(amount * rate, HUNDRED)
    return { base: amount, tax, total: amount + tax, showBreakdown: true, pricesIncludeTax: false }
  }
  if (config.mode === 'none') {
    return { base: amount, tax: ZERO, total: amount, showBreakdown: false, pricesIncludeTax: false }
  }
  // Incluido: se redondea la base y el IGV es la diferencia, así ambos suman exactamente el total.
  const base = divideRoundingHalfUp(amount * HUNDRED, HUNDRED + rate)
  return {
    base,
    tax: amount - base,
    total: amount,
    showBreakdown: config.mode === 'included',
    pricesIncludeTax: true,
  }
}
```

`src/features/proforma/totals.ts`:

```ts
import { divideRoundingHalfUp, parseCents, parsePercent, ZERO } from './money'
import { applyTax, TAX_CONFIG, type TaxConfig, type TaxResult } from './tax'

export const MAX_QUANTITY = 9999
// Tope (spec §5.1): cada total de línea y el total, menores que S/ 10 000 000 000.
export const AMOUNT_LIMIT = BigInt('1000000000000')

export const isValidQuantity = (quantity: number) =>
  Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY

export type TotalsInput = {
  lines: { quantity: number; unitPrice: bigint }[]
  discountBasisPoints: number
  shipping: bigint
}

export type Totals = TaxResult & {
  lineTotals: bigint[]
  subtotal: bigint
  discount: bigint
  net: bigint
  shipping: bigint
  withinLimit: boolean
}

export function calculateTotals(input: TotalsInput, config: TaxConfig = TAX_CONFIG): Totals {
  const lineTotals = input.lines.map((line) => BigInt(line.quantity) * line.unitPrice)
  const subtotal = lineTotals.reduce((sum, value) => sum + value, ZERO)
  const discount = divideRoundingHalfUp(
    subtotal * BigInt(input.discountBasisPoints),
    BigInt(10000),
  )
  const net = subtotal - discount
  const taxed = applyTax(net + input.shipping, config)
  const withinLimit = [...lineTotals, taxed.total].every((value) => value < AMOUNT_LIMIT)
  return { ...taxed, lineTotals, subtotal, discount, net, shipping: input.shipping, withinLimit }
}

// Valores tal como se escriben en la proforma; descuento o envío vacíos cuentan como cero.
export type WrittenValues = {
  lines: { quantity: number; unitPrice: string }[]
  discountPercent: string
  shipping: string
}

// null si algún valor escrito no es válido: la pantalla lo marca y no muestra totales falsos.
export function totalsFromText(
  values: WrittenValues,
  config: TaxConfig = TAX_CONFIG,
): Totals | null {
  const discount = values.discountPercent.trim() === '' ? 0 : parsePercent(values.discountPercent)
  const shipping = values.shipping.trim() === '' ? ZERO : parseCents(values.shipping)
  if (discount === null || shipping === null) return null
  const lines: TotalsInput['lines'] = []
  for (const line of values.lines) {
    const unitPrice = parseCents(line.unitPrice)
    if (unitPrice === null || unitPrice <= ZERO || !isValidQuantity(line.quantity)) return null
    lines.push({ quantity: line.quantity, unitPrice })
  }
  return calculateTotals({ lines, discountBasisPoints: discount, shipping }, config)
}
```

- [ ] **Paso 8: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/proforma-money.test.ts tests/unit/proforma-totals.test.ts`
Expected: PASS en ambos archivos.

- [ ] **Paso 9: Commit**

```bash
git add src/features/proforma/money.ts src/features/proforma/tax.ts src/features/proforma/totals.ts tests/unit/proforma-money.test.ts tests/unit/proforma-totals.test.ts
git commit -m "feat: add proforma money, IGV and totals"
```

---

### Tarea 2: Validaciones peruanas

**Archivos:**
- Crear: `src/lib/peru.ts`
- Prueba: `tests/unit/peru.test.ts`

**Interfaces:**
- Produce: `digitsOnly(value: string): string`, `isValidRuc(value: string): boolean`, `documentKind(value: string): 'ruc' | 'dni' | null`, `documentError(value: string): string | null`, `isValidMobile(value: string): boolean` (9 dígitos que empiezan por 9, sin espacios).

- [ ] **Paso 1: Escribir la prueba**

`tests/unit/peru.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { digitsOnly, documentError, documentKind, isValidMobile, isValidRuc } from '@/lib/peru'

describe('isValidRuc', () => {
  // 20000000010: el dígito calculado es 10 → 0. 20000000061: es 11 → 1.
  it.each(['20000000001', '20000000010', '20000000061', '20601030013', '10412345679'])(
    'acepta %s',
    (ruc) => expect(isValidRuc(ruc)).toBe(true),
  )
  it.each(['20000000002', '30000000001', '2000000000', '2000000000a', ''])('rechaza %j', (ruc) =>
    expect(isValidRuc(ruc)).toBe(false),
  )
})

describe('documento del cliente', () => {
  it('distingue RUC y DNI por el número de dígitos', () => {
    expect(documentKind('20000000001')).toBe('ruc')
    expect(documentKind('12345678')).toBe('dni')
    expect(documentKind('123')).toBeNull()
  })
  it('vacío o válido no tiene error', () => {
    expect(documentError('')).toBeNull()
    expect(documentError('12345678')).toBeNull()
    expect(documentError('20000000001')).toBeNull()
  })
  it('explica el largo y el dígito verificador', () => {
    expect(documentError('123')).toBe('Escribe 8 dígitos para DNI u 11 para RUC.')
    expect(documentError('20000000002')).toBe('Este RUC no es válido. Revisa los 11 dígitos.')
  })
})

describe('celular y dígitos', () => {
  it('celular: 9 dígitos que empiezan por 9', () => {
    expect(isValidMobile('987654321')).toBe(true)
    expect(isValidMobile('887654321')).toBe(false)
    expect(isValidMobile('98765432')).toBe(false)
  })
  it('digitsOnly quita espacios y signos', () => {
    expect(digitsOnly('987 654-321')).toBe('987654321')
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/peru.test.ts`
Expected: FAIL, no se puede resolver `@/lib/peru`.

- [ ] **Paso 3: Implementar**

`src/lib/peru.ts`:

```ts
// Documentos y teléfonos de Perú. Sin dependencias: se usa en el cliente y en el servidor.
export const digitsOnly = (value: string) => value.replace(/\D/g, '')

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

// RUC: prefijo de contribuyente (10, 15, 17 o 20), 11 dígitos y dígito verificador (módulo 11).
export function isValidRuc(value: string) {
  if (!/^(10|15|17|20)\d{9}$/.test(value)) return false
  const sum = RUC_WEIGHTS.reduce((total, weight, index) => total + weight * Number(value[index]), 0)
  const check = 11 - (sum % 11)
  return (check === 10 ? 0 : check === 11 ? 1 : check) === Number(value[10])
}

export function documentKind(value: string): 'ruc' | 'dni' | null {
  if (/^\d{11}$/.test(value)) return 'ruc'
  if (/^\d{8}$/.test(value)) return 'dni'
  return null
}

// Opcional en la proforma: vacío no es error (spec §4.3).
export function documentError(value: string) {
  if (value === '') return null
  const kind = documentKind(value)
  if (kind === null) return 'Escribe 8 dígitos para DNI u 11 para RUC.'
  if (kind === 'ruc' && !isValidRuc(value)) return 'Este RUC no es válido. Revisa los 11 dígitos.'
  return null
}

export const isValidMobile = (value: string) => /^9\d{8}$/.test(value)
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/peru.test.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/peru.ts tests/unit/peru.test.ts
git commit -m "feat: validate Peruvian RUC, DNI and mobile numbers"
```

---

### Tarea 3: Búsqueda sin tildes

**Archivos:**
- Crear: `supabase/migrations/202609300001_search_unaccent.sql`
- Modificar: `tests/integration/catalog-search.test.ts` (nueva prueba dentro de `describe('listado del catálogo')`)
- Regenerar: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consume: `listProducts(supabase, filters)` sin cambios de firma.
- Produce: `search_products` compara nombre, código y búsqueda sin tildes ni mayúsculas.

- [ ] **Paso 1: Escribir la prueba**

Añadir en `tests/integration/catalog-search.test.ts`, después de la prueba «busca por código o por nombre sin distinguir mayúsculas»:

```ts
  it('busca sin tildes en el nombre, en el código y en lo escrito', async () => {
    await insertProduct('IMP-001', 'Impresión láser', printers)
    await insertProduct('LAP-001', 'Laptop de oficina', laptops)
    expect(codes(await listProducts(supabase, filters({ search: 'impresion' })))).toEqual([
      'IMP-001',
    ])
    expect(codes(await listProducts(supabase, filters({ search: 'LASER' })))).toEqual(['IMP-001'])
    expect(codes(await listProducts(supabase, filters({ search: 'ofícina' })))).toEqual([
      'LAP-001',
    ])
  })
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project integration tests/integration/catalog-search.test.ts`
Expected: FAIL en la prueba nueva: `impresion` devuelve `[]`.

- [ ] **Paso 3: Escribir la migración**

`supabase/migrations/202609300001_search_unaccent.sql`:

```sql
-- Búsqueda sin tildes (spec §8): «impresion» encuentra «Impresión» y «LASER», «láser».
-- unaccent vive en el esquema extensions; con search_path vacío se llama con su diccionario
-- calificado. Sigue escapando % _ \ como la versión anterior y conserva sus permisos.
create extension if not exists unaccent with schema extensions;

create or replace function public.search_products(
  search text default '',
  category uuid default null,
  page integer default 1,
  page_size integer default 20
)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      '%' || replace(replace(replace(
        extensions.unaccent('extensions.unaccent', coalesce(search, '')),
        '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
      least(greatest(page_size, 1), 100) as size,
      greatest(page, 1) as current_page
  ),
  filtered as (
    select
      p.id, p.code, p.name, p.description, p.category_id,
      p.unit_price::text as unit_price, p.created_at, p.updated_at,
      c.name as category_name
    from public.products p
    join public.categories c on c.id = p.category_id
    cross join params
    where (category is null or p.category_id = category)
      and (
        extensions.unaccent('extensions.unaccent', p.name) ilike params.pattern
        or extensions.unaccent('extensions.unaccent', p.code) ilike params.pattern
      )
  )
  select json_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce(
      (
        select json_agg(row_to_json(page_rows) order by page_rows.name, page_rows.id)
        from (
          select filtered.*
          from filtered, params
          order by filtered.name, filtered.id
          limit (select size from params)
          offset ((select current_page from params) - 1) * (select size from params)
        ) page_rows
      ),
      '[]'::json
    )
  )
$$;
```

- [ ] **Paso 4: Aplicar en local y ver que pasa**

Run: `pnpm exec supabase migration up --local && pnpm db:types && pnpm vitest run --project integration tests/integration/catalog-search.test.ts`
Expected: la migración se aplica y todas las pruebas del archivo pasan, también las de comodines literales.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/202609300001_search_unaccent.sql tests/integration/catalog-search.test.ts src/lib/supabase/database.types.ts
git commit -m "feat: search products ignoring accents"
```

---
### Tarea 4: Datos de la empresa en la base

**Archivos:**
- Crear: `supabase/migrations/202609300002_company_profile.sql`
- Crear: `src/features/company/schemas.ts`, `src/features/company/format.ts`, `src/features/company/queries.ts`, `src/features/company/repository.ts`, `src/features/company/actions.ts`
- Crear: `tests/support/company.ts`
- Modificar: `tests/integration/db.ts` (añadir `resetCompanyProfile` y `fillCompanyProfile`)
- Pruebas: `tests/unit/company-schemas.test.ts`, `tests/integration/company-profile.test.ts`
- Regenerar: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consume: `isValidRuc`, `isValidMobile`, `digitsOnly` (tarea 2); `withOwner`, `failure`, `unexpected`, `invalid` (existentes).
- Produce: `companyProfileSchema`, `CompanyFormValues` (entrada), `CompanyInput` (salida), `CompanyProfile`, `BankAccount`, `Wallet`, `WalletKind`, `WALLET_KINDS`, `PHONE_LIMIT = 4`, `ACCOUNT_LIMIT = 6`, `WALLET_LIMIT = 4`.
- Produce: `walletLabel(kind)`, `formatMobile(digits)`, `missingCompanyFields(profile): string[]`.
- Produce: `getCompanyProfile(supabase): Promise<CompanyProfile | null>`, `saveCompanyProfileRow(supabase, input): Promise<ActionResult<CompanyProfile>>`, Server Action `saveCompanyProfile(input: unknown)`.
- Produce (pruebas): `emptyCompany`, `completeCompany`; `resetCompanyProfile(db)`, `fillCompanyProfile(db)`.

- [ ] **Paso 1: Escribir la prueba de los schemas**

`tests/support/company.ts`:

```ts
import type { CompanyProfile } from '@/features/company/schemas'

// Como la crea la migración: sin datos y con 7 días de validez.
export const emptyCompany: CompanyProfile = {
  legal_name: null,
  trade_name: null,
  ruc: null,
  address: null,
  phones: [],
  email: null,
  payment_terms: null,
  return_policy: null,
  default_validity_days: 7,
  bank_accounts: [],
  wallets: [],
  updated_at: '2026-09-30T00:00:00Z',
}

// Solo lo obligatorio (spec §6.2): razón social, RUC, dirección y un teléfono.
export const completeCompany: CompanyProfile = {
  ...emptyCompany,
  legal_name: 'Empresa de Pruebas S.A.C.',
  ruc: '20000000001',
  address: 'Av. Prueba 123, Huamanga',
  phones: ['066 312345'],
}
```

`tests/unit/company-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatMobile, missingCompanyFields, walletLabel } from '@/features/company/format'
import { companyProfileSchema, type CompanyFormValues } from '@/features/company/schemas'
import { completeCompany, emptyCompany } from '../support/company'

const valid: CompanyFormValues = {
  legal_name: ' Empresa de Pruebas S.A.C. ',
  trade_name: '',
  ruc: '20000000001',
  address: 'Av. Prueba 123',
  phones: [{ number: '066 312345' }],
  email: '',
  payment_terms: '',
  return_policy: '',
  default_validity_days: '7',
  bank_accounts: [
    { bank: 'BCP', account: '191-1234567-0-12', cci: '002-191-001234567012-54', holder: '' },
  ],
  wallets: [{ kind: 'plin', number: '987 654 321' }],
}

function issues(values: unknown) {
  const result = companyProfileSchema.safeParse(values)
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
}

describe('companyProfileSchema', () => {
  it('normaliza lo escrito', () => {
    expect(companyProfileSchema.parse(valid)).toEqual({
      legal_name: 'Empresa de Pruebas S.A.C.',
      trade_name: null,
      ruc: '20000000001',
      address: 'Av. Prueba 123',
      phones: [{ number: '066 312345' }],
      email: null,
      payment_terms: null,
      return_policy: null,
      default_validity_days: 7,
      bank_accounts: [
        { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254', holder: null },
      ],
      wallets: [{ kind: 'plin', number: '987654321' }],
    })
  })

  it('el servidor acepta lo que envía el formulario ya validado', () => {
    const once = companyProfileSchema.parse(valid)
    expect(companyProfileSchema.parse(once)).toEqual(once)
  })

  it.each([
    [{ legal_name: '  ' }, 'legal_name: Escribe la razón social.'],
    [
      { ruc: '20000000002' },
      'ruc: Escribe un RUC válido: 11 dígitos con su dígito verificador.',
    ],
    [{ address: '' }, 'address: Escribe la dirección.'],
    [{ phones: [] }, 'phones: Añade al menos un teléfono.'],
    [
      { phones: [{ number: 'abc' }] },
      'phones.0.number: Escribe un teléfono válido: números, espacios, +, - o paréntesis.',
    ],
    [{ email: 'ventas@' }, 'email: Escribe un correo válido.'],
    [{ default_validity_days: '0' }, 'default_validity_days: La validez va de 1 a 365 días.'],
    [{ default_validity_days: '366' }, 'default_validity_days: La validez va de 1 a 365 días.'],
    [{ default_validity_days: 'abc' }, 'default_validity_days: La validez va de 1 a 365 días.'],
    [
      { bank_accounts: [{ bank: 'BCP', account: '1911234567012', cci: '1234', holder: '' }] },
      'bank_accounts.0.cci: El CCI tiene 20 dígitos.',
    ],
    [
      { bank_accounts: [{ bank: 'BCP', account: '12', cci: '00219100123456701254', holder: '' }] },
      'bank_accounts.0.account: Escribe el número de cuenta: de 6 a 20 dígitos.',
    ],
    [
      { wallets: [{ kind: 'yape', number: '887654321' }] },
      'wallets.0.number: Escribe 9 dígitos que empiecen por 9.',
    ],
  ])('rechaza %j', (overrides, expected) => {
    expect(issues({ ...valid, ...overrides })).toEqual([expected])
  })

  it('rechaza un tipo de número que no es Yape, Plin ni ambos', () => {
    expect(issues({ ...valid, wallets: [{ kind: 'tunki', number: '987654321' }] })[0]).toMatch(
      /^wallets\.0\.kind/,
    )
  })
})

describe('formato de la empresa', () => {
  it('nombra Yape, Plin o ambos como en el documento', () => {
    expect((['yape', 'plin', 'ambos'] as const).map(walletLabel)).toEqual([
      'Yape',
      'Plin',
      'Yape / Plin',
    ])
    expect(formatMobile('987654321')).toBe('987 654 321')
  })

  it('lista lo obligatorio que falta', () => {
    expect(missingCompanyFields(emptyCompany)).toEqual([
      'razón social',
      'RUC',
      'dirección',
      'teléfono',
    ])
    expect(missingCompanyFields(completeCompany)).toEqual([])
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/company-schemas.test.ts`
Expected: FAIL, no se puede resolver `@/features/company/format`.

- [ ] **Paso 3: Implementar schemas y formato**

`src/features/company/schemas.ts`:

```ts
import { z } from 'zod'
import { digitsOnly, isValidMobile, isValidRuc } from '@/lib/peru'

// Datos de la empresa para la proforma (spec §6.2). Importable en cliente y servidor. La salida
// vuelve a validar igual: el servidor comprueba exactamente lo que envía el formulario.
const tooLong = (max: number) => `Usa como máximo ${max} caracteres.`
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, tooLong(max))
    .nullish()
    .transform((value) => value || null)

export const PHONE_LIMIT = 4
export const ACCOUNT_LIMIT = 6
export const WALLET_LIMIT = 4
export const WALLET_KINDS = ['yape', 'plin', 'ambos'] as const

const accountMessage = 'Escribe el número de cuenta: de 6 a 20 dígitos.'
const mobileMessage = 'Escribe 9 dígitos que empiecen por 9.'
const validityMessage = 'La validez va de 1 a 365 días.'

const phoneSchema = z.object({
  number: z
    .string()
    .trim()
    .regex(
      /^[\d +()-]{6,20}$/,
      'Escribe un teléfono válido: números, espacios, +, - o paréntesis.',
    ),
})

export const bankAccountSchema = z.object({
  bank: z.string().trim().min(1, 'Escribe el banco.').max(60, tooLong(60)),
  account: z
    .string()
    .trim()
    .regex(/^[\d -]+$/, accountMessage)
    .refine((value) => {
      const digits = digitsOnly(value).length
      return digits >= 6 && digits <= 20
    }, accountMessage),
  cci: z
    .string()
    .trim()
    .regex(/^[\d -]+$/, 'El CCI tiene 20 dígitos.')
    .transform(digitsOnly)
    .refine((value) => value.length === 20, 'El CCI tiene 20 dígitos.'),
  holder: optionalText(200),
})

export const walletSchema = z.object({
  kind: z.enum(WALLET_KINDS),
  number: z
    .string()
    .trim()
    .regex(/^[\d ]+$/, mobileMessage)
    .transform(digitsOnly)
    .refine(isValidMobile, mobileMessage),
})

export const companyProfileSchema = z.object({
  legal_name: z.string().trim().min(1, 'Escribe la razón social.').max(200, tooLong(200)),
  trade_name: optionalText(120),
  ruc: z
    .string()
    .trim()
    .refine(isValidRuc, 'Escribe un RUC válido: 11 dígitos con su dígito verificador.'),
  address: z.string().trim().min(1, 'Escribe la dirección.').max(300, tooLong(300)),
  phones: z
    .array(phoneSchema)
    .min(1, 'Añade al menos un teléfono.')
    .max(PHONE_LIMIT, `Hasta ${PHONE_LIMIT} teléfonos.`),
  email: z
    .string()
    .trim()
    .max(254, tooLong(254))
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      'Escribe un correo válido.',
    )
    .nullish()
    .transform((value) => value || null),
  payment_terms: optionalText(500),
  return_policy: optionalText(500),
  default_validity_days: z.coerce
    .number(validityMessage)
    .int(validityMessage)
    .min(1, validityMessage)
    .max(365, validityMessage),
  bank_accounts: z.array(bankAccountSchema).max(ACCOUNT_LIMIT, `Hasta ${ACCOUNT_LIMIT} cuentas.`),
  wallets: z.array(walletSchema).max(WALLET_LIMIT, `Hasta ${WALLET_LIMIT} números.`),
})

export type CompanyFormValues = z.input<typeof companyProfileSchema>
export type CompanyInput = z.output<typeof companyProfileSchema>
export type BankAccount = z.output<typeof bankAccountSchema>
export type Wallet = z.output<typeof walletSchema>
export type WalletKind = (typeof WALLET_KINDS)[number]

// Lo guardado: empieza vacío hasta que la cuenta autorizada lo completa en «Empresa».
export type CompanyProfile = {
  legal_name: string | null
  trade_name: string | null
  ruc: string | null
  address: string | null
  phones: string[]
  email: string | null
  payment_terms: string | null
  return_policy: string | null
  default_validity_days: number
  bank_accounts: BankAccount[]
  wallets: Wallet[]
  updated_at: string
}
```

`src/features/company/format.ts`:

```ts
import type { CompanyProfile, WalletKind } from './schemas'

const WALLET_LABELS: Record<WalletKind, string> = {
  yape: 'Yape',
  plin: 'Plin',
  ambos: 'Yape / Plin',
}

// Como lo muestra el documento: «Yape: …», «Plin: …» o «Yape / Plin: …» (spec §6.2).
export const walletLabel = (kind: WalletKind) => WALLET_LABELS[kind]

export const formatMobile = (digits: string) => digits.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3')

// Lo que el documento necesita sí o sí (spec §6.2).
export function missingCompanyFields(profile: CompanyProfile) {
  const missing: string[] = []
  if (!profile.legal_name) missing.push('razón social')
  if (!profile.ruc) missing.push('RUC')
  if (!profile.address) missing.push('dirección')
  if (profile.phones.length === 0) missing.push('teléfono')
  return missing
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/company-schemas.test.ts`
Expected: PASS.

- [ ] **Paso 5: Escribir la prueba de integración**

Añadir al final de `tests/integration/db.ts`:

```ts
// Deja la fila única de company_profile como la crea la migración: vacía.
export async function resetCompanyProfile(client: Client) {
  await client.query('delete from public.company_profile')
  await client.query('insert into public.company_profile default values')
}

// Solo lo obligatorio de una empresa ficticia, para las pruebas que generan proformas.
export async function fillCompanyProfile(client: Client) {
  await client.query(
    `update public.company_profile
        set legal_name = 'Empresa de Pruebas S.A.C.', ruc = '20000000001',
            address = 'Av. Prueba 123, Huamanga', phones = array['066 312345']`,
  )
}
```

`tests/integration/company-profile.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getCompanyProfile } from '@/features/company/queries'
import { saveCompanyProfileRow } from '@/features/company/repository'
import { companyProfileSchema } from '@/features/company/schemas'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect, resetCompanyProfile, sqlState } from './db'

const password = 'empresa-clave-123'
const owner = { email: 'empresa-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'empresa-intruso@catalogo.test' }

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  await ensureUser({ password, ...intruder })
  supabase = await signedInClient(owner.email, password)
  outsider = await signedInClient(intruder.email, password)
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCompanyProfile(db)
})

const input = companyProfileSchema.parse({
  legal_name: 'Empresa de Pruebas S.A.C.',
  trade_name: 'Pruebas',
  ruc: '20000000001',
  address: 'Av. Prueba 123, Huamanga',
  phones: [{ number: '066 312345' }, { number: '987 654 321' }],
  email: 'ventas@pruebas.test',
  payment_terms: 'Contado contra entrega.',
  return_policy: 'Cambios dentro de los 7 días.',
  default_validity_days: '15',
  bank_accounts: [
    { bank: 'BCP', account: '191-1234567-0-12', cci: '002 191 001234567012 54', holder: '' },
    {
      bank: 'Interbank',
      account: '200-3001234567',
      cci: '00320000300123456722',
      holder: 'Otra Titular',
    },
  ],
  wallets: [
    { kind: 'yape', number: '987654321' },
    { kind: 'ambos', number: '912 345 678' },
  ],
})

describe('datos de la empresa', () => {
  it('empiezan vacíos, con 7 días de validez', async () => {
    expect(await getCompanyProfile(supabase)).toMatchObject({
      legal_name: null,
      ruc: null,
      phones: [],
      default_validity_days: 7,
      bank_accounts: [],
      wallets: [],
    })
  })

  it('guarda y lee teléfonos, cuentas y números en el orden dado', async () => {
    expect(await saveCompanyProfileRow(supabase, input)).toMatchObject({ ok: true })
    expect(await getCompanyProfile(supabase)).toMatchObject({
      legal_name: 'Empresa de Pruebas S.A.C.',
      phones: ['066 312345', '987 654 321'],
      default_validity_days: 15,
      bank_accounts: [
        { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254', holder: null },
        { bank: 'Interbank', holder: 'Otra Titular' },
      ],
      wallets: [
        { kind: 'yape', number: '987654321' },
        { kind: 'ambos', number: '912345678' },
      ],
    })
  })

  it('una cuenta sin autorización no los ve ni los cambia', async () => {
    expect((await outsider.from('company_profile').select('legal_name')).data).toEqual([])
    expect(await saveCompanyProfileRow(outsider, input)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await getCompanyProfile(supabase)).toMatchObject({ legal_name: null })
  })

  it('sin sesión no se pueden leer', async () => {
    const { data } = await publicClient().from('company_profile').select('legal_name')
    expect(data ?? []).toEqual([])
  })

  it('no admite una segunda fila', async () => {
    expect((await supabase.from('company_profile').insert({})).error?.code).toBe('42501')
    expect(await sqlState(db.query('insert into public.company_profile (id) values (false)'))).toBe(
      '23514',
    )
  })

  it('la base rechaza un RUC con otro formato', async () => {
    expect(await sqlState(db.query("update public.company_profile set ruc = '123'"))).toBe('23514')
  })
})
```

- [ ] **Paso 6: Ejecutar y ver que falla**

Run: `pnpm vitest run --project integration tests/integration/company-profile.test.ts`
Expected: FAIL, no se puede resolver `@/features/company/queries` (y la tabla aún no existe).

- [ ] **Paso 7: Escribir la migración**

`supabase/migrations/202609300002_company_profile.sql`:

```sql
-- Datos de la empresa para la proforma (spec §6.2): una sola fila, con los permisos del catálogo.
-- Empieza vacía: la cuenta autorizada la completa en la pantalla «Empresa». Los límites de las
-- listas mantienen el documento legible; el formato de cada elemento lo valida la Server Action.
create table public.company_profile (
  id boolean primary key default true check (id),
  legal_name text check (btrim(legal_name) <> '' and char_length(legal_name) <= 200),
  trade_name text check (btrim(trade_name) <> '' and char_length(trade_name) <= 120),
  ruc text check (ruc ~ '^(10|15|17|20)[0-9]{9}$'),
  address text check (btrim(address) <> '' and char_length(address) <= 300),
  phones text[] not null default '{}' check (cardinality(phones) <= 4),
  email text check (char_length(email) <= 254),
  payment_terms text check (char_length(payment_terms) <= 500),
  return_policy text check (char_length(return_policy) <= 500),
  default_validity_days integer not null default 7
    check (default_validity_days between 1 and 365),
  bank_accounts jsonb not null default '[]' check (
    case when jsonb_typeof(bank_accounts) = 'array'
      then jsonb_array_length(bank_accounts) <= 6 else false end
  ),
  wallets jsonb not null default '[]' check (
    case when jsonb_typeof(wallets) = 'array'
      then jsonb_array_length(wallets) <= 4 else false end
  ),
  updated_at timestamptz not null default now()
);

create trigger company_profile_set_updated_at
before update on public.company_profile
for each row execute function public.set_updated_at();

alter table public.company_profile enable row level security;

-- Sin insert ni delete: la fila la crea esta migración y la app solo la lee y la actualiza.
revoke all on table public.company_profile from anon, authenticated;
grant select, update on table public.company_profile to authenticated;

create policy "owner reads company profile" on public.company_profile
  for select to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

create policy "owner updates company profile" on public.company_profile
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'catalog_access') = 'owner');

insert into public.company_profile default values;
```

Run: `pnpm exec supabase migration up --local && pnpm db:types`
Expected: la migración se aplica y `database.types.ts` incluye `company_profile`.

- [ ] **Paso 8: Implementar lectura, guardado y la Server Action**

`src/features/company/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { WALLET_KINDS, type CompanyProfile } from './schemas'

type Client = SupabaseClient<Database>

export const companyColumns =
  'legal_name, trade_name, ruc, address, phones, email, payment_terms, return_policy, default_validity_days, bank_accounts, wallets, updated_at'

// Lo guardado ya pasó por companyProfileSchema: aquí solo se comprueba la forma de las listas.
const storedLists = z.object({
  bank_accounts: z.array(
    z.object({
      bank: z.string(),
      account: z.string(),
      cci: z.string(),
      holder: z.string().nullable(),
    }),
  ),
  wallets: z.array(z.object({ kind: z.enum(WALLET_KINDS), number: z.string() })),
})

type CompanyRow = Omit<CompanyProfile, 'bank_accounts' | 'wallets'> & {
  bank_accounts: unknown
  wallets: unknown
}

export function toCompanyProfile(row: CompanyRow): CompanyProfile {
  return { ...row, ...storedLists.parse({ bank_accounts: row.bank_accounts, wallets: row.wallets }) }
}

export async function getCompanyProfile(supabase: Client): Promise<CompanyProfile | null> {
  const { data, error } = await supabase.from('company_profile').select(companyColumns).maybeSingle()
  if (error) throw error
  return data ? toCompanyProfile(data) : null
}
```

`src/features/company/repository.ts`:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure, unexpected } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import { companyColumns, toCompanyProfile } from './queries'
import type { CompanyInput, CompanyProfile } from './schemas'

type Client = SupabaseClient<Database>

// Con RLS, una cuenta sin permiso no actualiza ninguna fila: se informa como NOT_FOUND.
export async function saveCompanyProfileRow(
  supabase: Client,
  input: CompanyInput,
): Promise<ActionResult<CompanyProfile>> {
  const { data, error } = await supabase
    .from('company_profile')
    .update({ ...input, phones: input.phones.map((phone) => phone.number) })
    .eq('id', true)
    .select(companyColumns)
  if (error) {
    console.error('[empresa] guardar:', error.code, error.message)
    return unexpected()
  }
  if (data.length === 0) {
    return failure('NOT_FOUND', 'No encontramos los datos de la empresa. Recarga la página.')
  }
  return { ok: true, data: toCompanyProfile(data[0]) }
}
```

`src/features/company/actions.ts`:

```ts
'use server'

import { invalid } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { saveCompanyProfileRow } from './repository'
import { companyProfileSchema, type CompanyProfile } from './schemas'

export async function saveCompanyProfile(input: unknown): Promise<ActionResult<CompanyProfile>> {
  return withOwner(async ({ supabase }) => {
    const parsed = companyProfileSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return saveCompanyProfileRow(supabase, parsed.data)
  })
}
```

- [ ] **Paso 9: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project integration tests/integration/company-profile.test.ts && pnpm typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Paso 10: Commit**

```bash
git add supabase/migrations/202609300002_company_profile.sql src/lib/supabase/database.types.ts src/features/company/schemas.ts src/features/company/format.ts src/features/company/queries.ts src/features/company/repository.ts src/features/company/actions.ts tests/support/company.ts tests/integration/db.ts tests/unit/company-schemas.test.ts tests/integration/company-profile.test.ts
git commit -m "feat: store company profile for proformas"
```

---

### Tarea 5: Pantalla «Empresa»

**Archivos:**
- Crear: `src/features/company/hooks.ts`, `src/features/company/components/company-screen.tsx`, `src/features/company/components/company-form.tsx`, `src/features/company/components/company-preview.tsx`, `src/app/(private)/company/page.tsx`
- Modificar: `src/components/app-shell.tsx` (menú con «Empresa», también en móvil)
- Crear: `tests/e2e/session.ts`
- Pruebas: `tests/components/company-form.test.tsx`, `tests/e2e/company.spec.ts`

**Interfaces:**
- Consume: `companyProfileSchema`, `CompanyFormValues`, `CompanyInput`, `CompanyProfile`, `WALLET_KINDS`, límites, `walletLabel`, `formatMobile`, `getCompanyProfile`, `saveCompanyProfile` (tarea 4).
- Produce: `companyKeys.profile`, `useCompanyProfile()` (useQuery de `CompanyProfile | null`), `useSaveCompanyProfile()`, `<CompanyForm profile onSubmit onSaved />`, ruta `/company`, `login(page)` para las e2e.

Leer antes `node_modules/next/dist/docs/` sobre páginas y metadata del App Router.

- [ ] **Paso 1: Escribir la prueba del formulario**

`tests/components/company-form.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompanyForm } from '@/features/company/components/company-form'
import type { CompanyInput, CompanyProfile } from '@/features/company/schemas'
import type { ActionResult } from '@/lib/action-result'
import { completeCompany, emptyCompany } from '../support/company'

function renderForm(
  profile: CompanyProfile = emptyCompany,
  result: ActionResult<CompanyProfile> = { ok: true, data: profile },
) {
  const onSubmit = vi.fn(async (_values: CompanyInput) => result)
  const onSaved = vi.fn()
  render(<CompanyForm profile={profile} onSubmit={onSubmit} onSaved={onSaved} />)
  return { onSubmit, onSaved, user: userEvent.setup() }
}

const save = () => screen.getByRole('button', { name: 'Guardar cambios' })

describe('CompanyForm', () => {
  it('marca lo obligatorio y no guarda', async () => {
    const { onSubmit, user } = renderForm()
    await user.click(save())
    expect(await screen.findByText('Escribe la razón social.')).toBeVisible()
    expect(
      screen.getByText('Escribe un RUC válido: 11 dígitos con su dígito verificador.'),
    ).toBeVisible()
    expect(screen.getByText('Escribe la dirección.')).toBeVisible()
    expect(screen.getByLabelText('Teléfono 1')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('guarda los datos normalizados, con cuentas y números de Yape o Plin', async () => {
    const { onSubmit, onSaved, user } = renderForm()
    await user.type(screen.getByLabelText('Razón social'), 'Empresa de Pruebas S.A.C.')
    await user.type(screen.getByLabelText('RUC'), '20000000001')
    await user.type(screen.getByLabelText('Dirección'), 'Av. Prueba 123')
    await user.type(screen.getByLabelText('Teléfono 1'), '066 312345')
    await user.click(screen.getByRole('button', { name: 'Añadir cuenta' }))
    await user.type(screen.getByLabelText('Banco de la cuenta 1'), 'BCP')
    await user.type(screen.getByLabelText('Número de cuenta 1'), '191-1234567-0-12')
    await user.type(screen.getByLabelText('CCI de la cuenta 1'), '002-191-001234567012-54')
    await user.click(screen.getByRole('button', { name: 'Añadir número de Yape o Plin' }))
    const kind = screen.getByRole('radiogroup', { name: 'Tipo del número 1' })
    await user.click(within(kind).getByRole('radio', { name: 'Plin' }))
    await user.type(screen.getByLabelText('Número 1 de Yape o Plin'), '987 654 321')
    await user.click(save())

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        legal_name: 'Empresa de Pruebas S.A.C.',
        trade_name: null,
        phones: [{ number: '066 312345' }],
        default_validity_days: 7,
        bank_accounts: [
          { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254', holder: null },
        ],
        wallets: [{ kind: 'plin', number: '987654321' }],
      }),
    )
  })

  it('Subir y Bajar cambian el orden de las cuentas', async () => {
    const { onSubmit, user } = renderForm({
      ...completeCompany,
      bank_accounts: [
        { bank: 'BCP', account: '1911234567012', cci: '00219100123456701254', holder: null },
        { bank: 'Interbank', account: '2003001234567', cci: '00320000300123456722', holder: null },
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Bajar cuenta 1' }))
    await user.click(save())
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].bank_accounts.map((account) => account.bank)).toEqual([
      'Interbank',
      'BCP',
    ])
  })

  it('pide al menos un teléfono', async () => {
    const { onSubmit, user } = renderForm(completeCompany)
    await user.click(screen.getByRole('button', { name: 'Quitar teléfono 1' }))
    await user.click(save())
    expect(await screen.findByText('Añade al menos un teléfono.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('muestra el error del servidor sin perder lo escrito', async () => {
    const { onSaved, user } = renderForm(completeCompany, {
      ok: false,
      error: { code: 'UNEXPECTED', message: 'No se pudo completar la operación.' },
    })
    await user.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la operación.')
    expect(screen.getByLabelText('Razón social')).toHaveValue('Empresa de Pruebas S.A.C.')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('la vista previa muestra los datos como saldrán en la proforma', () => {
    renderForm({
      ...completeCompany,
      trade_name: 'Pruebas',
      wallets: [{ kind: 'ambos', number: '987654321' }],
    })
    const preview = screen.getByRole('complementary', { name: 'Vista previa' })
    expect(preview).toHaveTextContent('Pruebas')
    expect(preview).toHaveTextContent(/RUC\s*20000000001/)
    expect(preview).toHaveTextContent('Yape / Plin: 987 654 321')
    expect(preview).toHaveTextContent('Validez de la oferta: 7 días.')
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project components tests/components/company-form.test.tsx`
Expected: FAIL, no se puede resolver `@/features/company/components/company-form`.

- [ ] **Paso 3: Implementar el formulario y la vista previa**

`src/features/company/components/company-preview.tsx`:

```tsx
import { digitsOnly } from '@/lib/peru'
import { formatMobile, walletLabel } from '../format'
import type { WalletKind } from '../schemas'

// Lo que se está escribiendo, aún sin validar.
type PreviewValues = {
  legal_name?: string | null
  trade_name?: string | null
  ruc?: string | null
  address?: string | null
  phones?: { number?: string }[]
  email?: string | null
  payment_terms?: string | null
  return_policy?: string | null
  default_validity_days?: unknown
  bank_accounts?: { bank?: string; account?: string; cci?: string; holder?: string | null }[]
  wallets?: { kind?: WalletKind; number?: string }[]
}

const text = (value: string | null | undefined) => value?.trim() ?? ''

function Item({ label, children, wide }: { label: string; children: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold wrap-break-word">{children || '—'}</dd>
    </div>
  )
}

// Cómo saldrán estos datos en la proforma (spec §6.2).
export function CompanyPreview({ values }: { values: PreviewValues }) {
  const legal = text(values.legal_name)
  const trade = text(values.trade_name)
  const phones = (values.phones ?? []).map((phone) => text(phone.number)).filter(Boolean)
  const days = Number(values.default_validity_days)
  const validity = Number.isInteger(days) && days >= 1 && days <= 365 ? days : '—'
  const accounts = values.bank_accounts ?? []
  const wallets = values.wallets ?? []

  return (
    <aside
      aria-label="Vista previa"
      className="grid overflow-hidden rounded-[14px] border bg-card text-sm xl:sticky xl:top-8"
    >
      <div className="bg-black px-5 py-4 text-white">
        <p className="text-base font-bold">{trade || legal || 'Nombre de tu empresa'}</p>
        {trade && legal ? <p className="text-xs text-white/70">{legal}</p> : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 border-b px-5 py-4">
        <Item label="RUC">{text(values.ruc)}</Item>
        <Item label="Teléfono">{phones.join(' / ')}</Item>
        <Item label="Dirección" wide>
          {text(values.address)}
        </Item>
        <Item label="Correo" wide>
          {text(values.email)}
        </Item>
      </dl>
      <div className="grid gap-4 px-5 py-4">
        <div>
          <h3 className="mb-1.5 text-[13px] font-bold">Términos y condiciones</h3>
          <ol className="grid list-decimal gap-0.5 pl-5 text-[13px] text-secondary-foreground">
            <li>Validez de la oferta: {validity} días.</li>
            {text(values.payment_terms) ? <li>{text(values.payment_terms)}</li> : null}
            {text(values.return_policy) ? <li>{text(values.return_policy)}</li> : null}
          </ol>
        </div>
        <div className="grid gap-2 text-[13px]">
          <h3 className="font-bold">Cuentas para el pago</h3>
          {accounts.length === 0 && wallets.length === 0 ? (
            <p className="text-muted-foreground">Aún no hay cuentas ni números.</p>
          ) : null}
          {accounts.map((account, index) => (
            <div key={index}>
              <p className="font-semibold">
                {text(account.bank) || 'Banco'} · Cta. {text(account.account) || '—'}
              </p>
              <p>CCI {digitsOnly(account.cci ?? '') || '—'}</p>
              <p className="text-muted-foreground">
                Titular: {text(account.holder) || legal || 'la razón social'}
              </p>
            </div>
          ))}
          {wallets.map((wallet, index) => (
            <p key={index}>
              {walletLabel(wallet.kind ?? 'yape')}: {formatMobile(digitsOnly(wallet.number ?? '')) || '—'}
            </p>
          ))}
        </div>
      </div>
      <p className="border-t px-5 py-2 text-xs text-muted-foreground">
        Así saldrán estos datos en cada proforma.
      </p>
    </aside>
  )
}
```

`src/features/company/components/company-form.tsx`:

```tsx
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useFieldArray, useForm, useWatch, type FieldError } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ActionResult } from '@/lib/action-result'
import { cn } from '@/lib/utils'
import {
  ACCOUNT_LIMIT,
  companyProfileSchema,
  PHONE_LIMIT,
  WALLET_LIMIT,
  type CompanyFormValues,
  type CompanyInput,
  type CompanyProfile,
} from '../schemas'
import { CompanyPreview } from './company-preview'

const SCALAR_FIELDS = [
  'legal_name',
  'trade_name',
  'ruc',
  'address',
  'email',
  'payment_terms',
  'return_policy',
  'default_validity_days',
] as const

const KIND_OPTIONS = [
  ['yape', 'Yape'],
  ['plin', 'Plin'],
  ['ambos', 'Ambos'],
] as const

function toFormValues(profile: CompanyProfile): CompanyFormValues {
  return {
    legal_name: profile.legal_name ?? '',
    trade_name: profile.trade_name ?? '',
    ruc: profile.ruc ?? '',
    address: profile.address ?? '',
    // El teléfono es obligatorio: al empezar ya hay uno vacío a la vista.
    phones:
      profile.phones.length > 0
        ? profile.phones.map((number) => ({ number }))
        : [{ number: '' }],
    email: profile.email ?? '',
    payment_terms: profile.payment_terms ?? '',
    return_policy: profile.return_policy ?? '',
    default_validity_days: String(profile.default_validity_days),
    bank_accounts: profile.bank_accounts.map((account) => ({
      ...account,
      holder: account.holder ?? '',
    })),
    wallets: profile.wallets,
  }
}

const describedBy = (id: string, error?: FieldError) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
})

function ErrorText({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={`${id}-error`} className="text-xs font-medium text-destructive">
      {error}
    </p>
  ) : null
}

function Field({
  id,
  label,
  error,
  optional,
  className,
  children,
}: {
  id: string
  label: string
  error?: string
  optional?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional ? (
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">Opcional</span>
        ) : null}
      </div>
      {children}
      <ErrorText id={id} error={error} />
    </div>
  )
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-[14px] border bg-card p-5">
      <div className="grid gap-0.5">
        <h2 id={id} className="text-[15px] font-bold">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

type CompanyFormProps = {
  profile: CompanyProfile
  onSubmit: (values: CompanyInput) => Promise<ActionResult<CompanyProfile>>
  onSaved: () => void
}

// Datos de la empresa por secciones, con los errores junto a cada campo (spec §6.2).
export function CompanyForm({ profile, onSubmit, onSaved }: CompanyFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: toFormValues(profile),
  })
  const phones = useFieldArray({ control, name: 'phones' })
  const accounts = useFieldArray({ control, name: 'bank_accounts' })
  const wallets = useFieldArray({ control, name: 'wallets' })
  const live = useWatch({ control })
  // «Añade al menos un teléfono.»: el límite superior no se alcanza porque el botón se oculta.
  const phonesError = errors.phones?.message

  const save = handleSubmit(async (values) => {
    setServerError(null)
    const result = await onSubmit(values)
    if (result.ok) {
      onSaved()
      return
    }
    const fieldErrors = result.error.fieldErrors ?? {}
    const invalid = SCALAR_FIELDS.filter((field) => fieldErrors[field]?.[0])
    invalid.forEach((field, index) =>
      setError(field, { message: fieldErrors[field][0] }, { shouldFocus: index === 0 }),
    )
    if (invalid.length === 0) setServerError(result.error.message)
  })

  return (
    <form
      onSubmit={save}
      noValidate
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"
    >
      <div className="grid gap-5">
        {serverError ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            {serverError}
          </p>
        ) : null}

        <Section id="company-data" title="Datos" description="Como figuran en SUNAT.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="company-legal-name"
              label="Razón social"
              error={errors.legal_name?.message}
              className="sm:col-span-2"
            >
              <Input
                {...describedBy('company-legal-name', errors.legal_name)}
                maxLength={200}
                autoComplete="organization"
                {...register('legal_name')}
              />
            </Field>
            <Field
              id="company-trade-name"
              label="Nombre comercial"
              optional
              error={errors.trade_name?.message}
            >
              <Input
                {...describedBy('company-trade-name', errors.trade_name)}
                maxLength={120}
                {...register('trade_name')}
              />
            </Field>
            <Field id="company-ruc" label="RUC" error={errors.ruc?.message}>
              <Input
                {...describedBy('company-ruc', errors.ruc)}
                inputMode="numeric"
                maxLength={11}
                className="font-mono"
                {...register('ruc')}
              />
            </Field>
          </div>
        </Section>

        <Section id="company-contact" title="Contacto">
          <Field id="company-address" label="Dirección" error={errors.address?.message}>
            <Input
              {...describedBy('company-address', errors.address)}
              maxLength={300}
              autoComplete="street-address"
              {...register('address')}
            />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Teléfonos</legend>
            {phones.fields.map((field, index) => {
              const id = `company-phone-${index}`
              const error = errors.phones?.[index]?.number
              return (
                <div key={field.id} className="grid gap-1">
                  <div className="flex gap-2">
                    <Input
                      {...describedBy(id, error)}
                      aria-label={`Teléfono ${index + 1}`}
                      inputMode="tel"
                      maxLength={20}
                      {...register(`phones.${index}.number`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar teléfono ${index + 1}`}
                      onClick={() => phones.remove(index)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <ErrorText id={id} error={error?.message} />
                </div>
              )
            })}
            {phonesError ? (
              <p className="text-xs font-medium text-destructive">{phonesError}</p>
            ) : null}
            {phones.fields.length < PHONE_LIMIT ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => phones.append({ number: '' })}
              >
                <Plus aria-hidden />
                Añadir teléfono
              </Button>
            ) : null}
          </fieldset>
          <Field id="company-email" label="Correo" optional error={errors.email?.message}>
            <Input
              {...describedBy('company-email', errors.email)}
              type="email"
              maxLength={254}
              autoComplete="email"
              {...register('email')}
            />
          </Field>
        </Section>

        <Section
          id="company-terms"
          title="Condiciones"
          description="Salen en los términos de cada proforma."
        >
          <Field
            id="company-payment-terms"
            label="Condición de pago"
            optional
            error={errors.payment_terms?.message}
          >
            <Textarea
              {...describedBy('company-payment-terms', errors.payment_terms)}
              maxLength={500}
              className="min-h-16 bg-card px-3"
              {...register('payment_terms')}
            />
          </Field>
          <Field
            id="company-return-policy"
            label="Política de devoluciones"
            optional
            error={errors.return_policy?.message}
          >
            <Textarea
              {...describedBy('company-return-policy', errors.return_policy)}
              maxLength={500}
              className="min-h-16 bg-card px-3"
              {...register('return_policy')}
            />
          </Field>
          <Field
            id="company-validity"
            label="Validez de la oferta (días)"
            error={errors.default_validity_days?.message}
            className="max-w-56"
          >
            <Input
              {...describedBy('company-validity', errors.default_validity_days)}
              inputMode="numeric"
              maxLength={3}
              {...register('default_validity_days')}
            />
          </Field>
        </Section>

        <Section
          id="company-payments"
          title="Pagos"
          description="Cuentas y números donde tus clientes pagan."
        >
          <fieldset className="grid gap-3">
            <legend className="mb-1.5 text-sm font-medium">Cuentas bancarias</legend>
            {accounts.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay cuentas.</p>
            ) : null}
            {accounts.fields.map((field, index) => {
              const n = index + 1
              const error = errors.bank_accounts?.[index]
              return (
                <div
                  key={field.id}
                  role="group"
                  aria-label={`Cuenta ${n}`}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                >
                  <Field id={`company-bank-${index}`} label={`Banco de la cuenta ${n}`} error={error?.bank?.message}>
                    <Input
                      {...describedBy(`company-bank-${index}`, error?.bank)}
                      maxLength={60}
                      placeholder="Por ejemplo, BCP"
                      {...register(`bank_accounts.${index}.bank`)}
                    />
                  </Field>
                  <Field id={`company-account-${index}`} label={`Número de cuenta ${n}`} error={error?.account?.message}>
                    <Input
                      {...describedBy(`company-account-${index}`, error?.account)}
                      inputMode="numeric"
                      maxLength={30}
                      className="font-mono"
                      {...register(`bank_accounts.${index}.account`)}
                    />
                  </Field>
                  <Field id={`company-cci-${index}`} label={`CCI de la cuenta ${n}`} error={error?.cci?.message}>
                    <Input
                      {...describedBy(`company-cci-${index}`, error?.cci)}
                      inputMode="numeric"
                      maxLength={30}
                      className="font-mono"
                      {...register(`bank_accounts.${index}.cci`)}
                    />
                  </Field>
                  <Field
                    id={`company-holder-${index}`}
                    label={`Titular de la cuenta ${n}`}
                    optional
                    error={error?.holder?.message}
                  >
                    <Input
                      {...describedBy(`company-holder-${index}`, error?.holder)}
                      maxLength={200}
                      placeholder="La razón social"
                      {...register(`bank_accounts.${index}.holder`)}
                    />
                  </Field>
                  <div className="flex gap-1 sm:col-span-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Subir cuenta ${n}`}
                      disabled={index === 0}
                      onClick={() => accounts.move(index, index - 1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Bajar cuenta ${n}`}
                      disabled={index === accounts.fields.length - 1}
                      onClick={() => accounts.move(index, index + 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Quitar cuenta ${n}`}
                      className="ml-auto hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => accounts.remove(index)}
                    >
                      <Trash2 aria-hidden />
                      Quitar
                    </Button>
                  </div>
                </div>
              )
            })}
            {accounts.fields.length < ACCOUNT_LIMIT ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => accounts.append({ bank: '', account: '', cci: '', holder: '' })}
              >
                <Plus aria-hidden />
                Añadir cuenta
              </Button>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-1.5 text-sm font-medium">Yape y Plin</legend>
            {wallets.fields.map((field, index) => {
              const n = index + 1
              const id = `company-wallet-${index}`
              const error = errors.wallets?.[index]?.number
              return (
                <div key={field.id} className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      role="radiogroup"
                      aria-label={`Tipo del número ${n}`}
                      className="inline-flex rounded-lg border p-0.5"
                    >
                      {KIND_OPTIONS.map(([kind, label]) => (
                        <label
                          key={kind}
                          className="cursor-pointer rounded-md px-2.5 py-1.5 text-sm font-semibold has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                        >
                          <input
                            type="radio"
                            value={kind}
                            className="sr-only"
                            {...register(`wallets.${index}.kind`)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <Input
                      {...describedBy(id, error)}
                      aria-label={`Número ${n} de Yape o Plin`}
                      inputMode="numeric"
                      maxLength={11}
                      placeholder="987 654 321"
                      className="w-40"
                      {...register(`wallets.${index}.number`)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar número ${n}`}
                      onClick={() => wallets.remove(index)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  <ErrorText id={id} error={error?.message} />
                </div>
              )
            })}
            {wallets.fields.length < WALLET_LIMIT ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => wallets.append({ kind: 'yape', number: '' })}
              >
                <Plus aria-hidden />
                Añadir número de Yape o Plin
              </Button>
            ) : null}
          </fieldset>
        </Section>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            Guardar cambios
          </Button>
        </div>
      </div>

      <CompanyPreview values={live} />
    </form>
  )
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project components tests/components/company-form.test.tsx`
Expected: PASS.

- [ ] **Paso 5: Hooks, pantalla, ruta y menú**

`src/features/company/hooks.ts`:

```ts
'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { settle } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/client'
import { saveCompanyProfile } from './actions'
import { getCompanyProfile } from './queries'
import type { CompanyInput } from './schemas'

export const companyKeys = { profile: ['company', 'profile'] as const }

export function useCompanyProfile() {
  return useQuery({
    queryKey: companyKeys.profile,
    queryFn: () => getCompanyProfile(createClient()),
  })
}

// Lo guardado pasa a la caché: la proforma usa los datos nuevos sin volver a pedirlos.
export function useSaveCompanyProfile() {
  const queryClient = useQueryClient()
  return async (input: CompanyInput) => {
    const result = await settle(saveCompanyProfile(input))
    if (result.ok) queryClient.setQueryData(companyKeys.profile, result.data)
    return result
  }
}
```

`src/features/company/components/company-screen.tsx`:

```tsx
'use client'

import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCompanyProfile, useSaveCompanyProfile } from '../hooks'
import { CompanyForm } from './company-form'

export function CompanyScreen() {
  const profile = useCompanyProfile()
  const save = useSaveCompanyProfile()

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em]">Empresa</h1>
        <p className="text-sm text-muted-foreground">
          Los datos de tu empresa que salen en cada proforma.
        </p>
      </div>
      {profile.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : profile.isError || !profile.data ? (
        <div role="alert" className="grid justify-items-start gap-3 rounded-[14px] border bg-card p-5">
          <p className="text-sm">
            No pudimos cargar los datos de tu empresa. Revisa tu conexión e inténtalo de nuevo.
          </p>
          <Button variant="outline" onClick={() => profile.refetch()}>
            <RefreshCw aria-hidden />
            Reintentar
          </Button>
        </div>
      ) : (
        <CompanyForm
          profile={profile.data}
          onSubmit={save}
          onSaved={() => toast.success('Cambios guardados')}
        />
      )}
    </div>
  )
}
```

`src/app/(private)/company/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { CompanyScreen } from '@/features/company/components/company-screen'

export const metadata: Metadata = { title: 'Empresa' }

export default function CompanyPage() {
  return <CompanyScreen />
}
```

`src/components/app-shell.tsx` (archivo completo):

```tsx
'use client'

import { Building2, Package } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Brand } from '@/components/brand'
import { SignOutButton } from '@/features/auth/components/sign-out-button'
import { cn } from '@/lib/utils'

// Productos (con la proforma) y los datos de la empresa que salen en ella.
const navItems = [
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/company', label: 'Empresa', icon: Building2 },
]

function NavLinks({ pathname, compact = false }: { pathname: string; compact?: boolean }) {
  return navItems.map(({ href, label, icon: Icon }) => {
    const active = pathname.startsWith(href)
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex items-center gap-3 rounded-[10px] px-3 font-semibold transition-colors',
          compact ? 'h-9 text-sm' : 'h-10.5',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-sidebar-accent/60',
        )}
      >
        <Icon className="size-4.5" aria-hidden />
        {label}
      </Link>
    )
  })
}

export function AppShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-4 py-3 font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-4 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Ir al contenido
      </a>
      <aside className="hidden border-r border-sidebar-border bg-sidebar px-3.5 py-5 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-8">
        <Brand />
        <nav aria-label="Navegación principal" className="grid gap-1">
          <p className="px-3 pb-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Menú
          </p>
          <NavLinks pathname={pathname} />
        </nav>
        <div className="mt-auto grid gap-1 rounded-xl border bg-background/60 p-2">
          <p className="truncate px-2 pt-1 text-xs text-muted-foreground" title={email}>
            {email}
          </p>
          <SignOutButton />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-card px-4 lg:hidden">
          <Brand />
          <SignOutButton compact />
        </header>
        <nav
          aria-label="Navegación principal"
          className="flex gap-1 border-b bg-card px-4 py-2 lg:hidden"
        >
          <NavLinks pathname={pathname} compact />
        </nav>
        <main id="main" tabIndex={-1} className="px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Paso 6: Escribir la e2e de «Empresa»**

`tests/e2e/session.ts`:

```ts
import { expect, type Page } from '@playwright/test'
import { e2eUsers } from './users'

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(e2eUsers.owner.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(e2eUsers.owner.password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/products/)
}
```

`tests/e2e/company.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { connect, resetCompanyProfile } from '../integration/db'
import { login } from './session'

test.beforeEach(async () => {
  const db = await connect()
  try {
    await resetCompanyProfile(db)
  } finally {
    await db.end()
  }
})

test('completa los datos de la empresa con cuentas, teléfonos y Yape o Plin', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Empresa' }).click()
  await expect(page).toHaveURL(/\/company$/)

  await page.getByLabel('Razón social', { exact: true }).fill('Empresa de Pruebas S.A.C.')
  await page.getByLabel('RUC', { exact: true }).fill('20000000001')
  await page.getByLabel('Dirección', { exact: true }).fill('Av. Prueba 123, Huamanga')
  await page.getByLabel('Teléfono 1').fill('066 312345')
  await page.getByRole('button', { name: 'Añadir teléfono' }).click()
  await page.getByLabel('Teléfono 2').fill('987 654 321')

  await page.getByRole('button', { name: 'Añadir cuenta' }).click()
  await page.getByLabel('Banco de la cuenta 1').fill('BCP')
  await page.getByLabel('Número de cuenta 1').fill('191-1234567-0-12')
  await page.getByLabel('CCI de la cuenta 1').fill('00219100123456701254')
  await page.getByRole('button', { name: 'Añadir cuenta' }).click()
  await page.getByLabel('Banco de la cuenta 2').fill('Interbank')
  await page.getByRole('button', { name: 'Quitar cuenta 2' }).click()

  await page.getByRole('button', { name: 'Añadir número de Yape o Plin' }).click()
  await page.getByRole('radiogroup', { name: 'Tipo del número 1' }).getByText('Plin').click()
  await page.getByLabel('Número 1 de Yape o Plin').fill('987654321')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Razón social', { exact: true })).toHaveValue(
    'Empresa de Pruebas S.A.C.',
  )
  await expect(page.getByLabel('Teléfono 2')).toHaveValue('987 654 321')
  await expect(page.getByLabel('CCI de la cuenta 1')).toHaveValue('00219100123456701254')
  await expect(page.getByLabel('Banco de la cuenta 2')).toHaveCount(0)
  await expect(
    page.getByRole('radiogroup', { name: 'Tipo del número 1' }).getByRole('radio', { name: 'Plin' }),
  ).toBeChecked()
  await expect(page.getByRole('complementary', { name: 'Vista previa' })).toContainText(
    'Plin: 987 654 321',
  )
})
```

- [ ] **Paso 7: Ejecutar las pruebas**

Run: `pnpm vitest run --project components tests/components/company-form.test.tsx && pnpm test:e2e tests/e2e/company.spec.ts`
Expected: PASS en componentes y en e2e (escritorio y móvil).

- [ ] **Paso 8: Commit**

```bash
git add src/features/company/hooks.ts src/features/company/components/company-screen.tsx src/features/company/components/company-form.tsx src/features/company/components/company-preview.tsx "src/app/(private)/company/page.tsx" src/components/app-shell.tsx tests/components/company-form.test.tsx tests/e2e/session.ts tests/e2e/company.spec.ts
git commit -m "feat: add company screen with accounts, phones and wallets"
```

---

### Tarea 6: Numeración correlativa

**Archivos:**
- Crear: `supabase/migrations/202609300003_proforma_number.sql`, `src/features/proforma/number.ts`, `src/features/proforma/actions.ts`
- Pruebas: `tests/unit/proforma-number.test.ts`, `tests/integration/proforma-number.test.ts`
- Regenerar: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Produce: función SQL `public.next_proforma_number() returns bigint` (solo la cuenta autorizada); `formatProformaNumber(value: number): string` («N° 0001»); Server Action `reserveProformaNumber(): Promise<ActionResult<number>>`.

- [ ] **Paso 1: Escribir las pruebas**

`tests/unit/proforma-number.test.ts`:

```ts
import { expect, it } from 'vitest'
import { formatProformaNumber } from '@/features/proforma/number'

it('usa cuatro cifras y más cuando hace falta', () => {
  expect(formatProformaNumber(1)).toBe('N° 0001')
  expect(formatProformaNumber(12345)).toBe('N° 12345')
})
```

`tests/integration/proforma-number.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureUser, publicClient, signedInClient } from '../support/local-supabase'
import { connect } from './db'

const password = 'numeracion-clave-123'
const owner = { email: 'numeracion-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'numeracion-intruso@catalogo.test' }

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  await ensureUser({ password, ...intruder })
  supabase = await signedInClient(owner.email, password)
  outsider = await signedInClient(intruder.email, password)
})

afterAll(async () => {
  await db.end()
})

async function sequenceState() {
  const { rows } = await db.query('select last_value, is_called from public.proforma_number_seq')
  return rows[0]
}

describe('numeración de proformas', () => {
  it('la cuenta autorizada recibe números consecutivos', async () => {
    const first = await supabase.rpc('next_proforma_number')
    const second = await supabase.rpc('next_proforma_number')
    expect(first.error).toBeNull()
    expect(second.data).toBe(Number(first.data) + 1)
  })

  it('una cuenta sin autorización no obtiene número ni gasta la secuencia', async () => {
    const before = await sequenceState()
    const { data, error } = await outsider.rpc('next_proforma_number')
    expect(data).toBeNull()
    expect(error?.code).toBe('42501')
    expect(await sequenceState()).toEqual(before)
  })

  it('sin sesión no se puede pedir un número', async () => {
    const { error } = await publicClient().rpc('next_proforma_number')
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `pnpm vitest run --project unit tests/unit/proforma-number.test.ts; pnpm vitest run --project integration tests/integration/proforma-number.test.ts`
Expected: FAIL en ambos: falta `@/features/proforma/number` y la función `next_proforma_number` no existe.

- [ ] **Paso 3: Implementar la migración, el formato y la acción**

`supabase/migrations/202609300003_proforma_number.sql`:

```sql
-- Numeración correlativa de proformas (spec §6.3). Las proformas no se guardan: solo el último
-- número usado. SECURITY DEFINER para usar la secuencia sin dar permisos sobre ella; la propia
-- función comprueba la marca de la cuenta autorizada.
create sequence public.proforma_number_seq;

create function public.next_proforma_number()
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'catalog_access') is distinct from 'owner' then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return nextval('public.proforma_number_seq');
end;
$$;

revoke all on sequence public.proforma_number_seq from public, anon, authenticated;
revoke execute on function public.next_proforma_number() from public, anon;
grant execute on function public.next_proforma_number() to authenticated;
```

Run: `pnpm exec supabase migration up --local && pnpm db:types`

`src/features/proforma/number.ts`:

```ts
// N° 0001: cuatro cifras con ceros a la izquierda, y más cuando haga falta (spec §6.3).
export const formatProformaNumber = (value: number) => `N° ${String(value).padStart(4, '0')}`
```

`src/features/proforma/actions.ts`:

```ts
'use server'

import { unexpected } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'

// El número se pide al pulsar «Generar» (spec §6.3). Un número que no se usa deja un hueco.
export async function reserveProformaNumber(): Promise<ActionResult<number>> {
  return withOwner(async ({ supabase }) => {
    const { data, error } = await supabase.rpc('next_proforma_number')
    if (error) {
      console.error('[proforma] numeración:', error.code, error.message)
      return unexpected()
    }
    return { ok: true, data }
  })
}
```

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `pnpm vitest run --project unit tests/unit/proforma-number.test.ts && pnpm vitest run --project integration tests/integration/proforma-number.test.ts && pnpm typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations/202609300003_proforma_number.sql src/lib/supabase/database.types.ts src/features/proforma/number.ts src/features/proforma/actions.ts tests/unit/proforma-number.test.ts tests/integration/proforma-number.test.ts
git commit -m "feat: number proformas with an owner-only sequence"
```

---

### Tarea 7: Consulta de RUC

Proveedor elegido: **Decolecta** (`GET https://api.decolecta.com/v1/sunat/ruc?numero=<ruc>`, cabecera `Authorization: Bearer <token>`; 1 000 consultas al mes gratis; devuelve `razon_social`, `numero_documento`, `estado`, `condicion`, `direccion`, `distrito`, `provincia`, `departamento`; responde 422 si el RUC no es válido). Alternativa si hiciera falta: Factiliza (100 gratis). El cambio de proveedor es una implementación nueva de `RucProvider`.

**Archivos:**
- Crear: `src/features/proforma/ruc.ts`, `src/features/proforma/ruc-provider.ts`
- Modificar: `src/features/proforma/actions.ts` (añadir `lookupRuc`)
- Prueba: `tests/unit/ruc-provider.test.ts`

**Interfaces:**
- Consume: `isValidRuc` (tarea 2), `withOwner`, `invalid`.
- Produce: `RucCompany = { ruc; legalName; address: string | null; status; condition }`, `RucLookupResult = { kind: 'found'; company } | { kind: 'not-found' } | { kind: 'unavailable' }`, `isActiveTaxpayer(company): boolean`.
- Produce (solo servidor): `RucProvider = { lookup(ruc, signal): Promise<RucLookupResult> }`, `decolectaProvider(token, fetcher?)`, `stubRucProvider`, `getRucProvider(env?)`.
- Produce: Server Action `lookupRuc(ruc: unknown): Promise<ActionResult<RucLookupResult>>`.

- [ ] **Paso 1: Escribir la prueba**

`tests/unit/ruc-provider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { isActiveTaxpayer } from '@/features/proforma/ruc'
import {
  decolectaProvider,
  getRucProvider,
  stubRucProvider,
} from '@/features/proforma/ruc-provider'

const signal = new AbortController().signal
const sunat = {
  razon_social: 'EMPRESA DE PRUEBA S.A.C.',
  numero_documento: '20000000001',
  estado: 'ACTIVO',
  condicion: 'HABIDO',
  direccion: 'AV. PRUEBA 123',
  distrito: 'AYACUCHO',
  provincia: 'HUAMANGA',
  departamento: 'AYACUCHO',
}
const respond = (status: number, body: unknown = {}) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))

describe('decolectaProvider', () => {
  it('devuelve razón social, dirección completa, estado y condición', async () => {
    const fetcher = respond(200, sunat)
    const result = await decolectaProvider('clave', fetcher).lookup('20000000001', signal)
    expect(result).toEqual({
      kind: 'found',
      company: {
        ruc: '20000000001',
        legalName: 'EMPRESA DE PRUEBA S.A.C.',
        address: 'AV. PRUEBA 123, AYACUCHO, HUAMANGA, AYACUCHO',
        status: 'ACTIVO',
        condition: 'HABIDO',
      },
    })
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.decolecta.com/v1/sunat/ruc?numero=20000000001')
    expect(init?.headers).toEqual({ Authorization: 'Bearer clave' })
  })

  it('omite las partes de la dirección que SUNAT marca con «-»', async () => {
    const fetcher = respond(200, { ...sunat, direccion: '-', distrito: '-', provincia: '', departamento: null })
    const result = await decolectaProvider('clave', fetcher).lookup('20000000001', signal)
    expect(result).toMatchObject({ kind: 'found', company: { address: null } })
  })

  it.each([
    [404, 'not-found'],
    [422, 'not-found'],
    [400, 'unavailable'],
    [500, 'unavailable'],
  ])('HTTP %i → %s', async (status, kind) => {
    expect(await decolectaProvider('clave', respond(status)).lookup('20000000001', signal)).toEqual({
      kind,
    })
  })

  it('una respuesta con otra forma, un corte o el tiempo agotado → no disponible', async () => {
    const odd = respond(200, { mensaje: 'otra cosa' })
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    const slow = vi.fn<typeof fetch>(async () => {
      throw new DOMException('The operation was aborted.', 'TimeoutError')
    })
    for (const fetcher of [odd, offline, slow]) {
      expect(await decolectaProvider('clave', fetcher).lookup('20000000001', signal)).toEqual({
        kind: 'unavailable',
      })
    }
  })
})

describe('getRucProvider', () => {
  it('el proveedor de prueba solo se usa fuera de producción', async () => {
    expect(getRucProvider({ RUC_PROVIDER: 'stub', NODE_ENV: 'development' })).toBe(stubRucProvider)
    const production = getRucProvider({ RUC_PROVIDER: 'stub', NODE_ENV: 'production' })
    expect(production).not.toBe(stubRucProvider)
    expect(await production.lookup('20000000001', signal)).toEqual({ kind: 'unavailable' })
  })

  it('sin clave de Decolecta, la consulta no está disponible', async () => {
    expect(await getRucProvider({}).lookup('20000000001', signal)).toEqual({ kind: 'unavailable' })
  })

  it('los RUC de prueba cubren activo, de baja, sin servicio y no encontrado', async () => {
    const kinds = await Promise.all(
      ['20000000001', '20000000010', '20000000036', '20000000028'].map((ruc) =>
        stubRucProvider.lookup(ruc, signal),
      ),
    )
    expect(kinds.map((result) => result.kind)).toEqual([
      'found',
      'found',
      'unavailable',
      'not-found',
    ])
  })
})

describe('isActiveTaxpayer', () => {
  it('solo ACTIVO y HABIDO es un contribuyente activo', () => {
    const company = { ruc: '20000000001', legalName: 'X', address: null, status: 'ACTIVO', condition: 'HABIDO' }
    expect(isActiveTaxpayer(company)).toBe(true)
    expect(isActiveTaxpayer({ ...company, condition: 'NO HABIDO' })).toBe(false)
    expect(isActiveTaxpayer({ ...company, status: 'BAJA DE OFICIO' })).toBe(false)
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/ruc-provider.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/ruc`.

- [ ] **Paso 3: Implementar tipos, proveedores y la acción**

`src/features/proforma/ruc.ts`:

```ts
// Resultado de la consulta de RUC (spec §7). Se importa en el cliente: sin secretos.
export type RucCompany = {
  ruc: string
  legalName: string
  address: string | null
  status: string // ACTIVO, BAJA DE OFICIO…
  condition: string // HABIDO, NO HABIDO…
}

export type RucLookupResult =
  | { kind: 'found'; company: RucCompany }
  | { kind: 'not-found' }
  | { kind: 'unavailable' }

// Aviso no bloqueante si SUNAT no lo tiene activo y habido (spec §4.5).
export const isActiveTaxpayer = (company: RucCompany) =>
  company.status === 'ACTIVO' && company.condition === 'HABIDO'
```

`src/features/proforma/ruc-provider.ts`:

```ts
import 'server-only'
import { z } from 'zod'
import type { RucLookupResult } from './ruc'

// Proveedor intercambiable (spec §7): Decolecta en producción y uno de prueba en las e2e.
export type RucProvider = {
  lookup: (ruc: string, signal: AbortSignal) => Promise<RucLookupResult>
}

const decolectaSchema = z.object({
  razon_social: z.string(),
  numero_documento: z.string(),
  estado: z.string(),
  condicion: z.string(),
  direccion: z.string().nullish(),
  distrito: z.string().nullish(),
  provincia: z.string().nullish(),
  departamento: z.string().nullish(),
})

function present(value: string | null | undefined) {
  const text = value?.trim()
  return text && text !== '-' ? text : null
}

export function decolectaProvider(token: string, fetcher: typeof fetch = fetch): RucProvider {
  return {
    async lookup(ruc, signal) {
      try {
        const response = await fetcher(`https://api.decolecta.com/v1/sunat/ruc?numero=${ruc}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
          cache: 'no-store',
        })
        if (response.status === 404 || response.status === 422) return { kind: 'not-found' }
        if (!response.ok) return { kind: 'unavailable' }
        const data = decolectaSchema.parse(await response.json())
        const address = [data.direccion, data.distrito, data.provincia, data.departamento]
          .map(present)
          .filter(Boolean)
          .join(', ')
        return {
          kind: 'found',
          company: {
            ruc: data.numero_documento,
            legalName: data.razon_social,
            address: address || null,
            status: data.estado,
            condition: data.condicion,
          },
        }
      } catch (error) {
        // Corte, tiempo agotado o respuesta inesperada: se escribe a mano. Nunca se registra la clave.
        console.error('[proforma] consulta de RUC:', error instanceof Error ? error.name : error)
        return { kind: 'unavailable' }
      }
    },
  }
}

const stubCompany = (
  ruc: string,
  legalName: string,
  status = 'ACTIVO',
  condition = 'HABIDO',
): RucLookupResult => ({
  kind: 'found',
  company: { ruc, legalName, address: 'AV. PRUEBA 123, HUAMANGA, HUAMANGA, AYACUCHO', status, condition },
})

// Solo para pruebas automáticas y desarrollo (RUC_PROVIDER=stub). Cualquier otro RUC: no encontrado.
const STUB_RESULTS: Record<string, RucLookupResult> = {
  '20000000001': stubCompany('20000000001', 'EMPRESA DE PRUEBA S.A.C.'),
  '20000000010': stubCompany('20000000010', 'EMPRESA INACTIVA S.R.L.', 'BAJA DE OFICIO', 'NO HABIDO'),
  '20000000036': { kind: 'unavailable' },
}

export const stubRucProvider: RucProvider = {
  lookup: async (ruc) => STUB_RESULTS[ruc] ?? { kind: 'not-found' },
}

const unavailableProvider: RucProvider = { lookup: async () => ({ kind: 'unavailable' }) }

export function getRucProvider(env: Record<string, string | undefined> = process.env): RucProvider {
  if (env.RUC_PROVIDER === 'stub' && env.NODE_ENV !== 'production') return stubRucProvider
  return env.DECOLECTA_TOKEN ? decolectaProvider(env.DECOLECTA_TOKEN) : unavailableProvider
}
```

`src/features/proforma/actions.ts` (archivo completo):

```ts
'use server'

import { z } from 'zod'
import { invalid, unexpected } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { isValidRuc } from '@/lib/peru'
import type { RucLookupResult } from './ruc'
import { getRucProvider } from './ruc-provider'

// El número se pide al pulsar «Generar» (spec §6.3). Un número que no se usa deja un hueco.
export async function reserveProformaNumber(): Promise<ActionResult<number>> {
  return withOwner(async ({ supabase }) => {
    const { data, error } = await supabase.rpc('next_proforma_number')
    if (error) {
      console.error('[proforma] numeración:', error.code, error.message)
      return unexpected()
    }
    return { ok: true, data }
  })
}

const rucSchema = z.string().refine(isValidRuc, 'El RUC no es válido.')

// Consulta a SUNAT con la clave solo de servidor (spec §7), con unos 5 segundos como máximo.
export async function lookupRuc(ruc: unknown): Promise<ActionResult<RucLookupResult>> {
  return withOwner(async () => {
    const parsed = rucSchema.safeParse(ruc)
    if (!parsed.success) return invalid(parsed.error)
    const result = await getRucProvider().lookup(parsed.data, AbortSignal.timeout(5000))
    return { ok: true, data: result }
  })
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/ruc-provider.test.ts && pnpm typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Paso 5: Commit**

```bash
git add src/features/proforma/ruc.ts src/features/proforma/ruc-provider.ts src/features/proforma/actions.ts tests/unit/ruc-provider.test.ts
git commit -m "feat: look up RUC in SUNAT through a server-only provider"
```

---

### Tarea 8: Proforma en curso y su almacén

**Archivos:**
- Crear: `src/features/proforma/draft.ts`, `src/features/proforma/store.tsx`, `tests/support/proforma.ts`
- Pruebas: `tests/unit/proforma-draft.test.ts`, `tests/components/proforma-store.test.tsx`

**Interfaces:**
- Consume: `MAX_QUANTITY` (tarea 1); `readDraft`, `saveDraft` (`src/lib/drafts.ts`); `ProductListItem`.
- Produce (`draft.ts`): `draftSchema`, `ProformaLine`, `ProformaDraft`, `ProformaClient`, `EMPTY_DRAFT`, `findLine(draft, productId)`, `addProduct(draft, product)`, `setQuantity(draft, productId, quantity)`, `setUnitPrice(draft, productId, text)`, `restorePrice(draft, productId)`, `applyCatalogPrice(draft, productId, price)`, `removeLine(draft, productId)`, `restoreLine(draft, line, index)`, `patchClient(draft, patch)`, `patchConditions(draft, patch)`, `setNumber(draft, number)`, `unitCount(draft)`, `unitsText(quantity)` («1 unidad», «2 unidades»), `PROFORMA_DRAFT_KEY = 'proforma'`.
- Produce (`store.tsx`): `UNDO_MS = 5000`, `<ProformaProvider>`, `useProforma(): { draft, update, announce }`, `useRemoveLine(): (productId) => void`, `useEmptyProforma(): () => void`.
- Produce (pruebas): `line(overrides)`, `e1Lines`, `seedProforma(partialDraft)`, `completeCompany` reexportado.

- [ ] **Paso 1: Escribir la prueba de las funciones del borrador**

`tests/unit/proforma-draft.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  addProduct,
  applyCatalogPrice,
  draftSchema,
  EMPTY_DRAFT,
  patchClient,
  removeLine,
  restoreLine,
  restorePrice,
  setQuantity,
  setUnitPrice,
  unitCount,
} from '@/features/proforma/draft'

const laptop = {
  id: 'p1',
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: 'Ligera',
  unit_price: '2590.00',
}
const printer = { id: 'p2', code: 'IMP-001', name: 'Impresora láser', description: null, unit_price: '890.00' }

describe('proforma en curso', () => {
  it('añadir copia los datos del producto y añadir otra vez suma una unidad', () => {
    const draft = addProduct(addProduct(EMPTY_DRAFT, laptop), laptop)
    expect(draft.lines).toEqual([
      {
        productId: 'p1',
        code: 'LAP-001',
        name: 'Laptop de 14 pulgadas',
        description: 'Ligera',
        catalogPrice: '2590.00',
        unitPrice: '2590.00',
        quantity: 2,
      },
    ])
  })

  it('no pasa de 9 999 unidades', () => {
    const full = setQuantity(addProduct(EMPTY_DRAFT, laptop), 'p1', 9999)
    expect(addProduct(full, laptop).lines[0].quantity).toBe(9999)
  })

  it('Restaurar vuelve al precio del catálogo y Actualizar adopta el nuevo', () => {
    const edited = setUnitPrice(addProduct(EMPTY_DRAFT, laptop), 'p1', '2400')
    expect(restorePrice(edited, 'p1').lines[0].unitPrice).toBe('2590.00')
    expect(applyCatalogPrice(edited, 'p1', '2490.00').lines[0]).toMatchObject({
      catalogPrice: '2490.00',
      unitPrice: '2490.00',
    })
  })

  it('Deshacer devuelve la línea quitada a su sitio, sin duplicarla', () => {
    const draft = addProduct(addProduct(EMPTY_DRAFT, laptop), printer)
    const removed = removeLine(draft, 'p1')
    expect(restoreLine(removed, draft.lines[0], 0).lines.map((line) => line.productId)).toEqual([
      'p1',
      'p2',
    ])
    expect(restoreLine(addProduct(removed, laptop), draft.lines[0], 0).lines).toHaveLength(2)
  })

  it('cuenta las unidades y cambia al cliente sin tocar las líneas', () => {
    const draft = patchClient(addProduct(addProduct(EMPTY_DRAFT, laptop), laptop), {
      name: 'Cliente',
    })
    expect(unitCount(draft)).toBe(2)
    expect(draft.client).toMatchObject({ name: 'Cliente', document: '' })
    expect(draft.lines).toHaveLength(1)
  })

  it('el esquema acepta la proforma vacía y rechaza datos incompletos', () => {
    expect(draftSchema.safeParse(EMPTY_DRAFT).success).toBe(true)
    expect(draftSchema.safeParse({ lines: [{ precio: 1 }] }).success).toBe(false)
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/proforma-draft.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/draft`.

- [ ] **Paso 3: Implementar `draft.ts`**

`src/features/proforma/draft.ts`:

```ts
import { z } from 'zod'
import type { ProductListItem } from '@/features/catalog/types'
import { MAX_QUANTITY } from './totals'

// Proforma en curso (spec §6.1): una sola, en este navegador. Los datos del producto se copian al
// añadirlo; el catálogo nunca se modifica desde aquí.
const lineSchema = z.object({
  productId: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  catalogPrice: z.string(), // precio del catálogo al añadirlo
  unitPrice: z.string(), // precio de la proforma, tal como se escribe
  quantity: z.number().int().nonnegative(),
})

export const draftSchema = z.object({
  lines: z.array(lineSchema),
  client: z.object({
    name: z.string(),
    document: z.string(),
    phone: z.string(),
    address: z.string(),
    deliveryTime: z.string(),
  }),
  validityDays: z.string(), // vacío: la validez por defecto de la empresa
  discountPercent: z.string(),
  shipping: z.string(),
  number: z.number().int().positive().nullable(), // asignado al generar
  updatedAt: z.string(),
})

export type ProformaLine = z.infer<typeof lineSchema>
export type ProformaDraft = z.infer<typeof draftSchema>
export type ProformaClient = ProformaDraft['client']
type Conditions = Pick<ProformaDraft, 'validityDays' | 'discountPercent' | 'shipping'>
type ProductData = Pick<ProductListItem, 'id' | 'code' | 'name' | 'description' | 'unit_price'>

export const EMPTY_DRAFT: ProformaDraft = {
  lines: [],
  client: { name: '', document: '', phone: '', address: '', deliveryTime: '' },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  number: null,
  updatedAt: '',
}

export const findLine = (draft: ProformaDraft, productId: string) =>
  draft.lines.find((line) => line.productId === productId)

function mapLine(
  draft: ProformaDraft,
  productId: string,
  change: (line: ProformaLine) => ProformaLine,
): ProformaDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) => (line.productId === productId ? change(line) : line)),
  }
}

// Añadir un producto que ya está suma una unidad, hasta el máximo.
export function addProduct(draft: ProformaDraft, product: ProductData): ProformaDraft {
  if (findLine(draft, product.id)) {
    return mapLine(draft, product.id, (line) => ({
      ...line,
      quantity: Math.min(line.quantity + 1, MAX_QUANTITY),
    }))
  }
  const line: ProformaLine = {
    productId: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    catalogPrice: product.unit_price,
    unitPrice: product.unit_price,
    quantity: 1,
  }
  return { ...draft, lines: [...draft.lines, line] }
}

export const setQuantity = (draft: ProformaDraft, productId: string, quantity: number) =>
  mapLine(draft, productId, (line) => ({ ...line, quantity }))

export const setUnitPrice = (draft: ProformaDraft, productId: string, unitPrice: string) =>
  mapLine(draft, productId, (line) => ({ ...line, unitPrice }))

export const restorePrice = (draft: ProformaDraft, productId: string) =>
  mapLine(draft, productId, (line) => ({ ...line, unitPrice: line.catalogPrice }))

// «Actualizar» (spec §4.5): el precio actual del catálogo pasa a ser el de la línea.
export const applyCatalogPrice = (draft: ProformaDraft, productId: string, price: string) =>
  mapLine(draft, productId, (line) => ({ ...line, catalogPrice: price, unitPrice: price }))

export const removeLine = (draft: ProformaDraft, productId: string): ProformaDraft => ({
  ...draft,
  lines: draft.lines.filter((line) => line.productId !== productId),
})

// «Deshacer» devuelve la línea a su sitio, salvo que se haya vuelto a añadir mientras tanto.
export function restoreLine(draft: ProformaDraft, line: ProformaLine, index: number): ProformaDraft {
  if (findLine(draft, line.productId)) return draft
  const lines = [...draft.lines]
  lines.splice(Math.min(index, lines.length), 0, line)
  return { ...draft, lines }
}

export const patchClient = (draft: ProformaDraft, patch: Partial<ProformaClient>): ProformaDraft => ({
  ...draft,
  client: { ...draft.client, ...patch },
})

export const patchConditions = (draft: ProformaDraft, patch: Partial<Conditions>): ProformaDraft => ({
  ...draft,
  ...patch,
})

export const setNumber = (draft: ProformaDraft, number: number): ProformaDraft => ({
  ...draft,
  number,
})

export const unitCount = (draft: ProformaDraft) =>
  draft.lines.reduce((sum, line) => sum + line.quantity, 0)

export const unitsText = (quantity: number) =>
  `${quantity} ${quantity === 1 ? 'unidad' : 'unidades'}`

// Clave del borrador en el navegador (prefijo de src/lib/drafts.ts, que se borra al cerrar sesión).
export const PROFORMA_DRAFT_KEY = 'proforma'
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/proforma-draft.test.ts`
Expected: PASS.

- [ ] **Paso 5: Escribir la prueba del almacén**

`tests/support/proforma.ts`:

```ts
import {
  EMPTY_DRAFT,
  PROFORMA_DRAFT_KEY,
  type ProformaDraft,
  type ProformaLine,
} from '@/features/proforma/draft'
import { saveDraft } from '@/lib/drafts'

export { completeCompany } from './company'

export const line = (overrides: Partial<ProformaLine> = {}): ProformaLine => ({
  productId: '8b3e4c9a-5d6f-4e7a-8b1c-2d3e4f5a6b7c',
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  catalogPrice: '2590.00',
  unitPrice: '2590.00',
  quantity: 1,
  ...overrides,
})

// Las líneas del ejemplo E1 de la spec (§5.3); la impresora lleva un precio especial.
export const e1Lines = [
  line({ quantity: 2 }),
  line({
    productId: 'impresora',
    code: 'IMP-001',
    name: 'Impresora láser',
    catalogPrice: '890.00',
    unitPrice: '850',
  }),
  line({
    productId: 'computadora',
    code: 'CMP-001',
    name: 'Computadora de escritorio',
    catalogPrice: '2490.00',
    unitPrice: '2490.00',
  }),
]

// Deja una proforma en el navegador antes de montar la pantalla.
export function seedProforma(draft: Partial<ProformaDraft>) {
  saveDraft(PROFORMA_DRAFT_KEY, { ...EMPTY_DRAFT, ...draft })
}
```

`tests/components/proforma-store.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { addProduct } from '@/features/proforma/draft'
import { ProformaProvider, useProforma } from '@/features/proforma/store'
import { clearAllDrafts } from '@/lib/drafts'

const laptop = {
  id: 'p1',
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  unit_price: '2590.00',
}

function Probe() {
  const { draft, update } = useProforma()
  return (
    <div>
      <p>Líneas: {draft.lines.length}</p>
      <button type="button" onClick={() => update((current) => addProduct(current, laptop))}>
        Añadir
      </button>
    </div>
  )
}

const renderProbe = () =>
  render(
    <ProformaProvider>
      <Probe />
    </ProformaProvider>,
  )

describe('proforma guardada en el navegador', () => {
  it('conserva lo añadido al volver a abrir la pantalla', async () => {
    renderProbe()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Añadir' }))
    expect(screen.getByText('Líneas: 1')).toBeVisible()
    cleanup()
    renderProbe()
    expect(screen.getByText('Líneas: 1')).toBeVisible()
  })

  it('tras cerrar sesión (borradores borrados) empieza vacía', async () => {
    renderProbe()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Añadir' }))
    cleanup()
    clearAllDrafts()
    renderProbe()
    expect(screen.getByText('Líneas: 0')).toBeVisible()
  })

  it('ignora un borrador dañado o de otra versión sin romper la pantalla', () => {
    localStorage.setItem('catalogo:borrador:proforma', '{"lines":[{"precio":1}]}')
    renderProbe()
    expect(screen.getByText('Líneas: 0')).toBeVisible()
  })
})
```

- [ ] **Paso 6: Ejecutar y ver que falla**

Run: `pnpm vitest run --project components tests/components/proforma-store.test.tsx`
Expected: FAIL, no se puede resolver `@/features/proforma/store`.

- [ ] **Paso 7: Implementar el almacén**

`src/features/proforma/store.tsx`:

```tsx
'use client'

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { toast } from 'sonner'
import { readDraft, saveDraft } from '@/lib/drafts'
import {
  draftSchema,
  EMPTY_DRAFT,
  PROFORMA_DRAFT_KEY,
  removeLine,
  restoreLine,
  type ProformaDraft,
} from './draft'

// «Deshacer» dura 5 segundos (spec §4.2).
export const UNDO_MS = 5000

type Store = {
  subscribe: (listener: () => void) => () => void
  getDraft: () => ProformaDraft
  getMessage: () => string
  update: (change: (draft: ProformaDraft) => ProformaDraft) => void
  announce: (message: string) => void
}

// Un almacén por pantalla: al volver a Productos, o tras cerrar sesión (que borra los borradores),
// se vuelve a leer el navegador. En el servidor y al hidratar se usa la proforma vacía.
function createStore(): Store {
  let draft: ProformaDraft | null = null
  let message = ''
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((listener) => listener())
  const getDraft = () => (draft ??= readDraft(PROFORMA_DRAFT_KEY, draftSchema) ?? EMPTY_DRAFT)
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getDraft,
    getMessage: () => message,
    update(change) {
      draft = { ...change(getDraft()), updatedAt: new Date().toISOString() }
      saveDraft(PROFORMA_DRAFT_KEY, draft)
      notify()
    },
    announce(text) {
      message = text
      notify()
    },
  }
}

const StoreContext = createContext<Store | null>(null)
const serverDraft = () => EMPTY_DRAFT
const serverMessage = () => ''

export function ProformaProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore)
  const message = useSyncExternalStore(store.subscribe, store.getMessage, serverMessage)
  return (
    <StoreContext value={store}>
      {children}
      {/* Aviso para lectores de pantalla al añadir o quitar productos (spec §9). */}
      <p role="status" className="sr-only">
        {message}
      </p>
    </StoreContext>
  )
}

function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('Falta <ProformaProvider>.')
  return store
}

export function useProforma() {
  const store = useStore()
  const draft = useSyncExternalStore(store.subscribe, store.getDraft, serverDraft)
  return { draft, update: store.update, announce: store.announce }
}

// Quitar una línea no pide confirmación: avisa con «Deshacer» (spec §4.2).
export function useRemoveLine() {
  const { draft, update } = useProforma()
  return (productId: string) => {
    const index = draft.lines.findIndex((line) => line.productId === productId)
    if (index === -1) return
    const line = draft.lines[index]
    update((current) => removeLine(current, productId))
    toast(`Quitaste ${line.name}`, {
      duration: UNDO_MS,
      action: {
        label: 'Deshacer',
        onClick: () => update((current) => restoreLine(current, line, index)),
      },
    })
  }
}

// «Vaciar» también se puede deshacer; recupera la proforma tal como estaba.
export function useEmptyProforma() {
  const { draft, update } = useProforma()
  return () => {
    const previous = draft
    update(() => EMPTY_DRAFT)
    toast('Vaciaste la proforma', {
      duration: UNDO_MS,
      action: { label: 'Deshacer', onClick: () => update(() => previous) },
    })
  }
}
```

- [ ] **Paso 8: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/proforma-draft.test.ts && pnpm vitest run --project components tests/components/proforma-store.test.tsx`
Expected: PASS.

- [ ] **Paso 9: Commit**

```bash
git add src/features/proforma/draft.ts src/features/proforma/store.tsx tests/support/proforma.ts tests/unit/proforma-draft.test.ts tests/components/proforma-store.test.tsx
git commit -m "feat: keep the proforma draft in the browser"
```

---

### Tarea 9: «Añadir» en la lista, Enter y «/»

**Archivos:**
- Crear: `src/features/proforma/components/proforma-control.tsx`, `src/features/proforma/hooks.ts`
- Modificar: `src/features/catalog/products/components/product-list.tsx`, `src/features/catalog/products/components/product-filters.tsx`, `src/features/catalog/components/catalog-screen.tsx`
- Prueba: `tests/components/proforma-control.test.tsx`

**Interfaces:**
- Consume: `useProforma`, `useRemoveLine`, `ProformaProvider` (tarea 8); `addProduct`, `findLine`, `setQuantity`, `unitsText`; `MAX_QUANTITY`; `listProducts`, `catalogKeys`, `normalizeSearch` (catálogo).
- Produce: `<ProformaControl product />`, `useAddSingleResult(): (filters: ProductFilters) => Promise<void>`, `<ProductFilters onSearchEnter? />`. `CatalogScreen` envuelve la pantalla con `ProformaProvider` y activa «/».

- [ ] **Paso 1: Escribir la prueba del control**

`tests/components/proforma-control.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it } from 'vitest'
import type { ProductListItem } from '@/features/catalog/types'
import { ProformaControl } from '@/features/proforma/components/proforma-control'
import { ProformaProvider } from '@/features/proforma/store'
import { line, seedProforma } from '../support/proforma'

const laptop: ProductListItem = {
  id: line().productId,
  code: 'LAP-001',
  name: 'Laptop de 14 pulgadas',
  description: null,
  category_id: '7a2d3b8f-4c5e-4d6f-9a0b-1c2d3e4f5a6b',
  unit_price: '2590.00',
  created_at: '2026-09-30T00:00:00Z',
  updated_at: '2026-09-30T00:00:00Z',
  category_name: 'Laptops',
}

function renderControl() {
  render(
    <ProformaProvider>
      <ProformaControl product={laptop} />
      <Toaster />
    </ProformaProvider>,
  )
  return userEvent.setup()
}

const quantity = () =>
  screen.getByRole('group', { name: 'Cantidad de Laptop de 14 pulgadas en la proforma' })

describe('ProformaControl', () => {
  it('Añadir pasa a [− n +] y lo anuncia', async () => {
    const user = renderControl()
    await user.click(
      screen.getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' }),
    )
    expect(quantity()).toHaveTextContent('1')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Laptop de 14 pulgadas: 1 unidad en la proforma',
    )
    await user.click(screen.getByRole('button', { name: 'Una unidad más de Laptop de 14 pulgadas' }))
    expect(quantity()).toHaveTextContent('2')
    expect(screen.getByRole('status')).toHaveTextContent('2 unidades en la proforma')
    await user.click(
      screen.getByRole('button', { name: 'Una unidad menos de Laptop de 14 pulgadas' }),
    )
    expect(quantity()).toHaveTextContent('1')
  })

  it('bajar de 1 lo quita y «Deshacer» lo devuelve', async () => {
    const user = renderControl()
    await user.click(
      screen.getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Quitar Laptop de 14 pulgadas de la proforma' }),
    )
    expect(
      screen.getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' }),
    ).toBeVisible()
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(quantity()).toHaveTextContent('1')
  })

  it('no pasa de 9 999 unidades', () => {
    seedProforma({ lines: [line({ quantity: 9999 })] })
    renderControl()
    expect(
      screen.getByRole('button', { name: 'Una unidad más de Laptop de 14 pulgadas' }),
    ).toBeDisabled()
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project components tests/components/proforma-control.test.tsx`
Expected: FAIL, no se puede resolver `@/features/proforma/components/proforma-control`.

- [ ] **Paso 3: Implementar el control**

`src/features/proforma/components/proforma-control.tsx`:

```tsx
'use client'

import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProductListItem } from '@/features/catalog/types'
import { addProduct, findLine, setQuantity, unitsText } from '../draft'
import { useProforma, useRemoveLine } from '../store'
import { MAX_QUANTITY } from '../totals'

// «Añadir» y luego [− n +] en cada producto de la lista (spec §4.1). Bajar de 1 lo quita.
export function ProformaControl({ product }: { product: ProductListItem }) {
  const { draft, update, announce } = useProforma()
  const removeLine = useRemoveLine()
  const line = findLine(draft, product.id)

  function add() {
    update((current) => addProduct(current, product))
    const next = Math.min((line?.quantity ?? 0) + 1, MAX_QUANTITY)
    announce(`${product.name}: ${unitsText(next)} en la proforma`)
  }

  function decrease() {
    if (!line || line.quantity <= 1) {
      removeLine(product.id)
      return
    }
    update((current) => setQuantity(current, product.id, line.quantity - 1))
    announce(`${product.name}: ${unitsText(line.quantity - 1)} en la proforma`)
  }

  if (!line) {
    return (
      <Button
        variant="outline"
        size="sm"
        aria-label={`Añadir ${product.name} a la proforma`}
        onClick={add}
      >
        <Plus aria-hidden />
        Añadir
      </Button>
    )
  }

  return (
    <div
      role="group"
      aria-label={`Cantidad de ${product.name} en la proforma`}
      className="inline-flex items-center rounded-lg border bg-card"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          line.quantity <= 1
            ? `Quitar ${product.name} de la proforma`
            : `Una unidad menos de ${product.name}`
        }
        onClick={decrease}
      >
        <Minus aria-hidden />
      </Button>
      <span className="min-w-8 text-center text-sm font-bold tabular-nums">{line.quantity}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Una unidad más de ${product.name}`}
        disabled={line.quantity >= MAX_QUANTITY}
        onClick={add}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  )
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project components tests/components/proforma-control.test.tsx`
Expected: PASS.

- [ ] **Paso 5: Enter añade el único resultado**

`src/features/proforma/hooks.ts`:

```ts
'use client'

import { useQueryClient } from '@tanstack/react-query'
import { listProducts } from '@/features/catalog/products/queries'
import { catalogKeys } from '@/features/catalog/query-keys'
import { normalizeSearch } from '@/features/catalog/search-pattern'
import type { ProductFilters } from '@/features/catalog/types'
import { createClient } from '@/lib/supabase/client'
import { addProduct, findLine, unitsText } from './draft'
import { useProforma } from './store'

// Enter en el buscador añade el producto si la búsqueda deja uno solo (spec §4.1). Usa la misma
// consulta que la lista, así que no espera la pausa de 300 ms y comparte la caché.
export function useAddSingleResult() {
  const queryClient = useQueryClient()
  const { draft, update, announce } = useProforma()
  return async (filters: ProductFilters) => {
    if (normalizeSearch(filters.search) === '') return
    const page = await queryClient
      .fetchQuery({
        queryKey: catalogKeys.productList(filters),
        queryFn: ({ signal }) => listProducts(createClient(), filters, signal),
      })
      .catch(() => null)
    if (page?.total !== 1) return
    const [product] = page.items
    update((current) => addProduct(current, product))
    const quantity = (findLine(draft, product.id)?.quantity ?? 0) + 1
    announce(`${product.name}: ${unitsText(quantity)} en la proforma`)
  }
}
```

`src/features/catalog/products/components/product-filters.tsx` (archivo completo):

```tsx
'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCatalogFilters } from '../hooks'

// La categoría se elige en la tarjeta Categorías; aquí solo la búsqueda y «Limpiar filtros».
// Enter avisa a quien la usa (la proforma añade el único resultado).
export function ProductFilters({ onSearchEnter }: { onSearchEnter?: () => void }) {
  const [filters, setFilters] = useCatalogFilters()
  const hasFilters = filters.search !== '' || filters.category !== null

  return (
    <div className="flex h-17 items-center gap-3 border-b px-4 sm:px-5">
      <div className="relative max-w-[440px] flex-1">
        <Search
          className="pointer-events-none absolute top-3 left-3 size-4.5 text-muted-foreground"
          aria-hidden
        />
        <label htmlFor="product-search" className="sr-only">
          Buscar por nombre o código
        </label>
        <Input
          id="product-search"
          type="search"
          value={filters.search}
          onChange={(event) =>
            setFilters({ search: event.target.value || null, page: null }, { history: 'replace' })
          }
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !onSearchEnter) return
            event.preventDefault()
            onSearchEnter()
          }}
          maxLength={120}
          autoComplete="off"
          placeholder="Buscar por nombre o código…"
          className="bg-background/60 pl-10"
        />
      </div>
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFilters({ search: null, category: null, page: null })}
        >
          <X aria-hidden />
          Limpiar filtros
        </Button>
      ) : null}
    </div>
  )
}
```

- [ ] **Paso 6: Columna Proforma en la tabla y en las tarjetas**

En `src/features/catalog/products/components/product-list.tsx`:

1. Añadir a los imports:

```tsx
import { ProformaControl } from '@/features/proforma/components/proforma-control'
import { findLine } from '@/features/proforma/draft'
import { useAddSingleResult } from '@/features/proforma/hooks'
import { useProforma } from '@/features/proforma/store'
```

2. En `ProductList`, debajo de `const categories = useCategories()`:

```tsx
  const addSingleResult = useAddSingleResult()
```

y cambiar `<ProductFilters />` por:

```tsx
      <ProductFilters onSearchEnter={() => void addSingleResult(filters)} />
```

3. Sustituir las funciones `ProductTable` y `ProductCards` completas por:

```tsx
// PC: tabla con anchos fijos para que nunca se desborde de su tarjeta. Las filas que están en la
// proforma se marcan con un fondo verde claro (spec §4.1).
function ProductTable({ items, onEdit, onDelete }: RowsProps) {
  const { draft } = useProforma()
  const th =
    'h-11 border-y bg-background/60 px-3.5 text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase'
  return (
    <table className="hidden w-full table-fixed border-collapse text-left md:table">
      <caption className="sr-only">Productos del catálogo</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(th, 'pl-5')}>
            Producto
          </th>
          <th scope="col" className={cn(th, 'w-36')}>
            Categoría
          </th>
          <th scope="col" className={cn(th, 'w-36 text-right')}>
            Precio unitario
          </th>
          <th scope="col" className={cn(th, 'w-36 text-center')}>
            Proforma
          </th>
          <th scope="col" className={cn(th, 'w-28 pr-5 text-right')}>
            Acciones
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((product) => (
          <tr
            key={product.id}
            className={cn(
              'border-b transition-colors last:border-b-0',
              findLine(draft, product.id)
                ? 'bg-primary/10 hover:bg-primary/15'
                : 'hover:bg-background/40',
            )}
          >
            <td className="overflow-hidden py-3.5 pr-3.5 pl-5 align-middle">
              <p className="truncate font-semibold" title={product.name}>
                {product.name}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <CodeChip code={product.code} />
                <span
                  className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground"
                  title={product.description ?? undefined}
                >
                  {product.description ?? 'Sin descripción'}
                </span>
              </div>
            </td>
            <td className="px-3.5 py-3.5 align-middle">
              <CategoryBadge product={product} />
            </td>
            <td className="px-3.5 py-3.5 text-right align-middle">
              <Price value={product.unit_price} />
            </td>
            <td className="px-2 py-3.5 text-center align-middle">
              <ProformaControl product={product} />
            </td>
            <td className="py-3.5 pr-5 pl-2 text-right align-middle">
              <RowActions product={product} onEdit={onEdit} onDelete={onDelete} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Móvil: tarjetas legibles sin desbordamiento horizontal, con el mismo control de proforma.
function ProductCards({ items, onEdit, onDelete }: RowsProps) {
  const { draft } = useProforma()
  return (
    <ul className="md:hidden">
      {items.map((product) => (
        <li
          key={product.id}
          className={cn(
            'grid gap-2 border-t px-4 py-3.5',
            findLine(draft, product.id) && 'bg-primary/10',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 font-semibold">{product.name}</p>
            <Price value={product.unit_price} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CodeChip code={product.code} />
            <CategoryBadge product={product} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <ProformaControl product={product} />
            <RowActions product={product} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Paso 7: Proveedor y atajo «/» en la pantalla**

`src/features/catalog/components/catalog-screen.tsx`:

1. Cambiar el import de React por `import { useEffect, useState } from 'react'` y añadir `import { ProformaProvider } from '@/features/proforma/store'`.
2. Añadir antes de `export function CatalogScreen()`:

```tsx
// «/» lleva al buscador si no se está escribiendo en un campo ni hay una ventana abierta (spec §4.1).
function useSearchShortcut() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]',
        )
      ) {
        return
      }
      event.preventDefault()
      document.getElementById('product-search')?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
```

3. Dentro de `CatalogScreen`, después de `const { remove } = useProductMutations()`, añadir `useSearchShortcut()`.
4. Envolver el `<div className="grid gap-6">…</div>` que devuelve `CatalogScreen` con `<ProformaProvider>…</ProformaProvider>`.

- [ ] **Paso 8: Ejecutar pruebas, tipos y lint**

Run: `pnpm vitest run --project components tests/components/proforma-control.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS, sin errores de tipos ni de lint.

- [ ] **Paso 9: Commit**

```bash
git add src/features/proforma/components/proforma-control.tsx src/features/proforma/hooks.ts src/features/catalog/products/components/product-list.tsx src/features/catalog/products/components/product-filters.tsx src/features/catalog/components/catalog-screen.tsx tests/components/proforma-control.test.tsx
git commit -m "feat: add products to the proforma from the list"
```

---

### Tarea 10: Barra de proforma

**Archivos:**
- Crear: `src/features/proforma/components/proforma-bar.tsx`
- Prueba: `tests/components/proforma-bar.test.tsx`

**Interfaces:**
- Consume: `useProforma`, `useEmptyProforma` (tarea 8); `unitCount`; `totalsFromText`, `formatCents`, `TAX_CONFIG` (tarea 1).
- Produce: `<ProformaBar onComplete={() => void} />`: región «Proforma» fija abajo, visible con al menos un producto. Se coloca en la pantalla en la tarea 12.

- [ ] **Paso 1: Escribir la prueba**

`tests/components/proforma-bar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { ProformaBar } from '@/features/proforma/components/proforma-bar'
import { ProformaProvider } from '@/features/proforma/store'
import { e1Lines, seedProforma } from '../support/proforma'

function renderBar() {
  const onComplete = vi.fn()
  render(
    <ProformaProvider>
      <ProformaBar onComplete={onComplete} />
      <Toaster />
    </ProformaProvider>,
  )
  return { onComplete, user: userEvent.setup() }
}

const bar = () => screen.queryByRole('region', { name: 'Proforma' })

describe('ProformaBar', () => {
  it('no aparece sin productos', () => {
    renderBar()
    expect(bar()).not.toBeInTheDocument()
  })

  it('muestra productos, unidades y el total con IGV (ejemplo E1)', () => {
    seedProforma({ lines: e1Lines, discountPercent: '5', shipping: '20' })
    renderBar()
    expect(bar()).toHaveTextContent('3 productos · 4 unidades')
    expect(bar()).toHaveTextContent('Total con IGV')
    expect(bar()).toHaveTextContent('S/ 8,114.00')
  })

  it('«Completar proforma» abre la ventana', async () => {
    seedProforma({ lines: e1Lines })
    const { onComplete, user } = renderBar()
    await user.click(screen.getByRole('button', { name: 'Completar proforma' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('«Vaciar» quita todo y «Deshacer» lo devuelve', async () => {
    seedProforma({ lines: e1Lines, discountPercent: '5', shipping: '20' })
    const { user } = renderBar()
    await user.click(screen.getByRole('button', { name: 'Vaciar' }))
    expect(bar()).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(bar()).toHaveTextContent('S/ 8,114.00')
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project components tests/components/proforma-bar.test.tsx`
Expected: FAIL, no se puede resolver `@/features/proforma/components/proforma-bar`.

- [ ] **Paso 3: Implementar**

`src/features/proforma/components/proforma-bar.tsx`:

```tsx
'use client'

import { ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { unitCount } from '../draft'
import { formatCents } from '../money'
import { useEmptyProforma, useProforma } from '../store'
import { TAX_CONFIG } from '../tax'
import { totalsFromText } from '../totals'

// Aparece con al menos un producto, fija abajo (a todo el ancho en móvil) (spec §4.2).
export function ProformaBar({ onComplete }: { onComplete: () => void }) {
  const { draft } = useProforma()
  const empty = useEmptyProforma()
  if (draft.lines.length === 0) return null

  const totals = totalsFromText(draft)
  const products = draft.lines.length
  const units = unitCount(draft)

  return (
    <>
      {/* Espacio para que la barra no tape la paginación. */}
      <div aria-hidden className="h-16" />
      <div
        role="region"
        aria-label="Proforma"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:left-58 lg:px-10"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-sm">
            <span className="font-bold">
              {products} {products === 1 ? 'producto' : 'productos'}
            </span>
            <span className="text-muted-foreground">
              {' '}
              · {units} {units === 1 ? 'unidad' : 'unidades'}
            </span>
          </p>
          <p className="text-sm tabular-nums">
            <span className="text-muted-foreground">
              {TAX_CONFIG.mode === 'none' ? 'Total' : 'Total con IGV'}{' '}
            </span>
            <span className="text-base font-extrabold">
              S/ {totals ? formatCents(totals.total) : '—'}
            </span>
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={empty}>
              Vaciar
            </Button>
            <Button onClick={onComplete}>
              <ClipboardList aria-hidden />
              Completar proforma
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project components tests/components/proforma-bar.test.tsx`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/features/proforma/components/proforma-bar.tsx tests/components/proforma-bar.test.tsx
git commit -m "feat: add proforma bar with undoable empty"
```

---

### Tarea 11: Ventana — productos, cliente y resumen

**Archivos:**
- Crear: `src/features/proforma/readiness.ts`, `src/features/proforma/components/proforma-editor.tsx`, `src/features/proforma/components/proforma-lines.tsx`, `src/features/proforma/components/proforma-client.tsx`, `src/features/proforma/components/proforma-summary.tsx`
- Pruebas: `tests/unit/proforma-readiness.test.ts`, `tests/components/proforma-editor.test.tsx`

**Interfaces:**
- Consume: tareas 1, 2, 4 (`CompanyProfile`, `missingCompanyFields`), 7 (`RucLookupResult`, `isActiveTaxpayer`) y 8 (almacén y funciones del borrador).
- Produce (`readiness.ts`): `CompanyStatus = { status: 'loading' } | { status: 'error' } | { status: 'ready'; profile: CompanyProfile }`, `quantityError(q)`, `priceError(text)`, `discountError(text)`, `shippingError(text)`, `validityError(text)`, `clientErrors(client): { name; document; phone }`, `generateBlocker(draft, company): { message: string; companyLink?: true } | null`, `firstPendingField(draft): string` (id de un elemento).
- Produce: `<ProformaEditor company prices lookupRuc onContinue onGenerate generating? error? />` y `ProformaEditorProps`. Ids que usa `firstPendingField`: `line-<productId>-quantity`, `line-<productId>-price`, `client-name`, `client-document`, `client-phone`, `client-validity`, `proforma-discount`, `proforma-shipping`, `generate-proforma`.

- [ ] **Paso 1: Escribir la prueba de `readiness.ts`**

`tests/unit/proforma-readiness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EMPTY_DRAFT, type ProformaDraft } from '@/features/proforma/draft'
import {
  clientErrors,
  firstPendingField,
  generateBlocker,
  type CompanyStatus,
} from '@/features/proforma/readiness'
import { completeCompany, line } from '../support/proforma'

const ready: CompanyStatus = { status: 'ready', profile: completeCompany }
const client = (overrides: Partial<ProformaDraft['client']> = {}) => ({
  ...EMPTY_DRAFT.client,
  name: 'Cliente de prueba',
  ...overrides,
})
const draft = (overrides: Partial<ProformaDraft> = {}): ProformaDraft => ({
  ...EMPTY_DRAFT,
  lines: [line()],
  client: client(),
  ...overrides,
})
const reason = (value: ProformaDraft, company: CompanyStatus = ready) =>
  generateBlocker(value, company)?.message ?? null

describe('generateBlocker', () => {
  it('permite generar con productos válidos, cliente y empresa completos', () => {
    expect(reason(draft())).toBeNull()
  })

  it.each([
    ['sin productos', { lines: [] }, 'Añade al menos un producto.'],
    ['cantidad cero', { lines: [line({ quantity: 0 })] }, 'Revisa las cantidades y los precios.'],
    ['cantidad sobre el máximo', { lines: [line({ quantity: 10000 })] }, 'Revisa las cantidades y los precios.'],
    ['precio vacío', { lines: [line({ unitPrice: '' })] }, 'Revisa las cantidades y los precios.'],
    ['precio cero', { lines: [line({ unitPrice: '0' })] }, 'Revisa las cantidades y los precios.'],
    ['descuento de 101 %', { discountPercent: '101' }, 'Revisa el descuento y el envío.'],
    ['envío negativo', { shipping: '-5' }, 'Revisa el descuento y el envío.'],
    ['sin nombre de cliente', { client: client({ name: '  ' }) }, 'Completa los datos del cliente.'],
    ['RUC no válido', { client: client({ document: '20000000002' }) }, 'Completa los datos del cliente.'],
    ['celular no válido', { client: client({ phone: '812345678' }) }, 'Completa los datos del cliente.'],
    ['validez de 0 días', { validityDays: '0' }, 'Completa los datos del cliente.'],
    ['descuento del 100 % sin envío', { discountPercent: '100' }, 'El total debe ser mayor que cero.'],
    [
      'total en el tope',
      { lines: [line({ quantity: 2, unitPrice: '9999999999.99' })] },
      'El total no puede llegar a S/ 10,000,000,000.',
    ],
  ])('%s', (_, overrides, expected) => {
    expect(reason(draft(overrides))).toBe(expected)
  })

  it('espera los datos de la empresa y avisa si no cargan', () => {
    expect(reason(draft(), { status: 'loading' })).toBe('Cargando los datos de tu empresa…')
    expect(reason(draft(), { status: 'error' })).toMatch(
      /^No pudimos cargar los datos de tu empresa/,
    )
  })

  it('pide lo obligatorio de la empresa y enlaza a Empresa', () => {
    const profile = { ...completeCompany, ruc: null, address: null }
    expect(generateBlocker(draft(), { status: 'ready', profile })).toEqual({
      message: 'Completa los datos de tu empresa: RUC y dirección.',
      companyLink: true,
    })
  })
})

describe('clientErrors', () => {
  it('acepta DNI, RUC, celular con espacios y campos opcionales vacíos', () => {
    expect(clientErrors(client({ document: '12345678', phone: '987 654 321' }))).toEqual({
      name: null,
      document: null,
      phone: null,
    })
  })
})

describe('firstPendingField', () => {
  it('va a la primera cantidad o precio con error', () => {
    const value = draft({ lines: [line(), line({ productId: 'p2', unitPrice: 'abc' })] })
    expect(firstPendingField(value)).toBe('line-p2-price')
  })

  it('luego al cliente: nombre, documento y celular', () => {
    expect(firstPendingField(draft({ client: client({ name: '' }) }))).toBe('client-name')
    expect(firstPendingField(draft({ client: client({ document: '123' }) }))).toBe(
      'client-document',
    )
    expect(firstPendingField(draft({ client: client({ phone: '1' }) }))).toBe('client-phone')
  })

  it('sin nada pendiente, al botón Generar', () => {
    expect(firstPendingField(draft())).toBe('generate-proforma')
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/proforma-readiness.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/readiness`.

- [ ] **Paso 3: Implementar `readiness.ts`**

`src/features/proforma/readiness.ts`:

```ts
import { missingCompanyFields } from '@/features/company/format'
import type { CompanyProfile } from '@/features/company/schemas'
import { digitsOnly, documentError, isValidMobile } from '@/lib/peru'
import type { ProformaClient, ProformaDraft } from './draft'
import { parseCents, parsePercent, ZERO } from './money'
import { isValidQuantity, totalsFromText } from './totals'

export type CompanyStatus =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; profile: CompanyProfile }

export const quantityError = (quantity: number) =>
  isValidQuantity(quantity) ? null : 'De 1 a 9 999.'

export function priceError(text: string) {
  const cents = parseCents(text)
  return cents !== null && cents > ZERO
    ? null
    : 'Escribe un precio mayor que cero, con hasta dos decimales.'
}

export const discountError = (text: string) =>
  text.trim() === '' || parsePercent(text) !== null
    ? null
    : 'De 0 a 100 %, con hasta dos decimales.'

export const shippingError = (text: string) =>
  text.trim() === '' || parseCents(text) !== null
    ? null
    : 'Escribe un monto con hasta dos decimales.'

// Vacío usa la validez por defecto de la empresa.
export function validityError(text: string) {
  const value = text.trim()
  if (value === '') return null
  return /^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 365
    ? null
    : 'De 1 a 365 días.'
}

export function clientErrors(client: ProformaClient) {
  const phone = client.phone.trim()
  return {
    name: client.name.trim() === '' ? 'Escribe la razón social o el nombre del cliente.' : null,
    document: documentError(client.document),
    phone:
      phone === '' || (/^[\d ]+$/.test(phone) && isValidMobile(digitsOnly(phone)))
        ? null
        : 'Escribe un celular de 9 dígitos que empiece por 9.',
  }
}

const listFormat = new Intl.ListFormat('es', { type: 'conjunction' })

// Por qué «Generar proforma» sigue deshabilitado (spec §4.3); null si se puede generar.
export function generateBlocker(
  draft: ProformaDraft,
  company: CompanyStatus,
): { message: string; companyLink?: true } | null {
  if (draft.lines.length === 0) return { message: 'Añade al menos un producto.' }
  if (draft.lines.some((line) => quantityError(line.quantity) || priceError(line.unitPrice))) {
    return { message: 'Revisa las cantidades y los precios.' }
  }
  if (discountError(draft.discountPercent) || shippingError(draft.shipping)) {
    return { message: 'Revisa el descuento y el envío.' }
  }
  const client = clientErrors(draft.client)
  if (client.name || client.document || client.phone || validityError(draft.validityDays)) {
    return { message: 'Completa los datos del cliente.' }
  }
  const totals = totalsFromText(draft)
  if (!totals || totals.total <= ZERO) return { message: 'El total debe ser mayor que cero.' }
  if (!totals.withinLimit) return { message: 'El total no puede llegar a S/ 10,000,000,000.' }
  if (company.status === 'loading') return { message: 'Cargando los datos de tu empresa…' }
  if (company.status === 'error') {
    return {
      message:
        'No pudimos cargar los datos de tu empresa. Cierra la ventana e inténtalo de nuevo.',
    }
  }
  const missing = missingCompanyFields(company.profile)
  if (missing.length > 0) {
    return {
      message: `Completa los datos de tu empresa: ${listFormat.format(missing)}.`,
      companyLink: true,
    }
  }
  return null
}

// Al abrir la ventana, el foco va al primer campo pendiente (spec §4.3).
export function firstPendingField(draft: ProformaDraft) {
  for (const line of draft.lines) {
    if (quantityError(line.quantity)) return `line-${line.productId}-quantity`
    if (priceError(line.unitPrice)) return `line-${line.productId}-price`
  }
  const client = clientErrors(draft.client)
  if (client.name) return 'client-name'
  if (client.document) return 'client-document'
  if (client.phone) return 'client-phone'
  if (validityError(draft.validityDays)) return 'client-validity'
  if (discountError(draft.discountPercent)) return 'proforma-discount'
  if (shippingError(draft.shipping)) return 'proforma-shipping'
  return 'generate-proforma'
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/proforma-readiness.test.ts`
Expected: PASS.

- [ ] **Paso 5: Escribir la prueba de la ventana**

`tests/components/proforma-editor.test.tsx`:

```tsx
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import {
  ProformaEditor,
  type ProformaEditorProps,
} from '@/features/proforma/components/proforma-editor'
import { EMPTY_DRAFT } from '@/features/proforma/draft'
import type { RucLookupResult } from '@/features/proforma/ruc'
import { ProformaProvider } from '@/features/proforma/store'
import { completeCompany, e1Lines, line, seedProforma } from '../support/proforma'

function renderEditor(overrides: Partial<ProformaEditorProps> = {}) {
  const props: ProformaEditorProps = {
    company: { status: 'ready', profile: completeCompany },
    prices: undefined,
    lookupRuc: vi.fn(async (_ruc: string): Promise<RucLookupResult> => ({ kind: 'not-found' })),
    onContinue: vi.fn(),
    onGenerate: vi.fn(),
    ...overrides,
  }
  render(
    <ProformaProvider>
      <ProformaEditor {...props} />
      <Toaster />
    </ProformaProvider>,
  )
  return { ...props, user: userEvent.setup() }
}

const generate = () => screen.getByRole('button', { name: 'Generar proforma' })
const price = (name: string) => screen.getByLabelText(`Precio unitario de ${name}`)
const withClient = { ...EMPTY_DRAFT.client, name: 'Cliente de prueba' }
const found = (legalName: string, status = 'ACTIVO', condition = 'HABIDO'): RucLookupResult => ({
  kind: 'found',
  company: { ruc: '20000000001', legalName, address: 'AV. PRUEBA 123, HUAMANGA', status, condition },
})

describe('ProformaEditor', () => {
  it('calcula el resumen con el IGV incluido (ejemplo E1)', () => {
    seedProforma({ lines: e1Lines, discountPercent: '5', shipping: '20' })
    renderEditor()
    const summary = within(screen.getByRole('region', { name: 'Resumen' }))
    expect(summary.getByText('S/ 8,520.00')).toBeVisible()
    expect(summary.getByText('− S/ 426.00')).toBeVisible()
    expect(summary.getByText('S/ 8,094.00')).toBeVisible()
    expect(summary.getByText('S/ 8,114.00')).toBeVisible()
    expect(summary.getByText(/Op\. gravada S\/ 6,876\.27 · IGV \(18%\) S\/ 1,237\.73/)).toBeVisible()
    expect(screen.getByText('S/ 5,180.00')).toBeVisible()
  })

  it('«Generar» pide el nombre del cliente y se habilita al escribirlo', async () => {
    seedProforma({ lines: [line()] })
    const { onGenerate, user } = renderEditor()
    expect(generate()).toBeDisabled()
    expect(screen.getByText('Completa los datos del cliente.')).toBeVisible()
    await user.type(screen.getByLabelText('Razón social o nombre'), 'Cliente de prueba')
    expect(generate()).toBeEnabled()
    await user.click(generate())
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('un precio no válido se marca y bloquea «Generar»', async () => {
    seedProforma({ lines: [line()], client: withClient })
    const { user } = renderEditor()
    await user.clear(price('Laptop de 14 pulgadas'))
    await user.type(price('Laptop de 14 pulgadas'), '12.345')
    expect(price('Laptop de 14 pulgadas')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Revisa las cantidades y los precios.')).toBeVisible()
    expect(generate()).toBeDisabled()
  })

  it('con otro precio muestra el del catálogo y «Restaurar» lo recupera', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor()
    await user.clear(price('Laptop de 14 pulgadas'))
    await user.type(price('Laptop de 14 pulgadas'), '2400')
    expect(screen.getByText(/Catálogo S\/ 2,590\.00/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Restaurar' }))
    expect(price('Laptop de 14 pulgadas')).toHaveValue('2590.00')
  })

  it('avisa si el precio del catálogo cambió y «Actualizar» lo aplica', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor({ prices: new Map([[line().productId, '2490.00']]) })
    expect(screen.getByText(/El precio del catálogo cambió a S\/ 2,490\.00/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Actualizar' }))
    expect(price('Laptop de 14 pulgadas')).toHaveValue('2490.00')
    expect(screen.queryByText(/El precio del catálogo cambió/)).not.toBeInTheDocument()
  })

  it('avisa si el producto ya no está en el catálogo', () => {
    seedProforma({ lines: [line()] })
    renderEditor({ prices: new Map() })
    expect(screen.getByText(/Ya no está en el catálogo/)).toBeVisible()
  })

  it('quitar una línea se puede deshacer', async () => {
    seedProforma({ lines: e1Lines })
    const { user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Quitar Impresora láser' }))
    expect(screen.queryByLabelText('Precio unitario de Impresora láser')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(price('Impresora láser')).toHaveValue('850')
  })

  it('con 11 dígitos consulta el RUC una vez y completa razón social y dirección', async () => {
    seedProforma({ lines: [line()] })
    const lookupRuc = vi.fn(async (_ruc: string) => found('EMPRESA DE PRUEBA S.A.C.'))
    const { user } = renderEditor({ lookupRuc })
    await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
    expect(await screen.findByDisplayValue('EMPRESA DE PRUEBA S.A.C.')).toBeVisible()
    expect(lookupRuc).toHaveBeenCalledTimes(1)
    expect(lookupRuc).toHaveBeenCalledWith('20000000001')
    await user.click(screen.getByRole('button', { name: /Más datos/ }))
    expect(screen.getByLabelText('Dirección')).toHaveValue('AV. PRUEBA 123, HUAMANGA')
  })

  it('avisa sin bloquear si SUNAT no lo tiene activo y habido', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor({
      lookupRuc: vi.fn(async (_ruc: string) =>
        found('EMPRESA INACTIVA S.R.L.', 'BAJA DE OFICIO', 'NO HABIDO'),
      ),
    })
    await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
    expect(
      await screen.findByText(/SUNAT lo registra como BAJA DE OFICIO · NO HABIDO/),
    ).toBeVisible()
    expect(generate()).toBeEnabled()
  })

  it('si SUNAT no responde, deja escribir a mano', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor({
      lookupRuc: vi.fn(async (_ruc: string): Promise<RucLookupResult> => ({ kind: 'unavailable' })),
    })
    await user.type(screen.getByLabelText('RUC o DNI'), '20000000001')
    expect(await screen.findByText(/No pudimos consultar SUNAT/)).toBeVisible()
    await user.type(screen.getByLabelText('Razón social o nombre'), 'Cliente escrito a mano')
    expect(generate()).toBeEnabled()
  })

  it('una respuesta tardía de SUNAT no pisa un documento que ya cambió', async () => {
    seedProforma({ lines: [line()] })
    let answer: (result: RucLookupResult) => void = () => {}
    const lookupRuc = vi.fn(
      (_ruc: string) => new Promise<RucLookupResult>((resolve) => (answer = resolve)),
    )
    const { user } = renderEditor({ lookupRuc })
    const document = screen.getByLabelText('RUC o DNI')
    await user.type(document, '20000000001')
    await user.clear(document)
    await user.type(document, '12345678')
    await act(async () => answer(found('EMPRESA DE PRUEBA S.A.C.')))
    expect(screen.getByLabelText('Razón social o nombre')).toHaveValue('')
  })

  it('un documento que no es DNI ni RUC se marca al salir del campo', async () => {
    seedProforma({ lines: [line()] })
    const { user } = renderEditor()
    await user.type(screen.getByLabelText('RUC o DNI'), '123')
    await user.tab()
    expect(screen.getByText('Escribe 8 dígitos para DNI u 11 para RUC.')).toBeVisible()
  })

  it('«Más datos» resume la validez y se abre solo si tiene un error', () => {
    seedProforma({ lines: [line()], validityDays: '0' })
    renderEditor()
    const more = screen.getByRole('button', { name: /Más datos/ })
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('De 1 a 365 días.')).toBeVisible()
  })

  it('sin los datos obligatorios de la empresa, lo dice y enlaza a «Empresa»', () => {
    seedProforma({ lines: [line()], client: withClient })
    renderEditor({ company: { status: 'ready', profile: { ...completeCompany, ruc: null } } })
    expect(screen.getByText(/Completa los datos de tu empresa: RUC\./)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ir a Empresa' })).toHaveAttribute('href', '/company')
    expect(generate()).toBeDisabled()
  })

  it('«Seguir eligiendo productos» vuelve a la lista', async () => {
    seedProforma({ lines: [line()] })
    const { onContinue, user } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Seguir eligiendo productos' }))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Paso 6: Ejecutar y ver que falla**

Run: `pnpm vitest run --project components tests/components/proforma-editor.test.tsx`
Expected: FAIL, no se puede resolver `@/features/proforma/components/proforma-editor`.

- [ ] **Paso 7: Implementar las líneas**

`src/features/proforma/components/proforma-lines.tsx`:

```tsx
'use client'

import { Minus, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatPrice } from '@/features/catalog/money'
import { cn } from '@/lib/utils'
import {
  applyCatalogPrice,
  restorePrice,
  setQuantity,
  setUnitPrice,
  type ProformaLine,
} from '../draft'
import { formatCents, parseCents } from '../money'
import { priceError, quantityError } from '../readiness'
import { useProforma, useRemoveLine } from '../store'
import { MAX_QUANTITY } from '../totals'

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-2'

export function ProformaLines({
  prices,
  onContinue,
}: {
  prices: Map<string, string> | undefined
  onContinue: () => void
}) {
  const { draft } = useProforma()
  return (
    <section aria-labelledby="proforma-lines-title" className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="proforma-lines-title" className="text-sm font-bold">
          Productos
        </h3>
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onContinue}>
          Seguir eligiendo productos
        </Button>
      </div>
      {draft.lines.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Aún no hay productos. Vuelve a la lista y pulsa «Añadir».
        </p>
      ) : (
        <ul className="grid gap-2">
          {draft.lines.map((line) => (
            <LineRow
              key={line.productId}
              line={line}
              currentPrice={prices?.get(line.productId)}
              missing={prices !== undefined && !prices.has(line.productId)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function LineRow({
  line,
  currentPrice,
  missing,
}: {
  line: ProformaLine
  currentPrice: string | undefined
  missing: boolean
}) {
  const { update } = useProforma()
  const removeLine = useRemoveLine()
  const id = `line-${line.productId}`
  const quantityProblem = quantityError(line.quantity)
  const priceProblem = priceError(line.unitPrice)
  const cents = parseCents(line.unitPrice)
  const total =
    !quantityProblem && !priceProblem && cents !== null
      ? `S/ ${formatCents(BigInt(line.quantity) * cents)}`
      : '—'
  const edited = cents !== parseCents(line.catalogPrice)
  // Precio del catálogo distinto del que tenía al añadirlo (spec §4.5).
  const newPrice = currentPrice !== undefined && currentPrice !== line.catalogPrice ? currentPrice : null
  const change = (quantity: number) =>
    update((current) => setQuantity(current, line.productId, quantity))

  return (
    <li className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 font-semibold" title={line.name}>
            {line.name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{line.code}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Quitar ${line.name}`}
          title="Quitar"
          className="hover:bg-destructive/10 hover:text-destructive"
          onClick={() => removeLine(line.productId)}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            'inline-flex items-center rounded-lg border bg-card',
            quantityProblem && 'border-destructive',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Una unidad menos de ${line.name}`}
            disabled={line.quantity <= 1}
            onClick={() => change(line.quantity - 1)}
          >
            <Minus aria-hidden />
          </Button>
          <input
            id={`${id}-quantity`}
            aria-label={`Cantidad de ${line.name}`}
            aria-invalid={quantityProblem ? true : undefined}
            aria-describedby={quantityProblem ? `${id}-quantity-error` : undefined}
            inputMode="numeric"
            autoComplete="off"
            value={line.quantity === 0 ? '' : String(line.quantity)}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, 5)
              change(digits === '' ? 0 : Number(digits))
            }}
            className="h-9 w-14 bg-transparent text-center font-semibold tabular-nums outline-none"
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Una unidad más de ${line.name}`}
            disabled={line.quantity >= MAX_QUANTITY}
            onClick={() => change(line.quantity + 1)}
          >
            <Plus aria-hidden />
          </Button>
        </div>
        <div
          className={cn(
            'flex h-9 overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
            priceProblem && 'border-destructive ring-3 ring-destructive/20',
          )}
        >
          <span className="grid place-items-center border-r bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
            S/
          </span>
          <input
            id={`${id}-price`}
            aria-label={`Precio unitario de ${line.name}`}
            aria-invalid={priceProblem ? true : undefined}
            aria-describedby={priceProblem ? `${id}-price-error` : undefined}
            inputMode="decimal"
            autoComplete="off"
            value={line.unitPrice}
            onChange={(event) =>
              update((current) => setUnitPrice(current, line.productId, event.target.value))
            }
            className="w-28 min-w-0 bg-transparent px-2.5 text-right tabular-nums outline-none"
          />
        </div>
        <p className="ml-auto text-right whitespace-nowrap tabular-nums">
          <span className="mr-1 text-xs text-muted-foreground">Total</span>
          <span className="font-bold">{total}</span>
        </p>
      </div>
      {quantityProblem ? (
        <p id={`${id}-quantity-error`} className="text-xs font-medium text-destructive">
          Cantidad: {quantityProblem}
        </p>
      ) : null}
      {priceProblem ? (
        <p id={`${id}-price-error`} className="text-xs font-medium text-destructive">
          {priceProblem}
        </p>
      ) : null}
      {edited ? (
        <p className="text-xs text-muted-foreground">
          Catálogo S/ {formatPrice(line.catalogPrice)} ·{' '}
          <button
            type="button"
            className={inlineAction}
            onClick={() => update((current) => restorePrice(current, line.productId))}
          >
            Restaurar
          </button>
        </p>
      ) : null}
      {newPrice ? (
        <p className="text-xs text-amber-800">
          El precio del catálogo cambió a S/ {formatPrice(newPrice)} ·{' '}
          <button
            type="button"
            className={inlineAction}
            onClick={() =>
              update((current) => applyCatalogPrice(current, line.productId, newPrice))
            }
          >
            Actualizar
          </button>
        </p>
      ) : null}
      {missing ? (
        <p className="text-xs text-amber-800">
          Ya no está en el catálogo. Puedes quitarlo o mantenerlo con estos datos.
        </p>
      ) : null}
    </li>
  )
}
```

- [ ] **Paso 8: Implementar el cliente**

`src/features/proforma/components/proforma-client.tsx`:

```tsx
'use client'

import { ChevronDown, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { digitsOnly, isValidRuc } from '@/lib/peru'
import { cn } from '@/lib/utils'
import { patchClient, patchConditions, type ProformaClient as Client } from '../draft'
import { clientErrors, validityError } from '../readiness'
import { isActiveTaxpayer, type RucLookupResult } from '../ruc'
import { useProforma } from '../store'

type Lookup = { ruc: string; result: RucLookupResult | 'loading' } | null

function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string
  label: string
  optional?: boolean
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional ? (
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground">Opcional</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const fieldProps = (id: string, error?: string | null) => ({
  id,
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
})

export function ProformaClient({
  lookupRuc,
  defaultValidityDays,
}: {
  lookupRuc: (ruc: string) => Promise<RucLookupResult>
  defaultValidityDays: number | null
}) {
  const { draft, update } = useProforma()
  const client = draft.client
  const [touched, setTouched] = useState<Partial<Record<keyof Client, boolean>>>({})
  const [lookup, setLookup] = useState<Lookup>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const errors = clientErrors(client)
  const validity = validityError(draft.validityDays)
  const showMore = moreOpen || validity !== null
  const touch = (field: keyof Client) => setTouched((current) => ({ ...current, [field]: true }))
  const edit = (patch: Partial<Client>) => update((current) => patchClient(current, patch))

  // Se consulta al completar un RUC válido, no en cada tecla (spec §7). Si el documento cambió
  // mientras tanto, la respuesta no pisa nada.
  async function runLookup(ruc: string) {
    setLookup({ ruc, result: 'loading' })
    const result = await lookupRuc(ruc)
    setLookup((current) => (current?.ruc === ruc ? { ruc, result } : current))
    if (result.kind !== 'found') return
    update((current) =>
      current.client.document === ruc
        ? patchClient(current, {
            name: result.company.legalName,
            address: result.company.address ?? current.client.address,
          })
        : current,
    )
  }

  function changeDocument(value: string) {
    const digits = digitsOnly(value).slice(0, 11)
    edit({ document: digits })
    if (digits !== client.document && isValidRuc(digits)) void runLookup(digits)
  }

  const nameError = touched.name ? errors.name : null
  const documentError = touched.document || client.document.length === 11 ? errors.document : null
  const phoneError = touched.phone ? errors.phone : null
  const days = draft.validityDays || (defaultValidityDays ? String(defaultValidityDays) : '')
  const summary = `${days ? `Validez ${days} días` : 'Validez de la empresa'} · Entrega: ${
    client.deliveryTime.trim() || 'sin indicar'
  }`

  return (
    <section aria-labelledby="proforma-client-title" className="grid gap-4">
      <h3 id="proforma-client-title" className="text-sm font-bold">
        Cliente
      </h3>
      <Field id="client-name" label="Razón social o nombre" error={nameError}>
        <Input
          {...fieldProps('client-name', nameError)}
          value={client.name}
          maxLength={200}
          autoComplete="off"
          onChange={(event) => edit({ name: event.target.value })}
          onBlur={() => touch('name')}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="client-document" label="RUC o DNI" optional error={documentError}>
          <Input
            {...fieldProps('client-document', documentError)}
            value={client.document}
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            onChange={(event) => changeDocument(event.target.value)}
            onBlur={() => touch('document')}
          />
        </Field>
        <Field id="client-phone" label="Celular" optional error={phoneError}>
          <Input
            {...fieldProps('client-phone', phoneError)}
            value={client.phone}
            type="tel"
            inputMode="tel"
            maxLength={11}
            autoComplete="off"
            placeholder="987 654 321"
            onChange={(event) => edit({ phone: event.target.value })}
            onBlur={() => touch('phone')}
          />
        </Field>
      </div>
      <RucStatus
        lookup={lookup?.ruc === client.document ? lookup : null}
        onRetry={() => void runLookup(client.document)}
      />
      <div className="rounded-lg border">
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="client-more"
          onClick={() => setMoreOpen(!showMore)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="font-semibold">Más datos</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{summary}</span>
          <ChevronDown
            className={cn('size-4 shrink-0 transition-transform', showMore && 'rotate-180')}
            aria-hidden
          />
        </button>
        {showMore ? (
          <div id="client-more" className="grid gap-4 border-t p-3">
            <Field id="client-address" label="Dirección" optional>
              <Input
                id="client-address"
                value={client.address}
                maxLength={300}
                autoComplete="off"
                onChange={(event) => edit({ address: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="client-delivery" label="Tiempo de entrega" optional>
                <Input
                  id="client-delivery"
                  value={client.deliveryTime}
                  maxLength={120}
                  placeholder="Por ejemplo, 3 días hábiles"
                  onChange={(event) => edit({ deliveryTime: event.target.value })}
                />
              </Field>
              <Field id="client-validity" label="Validez de la oferta (días)" error={validity}>
                <Input
                  {...fieldProps('client-validity', validity)}
                  value={draft.validityDays}
                  inputMode="numeric"
                  maxLength={3}
                  placeholder={defaultValidityDays ? String(defaultValidityDays) : undefined}
                  onChange={(event) =>
                    update((current) =>
                      patchConditions(current, {
                        validityDays: event.target.value.replace(/\D/g, ''),
                      }),
                    )
                  }
                />
              </Field>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

// Estados de la consulta (spec §4.5): cargando, encontrado, no encontrado, sin servicio y aviso.
function RucStatus({ lookup, onRetry }: { lookup: Lookup; onRetry: () => void }) {
  if (!lookup) return null
  const { result } = lookup
  if (result === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Buscando el RUC en SUNAT…
      </p>
    )
  }
  if (result.kind === 'not-found') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No encontramos este RUC en SUNAT. Escribe los datos a mano.
      </p>
    )
  }
  if (result.kind === 'unavailable') {
    return (
      <p role="status" className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
        No pudimos consultar SUNAT. Escribe los datos a mano o
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
          vuelve a intentarlo
        </Button>
      </p>
    )
  }
  if (isActiveTaxpayer(result.company)) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Datos de SUNAT. Puedes editarlos.
      </p>
    )
  }
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      SUNAT lo registra como {result.company.status} · {result.company.condition}. Puedes generar la
      proforma igual.
    </p>
  )
}
```

- [ ] **Paso 9: Implementar el resumen y la ventana**

`src/features/proforma/components/proforma-summary.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { patchConditions } from '../draft'
import { formatCents, ZERO } from '../money'
import { discountError, shippingError } from '../readiness'
import { useProforma } from '../store'
import { TAX_CONFIG } from '../tax'
import { totalsFromText, type Totals } from '../totals'

const amountInput =
  'h-9 w-24 rounded-lg border border-input bg-card px-2.5 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-secondary-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}

function taxNote(totals: Totals) {
  const parts = totals.pricesIncludeTax ? ['Precios incluyen IGV'] : []
  if (totals.showBreakdown) {
    parts.push(
      `Op. gravada S/ ${formatCents(totals.base)}`,
      `IGV (${TAX_CONFIG.ratePercent}%) S/ ${formatCents(totals.tax)}`,
    )
  }
  return parts.join(' · ')
}

// Total parcial, descuento %, neto, envío, total y desglose del IGV (spec §4.3).
export function ProformaSummary() {
  const { draft, update } = useProforma()
  const totals = totalsFromText(draft)
  const discountProblem = discountError(draft.discountPercent)
  const shippingProblem = shippingError(draft.shipping)
  const money = (value: bigint | undefined) =>
    value === undefined ? '—' : `S/ ${formatCents(value)}`

  return (
    <section
      aria-labelledby="proforma-summary-title"
      className="grid gap-2.5 rounded-[14px] border bg-background/60 p-4 text-sm"
    >
      <h3 id="proforma-summary-title" className="text-sm font-bold">
        Resumen
      </h3>
      <Row label="Total parcial">{money(totals?.subtotal)}</Row>
      <Row label={<label htmlFor="proforma-discount">Descuento (%)</label>}>
        <input
          id="proforma-discount"
          className={amountInput}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={draft.discountPercent}
          aria-invalid={discountProblem ? true : undefined}
          aria-describedby={discountProblem ? 'proforma-discount-error' : undefined}
          onChange={(event) =>
            update((current) => patchConditions(current, { discountPercent: event.target.value }))
          }
        />
      </Row>
      {discountProblem ? (
        <p id="proforma-discount-error" className="text-right text-xs font-medium text-destructive">
          {discountProblem}
        </p>
      ) : null}
      {totals && totals.discount > ZERO ? (
        <Row label="Descuento">− S/ {formatCents(totals.discount)}</Row>
      ) : null}
      <Row label="Neto">{money(totals?.net)}</Row>
      <Row label={<label htmlFor="proforma-shipping">Envío (S/)</label>}>
        <input
          id="proforma-shipping"
          className={amountInput}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={draft.shipping}
          aria-invalid={shippingProblem ? true : undefined}
          aria-describedby={shippingProblem ? 'proforma-shipping-error' : undefined}
          onChange={(event) =>
            update((current) => patchConditions(current, { shipping: event.target.value }))
          }
        />
      </Row>
      {shippingProblem ? (
        <p id="proforma-shipping-error" className="text-right text-xs font-medium text-destructive">
          {shippingProblem}
        </p>
      ) : null}
      <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-foreground px-3 py-2.5 text-background">
        <span className="font-bold">Total</span>
        <span className="text-lg font-extrabold text-primary tabular-nums">
          {money(totals?.total)}
        </span>
      </div>
      {totals ? <p className="text-right text-xs text-muted-foreground">{taxNote(totals)}</p> : null}
    </section>
  )
}
```

`src/features/proforma/components/proforma-editor.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { generateBlocker, type CompanyStatus } from '../readiness'
import type { RucLookupResult } from '../ruc'
import { useProforma } from '../store'
import { ProformaClient } from './proforma-client'
import { ProformaLines } from './proforma-lines'
import { ProformaSummary } from './proforma-summary'

export type ProformaEditorProps = {
  company: CompanyStatus
  prices: Map<string, string> | undefined
  lookupRuc: (ruc: string) => Promise<RucLookupResult>
  onContinue: () => void
  onGenerate: () => void
  generating?: boolean
  error?: string | null
}

// Productos, cliente y resumen en una sola vista (spec §4.3). «Generar» explica por qué no se
// puede todavía, con el motivo debajo.
export function ProformaEditor({
  company,
  prices,
  lookupRuc,
  onContinue,
  onGenerate,
  generating = false,
  error = null,
}: ProformaEditorProps) {
  const { draft } = useProforma()
  const blocker = generateBlocker(draft, company)
  const defaultValidity =
    company.status === 'ready' ? company.profile.default_validity_days : null

  return (
    <>
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-6 p-5 sm:p-6">
          <ProformaLines prices={prices} onContinue={onContinue} />
        </div>
        <div className="grid content-start gap-6 border-t p-5 sm:p-6 lg:border-t-0 lg:border-l">
          <ProformaClient lookupRuc={lookupRuc} defaultValidityDays={defaultValidity} />
          <ProformaSummary />
        </div>
      </div>
      <div className="grid gap-2 border-t bg-background/60 px-5 py-4 sm:justify-items-end sm:px-6">
        <Button
          id="generate-proforma"
          disabled={blocker !== null || generating}
          aria-describedby="generate-reason"
          onClick={onGenerate}
        >
          {generating ? 'Generando…' : 'Generar proforma'}
        </Button>
        {error ? (
          <p id="generate-reason" role="alert" className="text-sm text-destructive sm:text-right">
            {error}
          </p>
        ) : (
          <p id="generate-reason" className="text-sm text-muted-foreground sm:text-right">
            {blocker?.message}
            {blocker?.companyLink ? (
              <>
                {' '}
                <Link
                  href="/company"
                  className="font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-2"
                >
                  Ir a Empresa
                </Link>
              </>
            ) : null}
          </p>
        )}
      </div>
    </>
  )
}
```

- [ ] **Paso 10: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/proforma-readiness.test.ts && pnpm vitest run --project components tests/components/proforma-editor.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS, sin errores de tipos ni de lint.

- [ ] **Paso 11: Commit**

```bash
git add src/features/proforma/readiness.ts src/features/proforma/components/proforma-editor.tsx src/features/proforma/components/proforma-lines.tsx src/features/proforma/components/proforma-client.tsx src/features/proforma/components/proforma-summary.tsx tests/unit/proforma-readiness.test.ts tests/components/proforma-editor.test.tsx
git commit -m "feat: complete proforma lines, client and summary"
```

---

### Tarea 12: Generar, proforma lista y ventana en Productos

**Archivos:**
- Crear: `src/features/proforma/queries.ts`, `src/features/proforma/components/proforma-panel.tsx`, `src/features/proforma/components/proforma-dialog.tsx`
- Modificar: `src/features/proforma/hooks.ts` (precios actuales y consulta de RUC con caché), `src/lib/use-return-focus.ts` (foco de reserva), `src/features/catalog/components/catalog-screen.tsx` (barra y ventana), `playwright.config.ts` (proveedor de RUC de prueba)
- Pruebas: `tests/components/proforma-panel.test.tsx`, `tests/integration/proforma-prices.test.ts`, `tests/e2e/proforma.spec.ts`

**Interfaces:**
- Consume: `ProformaEditor` y `CompanyStatus` (tarea 11), `ProformaBar` (tarea 10), `reserveProformaNumber` y `lookupRuc` (tareas 6 y 7), `formatProformaNumber`, `useCompanyProfile` (tarea 5), `setNumber`, `EMPTY_DRAFT`, `firstPendingField`.
- Produce: `getCurrentPrices(supabase, ids): Promise<Map<string, string>>`, `proformaKeys`, `useCurrentPrices(ids, enabled)`, `useRucLookup(): (ruc) => Promise<RucLookupResult>`, `<ProformaPanel … reserveNumber onFinish />`, `<ProformaDialog open onClose />`, `useReturnFocus(open, fallbackId?)`.

- [ ] **Paso 1: Escribir la prueba del panel**

`tests/components/proforma-panel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  ProformaPanel,
  type ProformaPanelProps,
} from '@/features/proforma/components/proforma-panel'
import { draftSchema, EMPTY_DRAFT, PROFORMA_DRAFT_KEY } from '@/features/proforma/draft'
import type { RucLookupResult } from '@/features/proforma/ruc'
import { ProformaProvider } from '@/features/proforma/store'
import type { ActionResult } from '@/lib/action-result'
import { readDraft } from '@/lib/drafts'
import { completeCompany, line, seedProforma } from '../support/proforma'

function renderPanel(overrides: Partial<ProformaPanelProps> = {}) {
  const props: ProformaPanelProps = {
    company: { status: 'ready', profile: completeCompany },
    prices: undefined,
    lookupRuc: vi.fn(async (_ruc: string): Promise<RucLookupResult> => ({ kind: 'not-found' })),
    reserveNumber: vi.fn(async (): Promise<ActionResult<number>> => ({ ok: true, data: 1 })),
    onContinue: vi.fn(),
    onFinish: vi.fn(),
    ...overrides,
  }
  render(
    <ProformaProvider>
      <ProformaPanel {...props} />
    </ProformaProvider>,
  )
  return { ...props, user: userEvent.setup() }
}

const readyToGenerate = {
  lines: [line()],
  client: { ...EMPTY_DRAFT.client, name: 'Cliente de prueba' },
}
const generate = () => screen.getByRole('button', { name: 'Generar proforma' })

describe('ProformaPanel', () => {
  it('«Generar» asigna el número; «Corregir» lo conserva y no pide otro', async () => {
    seedProforma(readyToGenerate)
    const { reserveNumber, user } = renderPanel()
    await user.click(generate())
    expect(await screen.findByText('Proforma N° 0001 lista')).toBeVisible()
    expect(screen.getByText('Cliente de prueba · Total S/ 2,590.00')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Corregir' }))
    await user.click(generate())
    expect(await screen.findByText('Proforma N° 0001 lista')).toBeVisible()
    expect(reserveNumber).toHaveBeenCalledTimes(1)
  })

  it('un doble clic pide un solo número', async () => {
    seedProforma(readyToGenerate)
    let finish: (result: ActionResult<number>) => void = () => {}
    const reserveNumber = vi.fn(
      () => new Promise<ActionResult<number>>((resolve) => (finish = resolve)),
    )
    const { user } = renderPanel({ reserveNumber })
    const button = generate()
    await user.click(button)
    await user.click(button)
    expect(reserveNumber).toHaveBeenCalledTimes(1)
    finish({ ok: true, data: 7 })
    expect(await screen.findByText('Proforma N° 0007 lista')).toBeVisible()
  })

  it('si falla, lo dice, conserva lo escrito y deja reintentar', async () => {
    seedProforma(readyToGenerate)
    const reserveNumber = vi
      .fn<() => Promise<ActionResult<number>>>()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'UNEXPECTED',
          message: 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.',
        },
      })
      .mockResolvedValueOnce({ ok: true, data: 2 })
    const { user } = renderPanel({ reserveNumber })
    await user.click(generate())
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu conexión')
    expect(screen.getByLabelText('Razón social o nombre')).toHaveValue('Cliente de prueba')
    await user.click(generate())
    expect(await screen.findByText('Proforma N° 0002 lista')).toBeVisible()
  })

  it('«Nueva proforma» vacía el borrador, libera el número y cierra', async () => {
    seedProforma(readyToGenerate)
    const { onFinish, user } = renderPanel()
    await user.click(generate())
    await user.click(await screen.findByRole('button', { name: 'Nueva proforma' }))
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(readDraft(PROFORMA_DRAFT_KEY, draftSchema)).toMatchObject({ lines: [], number: null })
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project components tests/components/proforma-panel.test.tsx`
Expected: FAIL, no se puede resolver `@/features/proforma/components/proforma-panel`.

- [ ] **Paso 3: Implementar el panel**

`src/features/proforma/components/proforma-panel.tsx`:

```tsx
'use client'

import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/lib/action-result'
import { EMPTY_DRAFT, setNumber } from '../draft'
import { formatCents } from '../money'
import { formatProformaNumber } from '../number'
import { useProforma } from '../store'
import { totalsFromText } from '../totals'
import { ProformaEditor, type ProformaEditorProps } from './proforma-editor'

export type ProformaPanelProps = Omit<ProformaEditorProps, 'onGenerate' | 'generating' | 'error'> & {
  reserveNumber: () => Promise<ActionResult<number>>
  onFinish: () => void
}

// El número se pide una sola vez: «Corregir» lo conserva y «Nueva proforma» lo libera (spec §4.4).
// Descargar el PDF y enviarlo por WhatsApp llegan con las tareas 10 y 11 del plan del catálogo.
export function ProformaPanel({ reserveNumber, onFinish, ...editor }: ProformaPanelProps) {
  const { draft, update } = useProforma()
  const [view, setView] = useState<'edit' | 'ready'>('edit')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setError(null)
    if (draft.number === null) {
      setGenerating(true)
      const result = await reserveNumber()
      setGenerating(false)
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      update((current) => setNumber(current, result.data))
    }
    setView('ready')
  }

  function startNew() {
    update(() => EMPTY_DRAFT)
    onFinish()
  }

  if (view === 'ready' && draft.number !== null) {
    const totals = totalsFromText(draft)
    return (
      <div className="grid justify-items-center gap-3 px-6 py-12 text-center">
        <span className="grid size-13 place-items-center rounded-full bg-primary/15 text-ring">
          <CircleCheck className="size-6" aria-hidden />
        </span>
        <p role="status" className="text-xl font-extrabold">
          Proforma {formatProformaNumber(draft.number)} lista
        </p>
        <p className="text-sm text-muted-foreground">
          {draft.client.name} · Total S/ {totals ? formatCents(totals.total) : '—'}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button variant="outline" autoFocus onClick={() => setView('edit')}>
            Corregir
          </Button>
          <Button onClick={startNew}>Nueva proforma</Button>
        </div>
      </div>
    )
  }

  return <ProformaEditor {...editor} onGenerate={generate} generating={generating} error={error} />
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project components tests/components/proforma-panel.test.tsx`
Expected: PASS.

- [ ] **Paso 5: Escribir la prueba de los precios actuales**

`tests/integration/proforma-prices.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getCurrentPrices } from '@/features/proforma/queries'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, resetCatalog } from './db'

const password = 'precios-clave-123'
const owner = { email: 'precios-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }
const intruder = { email: 'precios-intruso@catalogo.test' }
const missingId = '6f1c2a7e-3b4d-4c5e-8f9a-0b1c2d3e4f5a'

let db: Client
let supabase: SupabaseClient
let outsider: SupabaseClient
let laptop: string

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  await ensureUser({ password, ...intruder })
  supabase = await signedInClient(owner.email, password)
  outsider = await signedInClient(intruder.email, password)
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCatalog(db)
  const category = await db.query<{ id: string }>(
    "insert into public.categories (name) values ('Laptops') returning id",
  )
  const product = await db.query<{ id: string }>(
    `insert into public.products (code, name, category_id, unit_price)
     values ('LAP-001', 'Laptop de 14 pulgadas', $1, 2490) returning id`,
    [category.rows[0].id],
  )
  laptop = product.rows[0].id
})

describe('precios actuales para la proforma', () => {
  it('devuelve el precio normalizado y omite los productos que ya no existen', async () => {
    const prices = await getCurrentPrices(supabase, [laptop, missingId])
    expect([...prices]).toEqual([[laptop, '2490.00']])
  })

  it('una cuenta sin autorización no ve precios', async () => {
    expect((await getCurrentPrices(outsider, [laptop])).size).toBe(0)
  })
})
```

Run: `pnpm vitest run --project integration tests/integration/proforma-prices.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/queries`.

- [ ] **Paso 6: Implementar la consulta, los hooks, el foco y la ventana**

`src/features/proforma/queries.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { unitPriceSchema } from '@/features/catalog/money'
import type { Database } from '@/lib/supabase/database.types'

// Precio actual en el catálogo de los productos de la proforma, para avisar si cambió (spec §4.5).
// Un producto borrado no aparece en el resultado.
export async function getCurrentPrices(supabase: SupabaseClient<Database>, ids: string[]) {
  const prices = new Map<string, string>()
  if (ids.length === 0) return prices
  const { data, error } = await supabase
    .from('products')
    .select('id, unit_price::text')
    .in('id', ids)
  if (error) throw error
  for (const row of data) prices.set(row.id, unitPriceSchema.parse(row.unit_price))
  return prices
}
```

En `src/features/proforma/hooks.ts`, cambiar el import de TanStack por `import { useQuery, useQueryClient } from '@tanstack/react-query'`, añadir estos imports:

```ts
import { settle } from '@/lib/action-result'
import { lookupRuc } from './actions'
import { getCurrentPrices } from './queries'
import type { RucLookupResult } from './ruc'
```

y añadir al final del archivo:

```ts
export const proformaKeys = {
  prices: (ids: string[]) => ['proforma', 'prices', ids] as const,
  ruc: (ruc: string) => ['proforma', 'ruc', ruc] as const,
}

// Al abrir la ventana se compara con el catálogo actual, sin la caché de 5 minutos (spec §4.5).
export function useCurrentPrices(ids: string[], enabled: boolean) {
  const sorted = [...ids].sort()
  return useQuery({
    queryKey: proformaKeys.prices(sorted),
    queryFn: () => getCurrentPrices(createClient(), sorted),
    enabled: enabled && sorted.length > 0,
    staleTime: 0,
  })
}

// El resultado queda en la caché de la sesión (spec §7), que se borra al cerrar sesión. «No
// disponible» no se guarda, para poder reintentar.
export function useRucLookup() {
  const queryClient = useQueryClient()
  return (ruc: string): Promise<RucLookupResult> =>
    queryClient
      .fetchQuery({
        queryKey: proformaKeys.ruc(ruc),
        queryFn: async () => {
          const result = await settle(lookupRuc(ruc))
          if (!result.ok || result.data.kind === 'unavailable') {
            throw new Error('SUNAT no disponible')
          }
          return result.data
        },
        staleTime: Infinity,
        gcTime: Infinity,
      })
      .catch((): RucLookupResult => ({ kind: 'unavailable' }))
}
```

`src/lib/use-return-focus.ts` (archivo completo):

```ts
'use client'

import { useLayoutEffect, useRef } from 'react'

// Los diálogos se abren desde el estado, sin DialogTrigger de Radix, así que Radix no sabe a quién
// devolver el foco al cerrar. Se guarda el elemento enfocado al abrir y se restaura al cerrar. El
// efecto de layout corre antes de que el contenido mueva el foco (por ejemplo, a su primer campo).
// Si el que abrió ya no existe (la barra de la proforma tras «Nueva proforma»), va a fallbackId.
export function useReturnFocus(open: boolean, fallbackId?: string) {
  const opener = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
  }, [open])
  return {
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault()
      if (opener.current?.isConnected) opener.current.focus()
      else if (fallbackId) document.getElementById(fallbackId)?.focus()
    },
  }
}
```

`src/features/proforma/components/proforma-dialog.tsx`:

```tsx
'use client'

import { format } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCompanyProfile } from '@/features/company/hooks'
import { settle } from '@/lib/action-result'
import { useReturnFocus } from '@/lib/use-return-focus'
import { reserveProformaNumber } from '../actions'
import { useCurrentPrices, useRucLookup } from '../hooks'
import { formatProformaNumber } from '../number'
import { firstPendingField, type CompanyStatus } from '../readiness'
import { useProforma } from '../store'
import { ProformaPanel } from './proforma-panel'

// Ventana centrada (pantalla completa en móvil); Esc la cierra (spec §4.3).
export function ProformaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { draft } = useProforma()
  const company = useCompanyProfile()
  const prices = useCurrentPrices(
    draft.lines.map((line) => line.productId),
    open,
  )
  const lookupRuc = useRucLookup()
  const returnFocus = useReturnFocus(open, 'product-search')

  const companyStatus: CompanyStatus = company.isPending
    ? { status: 'loading' }
    : company.isError || !company.data
      ? { status: 'error' }
      : { status: 'ready', profile: company.data }
  const saved = draft.updatedAt
    ? `Borrador guardado a las ${format(new Date(draft.updatedAt), 'HH:mm')}`
    : 'Borrador guardado'

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        {...returnFocus}
        onOpenAutoFocus={(event) => {
          // El foco entra en el primer campo pendiente (spec §4.3).
          const target = document.getElementById(firstPendingField(draft))
          if (target && !target.matches(':disabled')) {
            event.preventDefault()
            target.focus()
          }
        }}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-none max-sm:rounded-none sm:max-w-[1040px]"
      >
        <DialogHeader className="border-b px-6 pt-5 pr-12 pb-4">
          <DialogTitle className="text-lg font-bold">Completar proforma</DialogTitle>
          <DialogDescription>
            {draft.number ? `${formatProformaNumber(draft.number)} · ` : ''}
            {saved}
          </DialogDescription>
        </DialogHeader>
        <ProformaPanel
          company={companyStatus}
          prices={prices.data}
          lookupRuc={lookupRuc}
          reserveNumber={() => settle(reserveProformaNumber())}
          onContinue={onClose}
          onFinish={onClose}
        />
      </DialogContent>
    </Dialog>
  )
}
```

En `src/features/catalog/components/catalog-screen.tsx`:

1. Añadir los imports:

```tsx
import { ProformaBar } from '@/features/proforma/components/proforma-bar'
import { ProformaDialog } from '@/features/proforma/components/proforma-dialog'
```

2. Dentro de `CatalogScreen`, junto a los demás `useState`:

```tsx
  const [proformaOpen, setProformaOpen] = useState(false)
```

3. Dentro del `<div className="grid gap-6">`, después de `<DeleteProductDialog … />`:

```tsx
        <ProformaBar onComplete={() => setProformaOpen(true)} />
        <ProformaDialog open={proformaOpen} onClose={() => setProformaOpen(false)} />
```

En `playwright.config.ts`, dentro de `webServer`, añadir:

```ts
    // Consulta de RUC con datos de prueba: las e2e nunca llaman al servicio real.
    env: { RUC_PROVIDER: 'stub' },
```

- [ ] **Paso 7: Ejecutar las pruebas de integración y de tipos**

Run: `pnpm vitest run --project integration tests/integration/proforma-prices.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, sin errores de tipos ni de lint.

- [ ] **Paso 8: Escribir la e2e de la proforma**

`tests/e2e/proforma.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { connect, fillCompanyProfile, resetCatalog, resetCompanyProfile } from '../integration/db'
import { login } from './session'

// Dos laptops, la numeración desde 1 y, si se pide, la empresa con lo obligatorio.
async function seed({ company = true } = {}) {
  const db = await connect()
  try {
    await resetCatalog(db)
    await resetCompanyProfile(db)
    if (company) await fillCompanyProfile(db)
    await db.query('alter sequence public.proforma_number_seq restart with 1')
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    await db.query(
      `insert into public.products (code, name, category_id, unit_price) values
         ('LAP-001', 'Laptop de 14 pulgadas', $1, 2590),
         ('LAP-002', 'Laptop de 16 pulgadas', $1, 3490)`,
      [rows[0].id],
    )
  } finally {
    await db.end()
  }
}

const list = (page: Page) => page.getByRole('region', { name: 'Lista de productos' })
const bar = (page: Page) => page.getByRole('region', { name: 'Proforma' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Completar proforma' })

async function addLaptop14(page: Page) {
  await list(page)
    .getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' })
    .click()
}

// Las Server Actions de la pantalla se envían por POST a /products; cortarlas simula perder la red.
async function goOffline(page: Page) {
  await page.route(
    (url) => url.pathname === '/products',
    (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  )
}

test('arma, genera, corrige y empieza otra proforma', async ({ page }) => {
  await seed()
  await login(page)
  await addLaptop14(page)
  await list(page).getByRole('button', { name: 'Una unidad más de Laptop de 14 pulgadas' }).click()
  await list(page)
    .getByRole('button', { name: 'Añadir Laptop de 16 pulgadas a la proforma' })
    .click()
  await expect(bar(page)).toContainText('2 productos · 3 unidades')
  await expect(bar(page)).toContainText('S/ 8,670.00')

  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  const panel = dialog(page)
  await expect(panel.getByLabel('Razón social o nombre')).toBeFocused()
  await panel.getByLabel('RUC o DNI').fill('20000000001')
  await expect(panel.getByLabel('Razón social o nombre')).toHaveValue('EMPRESA DE PRUEBA S.A.C.')

  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()
  await panel.getByRole('button', { name: 'Corregir' }).click()
  await panel.getByLabel('Cantidad de Laptop de 16 pulgadas').fill('2')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()

  await panel.getByRole('button', { name: 'Nueva proforma' }).click()
  await expect(panel).toHaveCount(0)
  await expect(bar(page)).toHaveCount(0)
  await expect(page.getByLabel('Buscar por nombre o código')).toBeFocused()
})

test('«/» lleva al buscador y Enter añade el único resultado', async ({ page }) => {
  await seed()
  await login(page)
  await page.keyboard.press('/')
  await expect(page.getByLabel('Buscar por nombre o código')).toBeFocused()
  await page.keyboard.type('lap-002')
  await page.keyboard.press('Enter')
  await expect(bar(page)).toContainText('1 producto · 1 unidad')
  await expect(
    list(page).getByRole('group', { name: 'Cantidad de Laptop de 16 pulgadas en la proforma' }),
  ).toContainText('1')
})

test('sin conexión, generar avisa y conserva lo escrito', async ({ page }) => {
  await seed()
  await login(page)
  await addLaptop14(page)
  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  await dialog(page).getByLabel('Razón social o nombre').fill('Cliente sin conexión')
  await goOffline(page)
  await dialog(page).getByRole('button', { name: 'Generar proforma' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('Revisa tu conexión')
  await expect(dialog(page).getByLabel('Razón social o nombre')).toHaveValue(
    'Cliente sin conexión',
  )
})

test('sin los datos de la empresa, «Generar» lleva a completarlos y luego deja generar', async ({
  page,
}) => {
  await seed({ company: false })
  await login(page)
  await addLaptop14(page)
  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  await dialog(page).getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await expect(dialog(page).getByText(/Completa los datos de tu empresa/)).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Generar proforma' })).toBeDisabled()

  await dialog(page).getByRole('link', { name: 'Ir a Empresa' }).click()
  await expect(page).toHaveURL(/\/company$/)
  await page.getByLabel('Razón social', { exact: true }).fill('Empresa de Pruebas S.A.C.')
  await page.getByLabel('RUC', { exact: true }).fill('20000000001')
  await page.getByLabel('Dirección', { exact: true }).fill('Av. Prueba 123, Huamanga')
  await page.getByLabel('Teléfono 1').fill('066 312345')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()

  await page.getByRole('link', { name: 'Productos' }).click()
  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  await expect(dialog(page).getByLabel('Razón social o nombre')).toHaveValue('Cliente de prueba')
  await expect(dialog(page).getByRole('button', { name: 'Generar proforma' })).toBeEnabled()
})
```

- [ ] **Paso 9: Ejecutar las e2e**

Run: `pnpm test:e2e tests/e2e/proforma.spec.ts tests/e2e/company.spec.ts tests/e2e/catalog.spec.ts`
Expected: PASS en escritorio y en móvil, también las e2e del catálogo que ya existían.

- [ ] **Paso 10: Commit**

```bash
git add src/features/proforma/queries.ts src/features/proforma/hooks.ts src/features/proforma/components/proforma-panel.tsx src/features/proforma/components/proforma-dialog.tsx src/lib/use-return-focus.ts src/features/catalog/components/catalog-screen.tsx playwright.config.ts tests/components/proforma-panel.test.tsx tests/integration/proforma-prices.test.ts tests/e2e/proforma.spec.ts
git commit -m "feat: generate numbered proformas from the products screen"
```

---

### Tarea 13: Configuración, documentación y verificación final

**Archivos:**
- Modificar: `.env.example`, `docs/setup.md`, `docs/deployment.md`

**Interfaces:**
- Consume: todo lo anterior. No produce código nuevo.

- [ ] **Paso 1: Variable de entorno**

Añadir al final de `.env.example` (sin valores reales):

```bash

# Consulta de RUC en la proforma (api.decolecta.com). Solo servidor: nunca con NEXT_PUBLIC_.
# Sin valor, el RUC del cliente se escribe a mano.
DECOLECTA_TOKEN=
```

- [ ] **Paso 2: Guía de puesta en marcha**

Añadir en `docs/setup.md`, después de la sección «Variables de entorno»:

```md
## Consulta de RUC

La ventana «Completar proforma» consulta SUNAT con [Decolecta](https://decolecta.com) al escribir un RUC de 11 dígitos. La clave va en `DECOLECTA_TOKEN`, solo del servidor (nunca con `NEXT_PUBLIC_`), en `.env.development.local` o en `.env.local`. Sin ella, la consulta dice que no está disponible y los datos se escriben a mano. El plan gratuito da 1 000 consultas al mes.

Las pruebas e2e no usan el servicio real: Playwright arranca la app con `RUC_PROVIDER=stub`, que responde con datos de prueba (`20000000001` activo, `20000000010` de baja y no habido, `20000000036` sin servicio; cualquier otro RUC válido, no encontrado). Ese proveedor nunca se usa en producción.
```

- [ ] **Paso 3: Guía de despliegue**

En `docs/deployment.md`, sección «2. Vercel», añadir a la tabla de variables la fila:

```md
   | `DECOLECTA_TOKEN`                      | Clave de api.decolecta.com (RUC)      |
```

y sustituir «No añadas la clave secreta ni ninguna otra variable.» por:

```md
   No añadas la clave secreta de Supabase ni ninguna otra variable. `DECOLECTA_TOKEN` es opcional y solo la lee el servidor: sin ella, el RUC del cliente se escribe a mano.
```

En la sección «3. Comprobación después de publicar», añadir antes de la comprobación de claves secretas:

```md
- [ ] En «Empresa», los datos se guardan y la vista previa los muestra.
- [ ] En Productos, «Añadir», «Completar proforma» y «Generar proforma» asignan el número siguiente, y un RUC real completa la razón social.
```

Y al comienzo de la sección 3, este aviso:

```md
Antes de publicar esta versión, haz una copia de seguridad (sección 4) y aplica las migraciones nuevas con `pnpm db:push`: búsqueda sin tildes, datos de la empresa y numeración de proformas.
```

- [ ] **Paso 4: Verificación completa**

Run: `pnpm validate && pnpm test:integration && pnpm test:e2e`
Expected: lint, tipos, formato, pruebas unitarias y de componentes, build, integración y e2e (escritorio y móvil), todo en verde.

- [ ] **Paso 5: Commit**

```bash
git add .env.example docs/setup.md docs/deployment.md
git commit -m "docs: document RUC lookup and proforma deployment"
```
