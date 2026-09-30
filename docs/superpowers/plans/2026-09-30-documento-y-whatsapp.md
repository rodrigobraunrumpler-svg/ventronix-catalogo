# Documento PDF y envío por WhatsApp — Implementation Plan

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:executing-plans (ejecución inline: el usuario pidió no usar subagentes). Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Goal:** Descargar la proforma en un PDF idéntico a la pizarra A4 del prototipo y enviarla por WhatsApp con el mensaje ya escrito.

**Architecture:** Un modelo puro (`buildDocumentModel`) convierte la proforma y los datos de la empresa en textos listos para imprimir. Un componente de `@react-pdf/renderer` los dibuja en el servidor, dentro de una Server Action que comprueba la cuenta, valida con Zod y recalcula los totales. El navegador recibe el PDF, lo descarga, lo abre o lo comparte; nada se guarda.

**Tech Stack:** Next.js 16 (Server Actions), `@react-pdf/renderer` 4.9 (nueva), Zod, React 19.2 (`useEffectEvent`), Vitest + Testing Library, Playwright.

**Spec:** [Documento de la proforma y envío por WhatsApp](../specs/2026-09-30-documento-y-whatsapp-design.md). Referencia visual: pizarras «Proforma · Documento A4» y «Productos + proforma» (vista «generada») del [lienzo](https://claude.ai/artifact/7KjkXAw98vwSPa8hGesjfh).

## Global Constraints

- **El PDF y la vista «lista» deben verse igual que las pizarras del prototipo** (medidas en px × 0,75 = pt).
- Dinero en céntimos (`bigint`) con los módulos existentes (`totalsFromText`, `formatCents`, `TAX_CONFIG`); el servidor recalcula, no confía en totales del navegador.
- «Ningún secreto debe exponerse al cliente.» El paso 1 de WhatsApp no usa claves ni integraciones de servidor.
- Nada se guarda: ni PDFs ni proformas.
- Fechas en la zona de Lima; la fecha de la proforma queda fija al generar.
- Una sola dependencia nueva: `@react-pdf/renderer`. Fuentes OFL versionadas en el repo.
- Commits en `main`, con una sola línea de asunto: sin cuerpo y sin `Co-Authored-By`. Añadir archivos por nombre; `example-proforma.png` no se versiona.
- Pruebas solo contra el Supabase local.

## Review Focus

1. **Muchas líneas o descripciones largas:** el PDF pasa a varias páginas sin partir filas, repite la cabecera de la tabla y numera las páginas. Prueba en la tarea 4 y revisión visual en la 6.
2. **Tildes y «ñ»** en clientes, productos y empresa: se ven bien en el PDF y el nombre del archivo queda sin símbolos. Pruebas en las tareas 2 y 6.
3. **Bloqueo de ventanas del navegador:** «Vista previa» abre la pestaña antes de esperar al servidor, y la vista «lista» prepara el PDF al entrar. Prueba en la tarea 5.
4. **Borradores numerados antes de este cambio** (sin fecha guardada): se leen igual y la fecha se fija al volver a generar. Prueba en la tarea 3.
5. **Sin conexión al preparar el PDF:** mensaje y «Reintentar», sin perder la proforma. Prueba en la tarea 5.

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
| --- | --- | --- |
| `src/features/proforma/document/words.ts` | Importe en letras | 1 |
| `src/features/proforma/document/format.ts` | Fechas en Lima, nombre del archivo, mensaje y enlace de WhatsApp | 2 |
| `src/features/proforma/draft.ts` | `issuedAt` en el borrador | 3 |
| `src/features/proforma/document/input.ts` | Lo que viaja al servidor (Zod) y `GeneratedDocument` | 3 |
| `src/features/proforma/document/model.ts` | Textos del documento y motivos para no generarlo | 3 |
| `src/features/proforma/document/fonts/*` | Plus Jakarta Sans y JetBrains Mono (OFL) | 4 |
| `src/features/proforma/document/pdf.tsx` | Plantilla A4 con `@react-pdf/renderer` | 4 |
| `src/features/proforma/document/service.ts` | Genera el PDF con los datos de la empresa (solo servidor) | 4 |
| `src/features/proforma/actions.ts` | Server Action `generateProformaDocument` | 4 |
| `next.config.ts` | Incluir fuentes y logotipo en Vercel | 4 |
| `src/features/proforma/document/files.ts` | Descargar, abrir y compartir en el navegador | 5 |
| `src/features/proforma/components/proforma-ready.tsx` | Vista «Proforma N° 0001 lista» | 5 |
| `proforma-panel.tsx`, `proforma-editor.tsx`, `proforma-dialog.tsx` | Conexión y «Vista previa» | 5 |

---

### Task 1: Importe en letras

**Archivos:**
- Crear: `src/features/proforma/document/words.ts`
- Prueba: `tests/unit/document-words.test.ts`

**Interfaces:**
- Produce: `amountInWords(cents: bigint): string` → «SON: OCHO MIL CIENTO CATORCE CON 00/100 SOLES».

- [ ] **Paso 1: Escribir la prueba**

`tests/unit/document-words.test.ts`:

```ts
import { expect, it } from 'vitest'
import { amountInWords } from '@/features/proforma/document/words'

const words = (soles: string) => amountInWords(BigInt(soles.replace('.', '')))

it.each([
  ['0.50', 'SON: CERO CON 50/100 SOLES'],
  ['1.00', 'SON: UNO CON 00/100 SOLES'],
  ['16.00', 'SON: DIECISÉIS CON 00/100 SOLES'],
  ['21.00', 'SON: VEINTIUNO CON 00/100 SOLES'],
  ['22.00', 'SON: VEINTIDÓS CON 00/100 SOLES'],
  ['31.00', 'SON: TREINTA Y UNO CON 00/100 SOLES'],
  ['100.00', 'SON: CIEN CON 00/100 SOLES'],
  ['101.00', 'SON: CIENTO UNO CON 00/100 SOLES'],
  ['1000.00', 'SON: MIL CON 00/100 SOLES'],
  ['1001.00', 'SON: MIL UNO CON 00/100 SOLES'],
  ['21000.00', 'SON: VEINTIÚN MIL CON 00/100 SOLES'],
  ['31000.00', 'SON: TREINTA Y UN MIL CON 00/100 SOLES'],
  ['101000.00', 'SON: CIENTO UN MIL CON 00/100 SOLES'],
  ['1000000.00', 'SON: UN MILLÓN CON 00/100 SOLES'],
  ['1001000.00', 'SON: UN MILLÓN MIL CON 00/100 SOLES'],
  ['2500000.00', 'SON: DOS MILLONES QUINIENTOS MIL CON 00/100 SOLES'],
  ['21000000.00', 'SON: VEINTIÚN MILLONES CON 00/100 SOLES'],
  ['1000000000.00', 'SON: MIL MILLONES CON 00/100 SOLES'],
  ['8114.00', 'SON: OCHO MIL CIENTO CATORCE CON 00/100 SOLES'],
  ['899.99', 'SON: OCHOCIENTOS NOVENTA Y NUEVE CON 99/100 SOLES'],
  [
    '124887510.00',
    'SON: CIENTO VEINTICUATRO MILLONES OCHOCIENTOS OCHENTA Y SIETE MIL QUINIENTOS DIEZ CON 00/100 SOLES',
  ],
  [
    '9999999999.99',
    'SON: NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE CON 99/100 SOLES',
  ],
])('%s', (soles, expected) => {
  expect(words(soles)).toBe(expected)
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/document-words.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/document/words`.

- [ ] **Paso 3: Implementar**

`src/features/proforma/document/words.ts`:

```ts
// Importe en letras del documento (spec del documento §5): mayúsculas con tildes, hasta el tope de
// la proforma (menos de S/ 10 000 000 000).
const UNITS = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE',
  'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS',
  'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
]
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const HUNDREDS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS',
  'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
]

// 1 a 999.
function hundreds(n: number) {
  if (n === 100) return 'CIEN'
  const words = n >= 100 ? [HUNDREDS[Math.floor(n / 100)]] : []
  const rest = n % 100
  if (rest >= 30) {
    const unit = rest % 10
    words.push(unit ? `${TENS[Math.floor(rest / 10)]} Y ${UNITS[unit]}` : TENS[rest / 10])
  } else if (rest > 0) {
    words.push(UNITS[rest])
  }
  return words.join(' ')
}

// Delante de MIL o de MILLONES: «UN», «VEINTIÚN», «TREINTA Y UN».
const shortened = (words: string) => words.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN')

// 1 a 999 999.
function thousands(n: number) {
  const high = Math.floor(n / 1000)
  const low = n % 1000
  const words = high === 0 ? [] : high === 1 ? ['MIL'] : [`${shortened(hundreds(high))} MIL`]
  if (low) words.push(hundreds(low))
  return words.join(' ')
}

function integerWords(n: number) {
  if (n === 0) return 'CERO'
  const millions = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  const words =
    millions === 0
      ? []
      : millions === 1
        ? ['UN MILLÓN']
        : [`${shortened(thousands(millions))} MILLONES`]
  if (rest) words.push(thousands(rest))
  return words.join(' ')
}

export function amountInWords(cents: bigint) {
  const soles = Number(cents / BigInt(100))
  const fraction = String(cents % BigInt(100)).padStart(2, '0')
  return `SON: ${integerWords(soles)} CON ${fraction}/100 SOLES`
}
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/document-words.test.ts`
Expected: PASS (22 casos).

- [ ] **Paso 5: Commit**

```bash
git add src/features/proforma/document/words.ts tests/unit/document-words.test.ts
git commit -m "feat: write proforma totals in words"
```

---

### Task 2: Fechas, nombre del archivo y mensaje de WhatsApp

**Archivos:**
- Crear: `src/features/proforma/document/format.ts`
- Prueba: `tests/unit/document-format.test.ts`

**Interfaces:**
- Consume: `digitsOnly` (`src/lib/peru.ts`).
- Produce: `documentDates(issuedAt: Date, validityDays: number): { date: string; validUntil: string }` (dd/mm/aaaa, Lima), `documentFileName(number: number | null, clientName: string): string`, `whatsappMessage(input: { clientName; numberLabel; total; validUntil; sender }): string`, `whatsappLink(phone: string, message: string): string`.

- [ ] **Paso 1: Escribir la prueba**

`tests/unit/document-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  documentDates,
  documentFileName,
  whatsappLink,
  whatsappMessage,
} from '@/features/proforma/document/format'

describe('documentDates', () => {
  it('usa el día de Lima aunque en UTC ya sea el siguiente', () => {
    expect(documentDates(new Date('2026-10-01T03:00:00Z'), 7)).toEqual({
      date: '30/09/2026',
      validUntil: '07/10/2026',
    })
  })

  it('cruza meses y años', () => {
    expect(documentDates(new Date('2026-12-28T15:00:00Z'), 7)).toEqual({
      date: '28/12/2026',
      validUntil: '04/01/2027',
    })
  })
})

describe('documentFileName', () => {
  it.each([
    [1, 'Cliente de ejemplo S.A.C.', 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf'],
    [12345, 'Ñandú & Cía. E.I.R.L.', 'Proforma-12345-Nandu-Cia-EIRL.pdf'],
    [null, 'José Pérez', 'Proforma-borrador-Jose-Perez.pdf'],
    [7, '***', 'Proforma-0007.pdf'],
  ])('%s · %s', (number, client, expected) => {
    expect(documentFileName(number, client)).toBe(expected)
  })
})

describe('WhatsApp', () => {
  const message = whatsappMessage({
    clientName: 'Cliente de ejemplo S.A.C.',
    numberLabel: 'N° 0001',
    total: 'S/ 8,114.00',
    validUntil: '07/10/2026',
    sender: 'Ventronix',
  })

  it('escribe el saludo, el número, el total y la validez sin doble punto', () => {
    expect(message).toBe(
      'Hola, Cliente de ejemplo S.A.C. Le envío la proforma N° 0001 por S/ 8,114.00, válida hasta el 07/10/2026. Quedamos atentos. — Ventronix',
    )
  })

  it('abre el chat del celular peruano con el mensaje', () => {
    expect(whatsappLink('987 654 321', 'Hola, ¿qué tal?')).toBe(
      'https://wa.me/51987654321?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F',
    )
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project unit tests/unit/document-format.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/document/format`.

- [ ] **Paso 3: Implementar**

`src/features/proforma/document/format.ts`:

```ts
import { digitsOnly } from '@/lib/peru'

const LIMA = 'America/Lima'
const pad = (n: number) => String(n).padStart(2, '0')
const dmy = (date: Date) =>
  `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`

// Día en Lima de un instante (UTC−5, sin horario de verano).
function limaDay(instant: Date) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(instant)
    .split('-')
    .map(Number)
  return { year, month, day }
}

// Fecha de la proforma y «Válida hasta» (spec del documento §3), en días de Lima.
export function documentDates(issuedAt: Date, validityDays: number) {
  const { year, month, day } = limaDay(issuedAt)
  return {
    date: dmy(new Date(Date.UTC(year, month - 1, day))),
    validUntil: dmy(new Date(Date.UTC(year, month - 1, day + validityDays))),
  }
}

// «Cliente de ejemplo S.A.C.» → «Proforma-0001-Cliente-de-ejemplo-SAC.pdf»: sin tildes ni símbolos.
export function documentFileName(number: number | null, clientName: string) {
  const slug = clientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const id = number === null ? 'borrador' : String(number).padStart(4, '0')
  return `Proforma-${id}${slug ? `-${slug}` : ''}.pdf`
}

type WhatsappMessageInput = {
  clientName: string
  numberLabel: string
  total: string
  validUntil: string
  sender: string
}

// Mensaje ya escrito (spec del documento §7). Sin doble punto si el nombre termina en «S.A.C.».
export function whatsappMessage({
  clientName,
  numberLabel,
  total,
  validUntil,
  sender,
}: WhatsappMessageInput) {
  const name = clientName.trim().replace(/\.+$/, '')
  return `Hola, ${name}. Le envío la proforma ${numberLabel} por ${total}, válida hasta el ${validUntil}. Quedamos atentos. — ${sender}`
}

// Chat del cliente en WhatsApp con el mensaje: código de Perú delante del celular.
export const whatsappLink = (phone: string, message: string) =>
  `https://wa.me/51${digitsOnly(phone)}?text=${encodeURIComponent(message)}`
```

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project unit tests/unit/document-format.test.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

```bash
git add src/features/proforma/document/format.ts tests/unit/document-format.test.ts
git commit -m "feat: format proforma dates, file names and WhatsApp messages"
```

---
### Task 3: Fecha en el borrador y modelo del documento

**Archivos:**
- Modificar: `src/features/proforma/draft.ts` (`issuedAt` y `setNumber`), `src/features/proforma/components/proforma-panel.tsx` (fijar la fecha al generar)
- Crear: `src/features/proforma/document/input.ts`, `src/features/proforma/document/model.ts`
- Pruebas: `tests/unit/proforma-draft.test.ts` (ampliar), `tests/unit/document-model.test.ts`

**Interfaces:**
- Consume: tareas 1 y 2; `totalsFromText`, `formatCents`, `parseCents`, `parsePercent`, `ZERO`, `TAX_CONFIG`, `formatProformaNumber`, `clientErrors`, `validityError` (proforma); `missingCompanyFields`, `walletLabel`, `formatMobile` (empresa); `documentKind`, `digitsOnly`.
- Produce: `ProformaDraft.issuedAt: string | null`; `setNumber(draft, number, issuedAt)`; `documentInputSchema`, `DocumentInput`, `GeneratedDocument = { fileName: string; base64: string }`, `documentInput(draft, { draft }): DocumentInput`; `DocumentModel`, `documentProblem(input, company): string | null`, `buildDocumentModel(input, company, now): DocumentModel`.

- [ ] **Paso 1: Escribir las pruebas**

Añadir al final de `tests/unit/proforma-draft.test.ts`, dentro de `describe('proforma en curso')`, y añadir `setNumber` al import de `@/features/proforma/draft`:

```ts
  it('al generar guarda el número y fija la fecha', () => {
    const draft = setNumber(EMPTY_DRAFT, 7, '2026-09-30T15:00:00.000Z')
    expect(draft).toMatchObject({ number: 7, issuedAt: '2026-09-30T15:00:00.000Z' })
  })

  it('lee borradores guardados antes de que existiera la fecha', () => {
    const { issuedAt, ...older } = { ...EMPTY_DRAFT, number: 3 }
    expect(issuedAt).toBeNull()
    expect(draftSchema.parse(older)).toMatchObject({ number: 3, issuedAt: null })
  })
```

`tests/unit/document-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CompanyProfile } from '@/features/company/schemas'
import { buildDocumentModel, documentProblem } from '@/features/proforma/document/model'
import { documentInput, type DocumentInput } from '@/features/proforma/document/input'
import { EMPTY_DRAFT } from '@/features/proforma/draft'
import { completeCompany, e1Lines } from '../support/proforma'

const company: CompanyProfile = {
  ...completeCompany,
  trade_name: 'Ventronix',
  phones: ['066 312345', '987654321'],
  email: 'ventas@ventronix.pe',
  payment_terms: 'Contado contra entrega.',
  return_policy: 'Cambios dentro de los 7 días.',
  bank_accounts: [
    { bank: 'BCP', account: '191-1234567-0-12', cci: '00219100123456701254', holder: null },
  ],
  wallets: [{ kind: 'ambos', number: '987654321' }],
}

const client = {
  name: 'Cliente de ejemplo S.A.C.',
  document: '20000000001',
  phone: '900000000',
  address: 'Av. Ejemplo 123, Huamanga',
  deliveryTime: '3 días hábiles',
}

// El ejemplo E1 de la spec de la proforma, ya generado con el número 1.
const e1: DocumentInput = documentInput(
  {
    ...EMPTY_DRAFT,
    lines: e1Lines,
    client,
    discountPercent: '5',
    shipping: '20',
    number: 1,
    issuedAt: '2026-09-30T15:00:00.000Z',
  },
  { draft: false },
)
const now = new Date('2026-10-02T15:00:00Z')

describe('buildDocumentModel', () => {
  it('arma todos los textos del documento del ejemplo E1', () => {
    expect(buildDocumentModel(e1, company, now)).toEqual({
      draft: false,
      title: 'Proforma N° 0001',
      author: 'Ventronix',
      fileName: 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf',
      numberLabel: 'N° 0001',
      date: '30/09/2026',
      validUntil: '07/10/2026',
      company: [
        { label: 'RUC', value: '20000000001' },
        { label: 'Dirección', value: 'Av. Prueba 123, Huamanga' },
        { label: 'Teléfono', value: '066 312 345 / 987 654 321' },
        { label: 'Correo', value: 'ventas@ventronix.pe' },
      ],
      client: [
        { label: 'Cliente', value: 'Cliente de ejemplo S.A.C.', strong: true },
        { label: 'RUC', value: '20000000001', strong: false },
        { label: 'Dirección', value: 'Av. Ejemplo 123, Huamanga', strong: false },
        { label: 'Celular', value: '900 000 000', strong: false },
        { label: 'Tiempo de entrega', value: '3 días hábiles', strong: false },
      ],
      rows: [
        {
          quantity: '2',
          code: 'LAP-001',
          name: 'Laptop de 14 pulgadas',
          description: null,
          unitPrice: '2,590.00',
          total: '5,180.00',
        },
        {
          quantity: '1',
          code: 'IMP-001',
          name: 'Impresora láser',
          description: null,
          unitPrice: '850.00',
          total: '850.00',
        },
        {
          quantity: '1',
          code: 'CMP-001',
          name: 'Computadora de escritorio',
          description: null,
          unitPrice: '2,490.00',
          total: '2,490.00',
        },
      ],
      adjustments: [
        { label: 'Total parcial', value: 'S/ 8,520.00' },
        { label: 'Descuento (5%)', value: '− S/ 426.00' },
        { label: 'Neto', value: 'S/ 8,094.00' },
        { label: 'Envío', value: 'S/ 20.00' },
      ],
      total: 'S/ 8,114.00',
      taxNote: 'Precios incluyen IGV · Op. gravada S/ 6,876.27 · IGV (18%) S/ 1,237.73',
      amountInWords: 'SON: OCHO MIL CIENTO CATORCE CON 00/100 SOLES',
      terms: [
        'Validez de la oferta: 7 días.',
        'Contado contra entrega.',
        'Cambios dentro de los 7 días.',
      ],
      payments: [
        {
          text: 'BCP · Cta. 191-1234567-0-12 · CCI 00219100123456701254 · Empresa de Pruebas S.A.C.',
          strong: false,
        },
        { text: 'Yape / Plin: 987 654 321', strong: true },
      ],
    })
  })

  it('sin descuento ni envío solo muestra el total; con DNI lo nombra', () => {
    const model = buildDocumentModel(
      { ...e1, discountPercent: '', shipping: '', client: { ...client, document: '12345678' } },
      company,
      now,
    )
    expect(model.adjustments).toEqual([])
    expect(model.client[1]).toEqual({ label: 'DNI', value: '12345678', strong: false })
  })

  it('el borrador lleva marca, sin número de archivo y con la fecha de hoy', () => {
    const model = buildDocumentModel(
      { ...e1, draft: true, number: null, issuedAt: null },
      company,
      now,
    )
    expect(model).toMatchObject({
      draft: true,
      numberLabel: null,
      title: 'Proforma (borrador)',
      fileName: 'Proforma-borrador-Cliente-de-ejemplo-SAC.pdf',
      date: '02/10/2026',
    })
  })
})

describe('documentProblem', () => {
  it('deja generar el ejemplo completo', () => {
    expect(documentProblem(e1, company)).toBeNull()
  })

  it('pide los datos de la empresa y del cliente para el documento final', () => {
    expect(documentProblem(e1, { ...company, ruc: null })).toBe(
      'Completa los datos de tu empresa antes de generar el documento.',
    )
    expect(documentProblem({ ...e1, client: { ...client, name: ' ' } }, company)).toBe(
      'Completa los datos del cliente.',
    )
  })

  it('el borrador solo necesita cifras válidas', () => {
    const draft = { ...e1, draft: true, number: null, client: { ...client, name: '' } }
    expect(documentProblem(draft, { ...company, ruc: null })).toBeNull()
    expect(documentProblem({ ...draft, discountPercent: '100' }, company)).toBe(
      'Revisa las cantidades, los precios y los totales.',
    )
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `pnpm vitest run --project unit tests/unit/proforma-draft.test.ts tests/unit/document-model.test.ts`
Expected: FAIL: `setNumber` no acepta la fecha y no existe `@/features/proforma/document/model`.

- [ ] **Paso 3: Guardar la fecha en el borrador**

En `src/features/proforma/draft.ts`:

1. En `draftSchema`, después de `number: …`, añadir:

```ts
  // Fecha al generar (ISO). Los borradores anteriores no la tienen: se lee como null.
  issuedAt: z.string().nullable().default(null),
```

2. En `EMPTY_DRAFT`, después de `number: null,`, añadir `issuedAt: null,`.

3. Sustituir `setNumber` por:

```ts
// El número y la fecha se fijan juntos al generar: «Corregir» conserva ambos (spec §6.3).
export const setNumber = (
  draft: ProformaDraft,
  number: number,
  issuedAt: string,
): ProformaDraft => ({ ...draft, number, issuedAt })
```

En `src/features/proforma/components/proforma-panel.tsx`, dentro de `generate()`, sustituir:

```tsx
      update((current) => setNumber(current, result.data))
    }
```

por:

```tsx
      update((current) => setNumber(current, result.data, new Date().toISOString()))
    } else if (draft.issuedAt === null) {
      // Proformas numeradas antes de guardar la fecha: se fija ahora.
      const number = draft.number
      update((current) => setNumber(current, number, new Date().toISOString()))
    }
```

- [ ] **Paso 4: Implementar la entrada y el modelo**

`src/features/proforma/document/input.ts`:

```ts
import { z } from 'zod'
import type { ProformaDraft } from '../draft'
import { MAX_QUANTITY } from '../totals'

const text = (max: number) => z.string().max(max)

// Lo que viaja al servidor para generar el documento. El servidor lo valida y recalcula todo.
export const documentInputSchema = z.object({
  draft: z.boolean(),
  number: z.number().int().positive().nullable(),
  issuedAt: z.iso.datetime().nullable(),
  lines: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).nullable(),
        unitPrice: text(20),
        quantity: z.number().int().min(1).max(MAX_QUANTITY),
      }),
    )
    .min(1)
    .max(300),
  client: z.object({
    name: text(200),
    document: text(11),
    phone: text(11),
    address: text(300),
    deliveryTime: text(120),
  }),
  validityDays: text(3),
  discountPercent: text(10),
  shipping: text(20),
})

export type DocumentInput = z.infer<typeof documentInputSchema>

// El PDF viaja en base64 dentro de la respuesta de la Server Action.
export type GeneratedDocument = { fileName: string; base64: string }

export function documentInput(draft: ProformaDraft, options: { draft: boolean }): DocumentInput {
  return {
    draft: options.draft,
    number: draft.number,
    issuedAt: draft.issuedAt,
    lines: draft.lines.map(({ code, name, description, unitPrice, quantity }) => ({
      code,
      name,
      description,
      unitPrice,
      quantity,
    })),
    client: draft.client,
    validityDays: draft.validityDays,
    discountPercent: draft.discountPercent,
    shipping: draft.shipping,
  }
}
```

`src/features/proforma/document/model.ts`:

```ts
import { formatMobile, missingCompanyFields, walletLabel } from '@/features/company/format'
import type { CompanyProfile } from '@/features/company/schemas'
import { digitsOnly, documentKind } from '@/lib/peru'
import { formatCents, parseCents, parsePercent, ZERO } from '../money'
import { formatProformaNumber } from '../number'
import { clientErrors, validityError } from '../readiness'
import { TAX_CONFIG } from '../tax'
import { totalsFromText } from '../totals'
import { documentDates, documentFileName } from './format'
import type { DocumentInput } from './input'
import { amountInWords } from './words'

type Pair = { label: string; value: string }

// Textos del documento, listos para dibujar (spec del documento §4).
export type DocumentModel = {
  draft: boolean
  title: string
  author: string
  fileName: string
  numberLabel: string | null
  date: string
  validUntil: string
  company: Pair[]
  client: (Pair & { strong: boolean })[]
  rows: {
    quantity: string
    code: string
    name: string
    description: string | null
    unitPrice: string
    total: string
  }[]
  adjustments: Pair[]
  total: string
  taxNote: string | null
  amountInWords: string
  terms: string[]
  payments: { text: string; strong: boolean }[]
}

const money = (cents: bigint) => `S/ ${formatCents(cents)}`

// Celulares de 9 dígitos agrupados («987 654 321»); lo demás, tal como se escribió.
function phoneLabel(value: string) {
  const digits = digitsOnly(value)
  return digits.length === 9 ? formatMobile(digits) : value.trim()
}

// 5 → «5%», 12,5 → «12.5%».
const percentLabel = (text: string) => `${(parsePercent(text) ?? 0) / 100}%`

// Por qué no se puede generar el documento; null si se puede (spec del documento §8). El borrador
// solo necesita cifras válidas: sirve para ver cómo va quedando.
export function documentProblem(input: DocumentInput, company: CompanyProfile) {
  const totals = totalsFromText(input)
  if (!totals || totals.total <= ZERO || !totals.withinLimit) {
    return 'Revisa las cantidades, los precios y los totales.'
  }
  if (input.draft) return null
  if (missingCompanyFields(company).length > 0) {
    return 'Completa los datos de tu empresa antes de generar el documento.'
  }
  const client = clientErrors(input.client)
  if (client.name || client.document || client.phone || validityError(input.validityDays)) {
    return 'Completa los datos del cliente.'
  }
  if (input.number === null) return 'Genera la proforma para asignarle su número.'
  return null
}

export function buildDocumentModel(
  input: DocumentInput,
  company: CompanyProfile,
  now: Date,
): DocumentModel {
  const totals = totalsFromText(input)
  if (!totals) throw new Error('La proforma no es válida.')
  const validityDays = Number(input.validityDays || company.default_validity_days)
  const issued = input.issuedAt ? new Date(input.issuedAt) : now
  const { date, validUntil } = documentDates(issued, validityDays)
  const numberLabel = input.number === null ? null : formatProformaNumber(input.number)
  const hasDiscount = totals.discount > ZERO
  const hasShipping = totals.shipping > ZERO
  const tax = totals.pricesIncludeTax ? ['Precios incluyen IGV'] : []
  if (totals.showBreakdown) {
    tax.push(`Op. gravada ${money(totals.base)}`, `IGV (${TAX_CONFIG.ratePercent}%) ${money(totals.tax)}`)
  }

  return {
    draft: input.draft,
    title: numberLabel ? `Proforma ${numberLabel}` : 'Proforma (borrador)',
    author: company.trade_name || company.legal_name || 'Ventronix',
    fileName: documentFileName(input.draft ? null : input.number, input.client.name),
    numberLabel,
    date,
    validUntil,
    company: [
      { label: 'RUC', value: company.ruc ?? '' },
      { label: 'Dirección', value: company.address ?? '' },
      { label: 'Teléfono', value: company.phones.map(phoneLabel).join(' / ') },
      { label: 'Correo', value: company.email ?? '' },
    ].filter((item) => item.value),
    client: [
      { label: 'Cliente', value: input.client.name.trim(), strong: true },
      {
        label: documentKind(input.client.document) === 'dni' ? 'DNI' : 'RUC',
        value: input.client.document,
        strong: false,
      },
      { label: 'Dirección', value: input.client.address.trim(), strong: false },
      { label: 'Celular', value: phoneLabel(input.client.phone), strong: false },
      { label: 'Tiempo de entrega', value: input.client.deliveryTime.trim(), strong: false },
    ].filter((item) => item.value),
    rows: input.lines.map((line, index) => ({
      quantity: String(line.quantity),
      code: line.code,
      name: line.name,
      description: line.description?.trim() || null,
      unitPrice: formatCents(parseCents(line.unitPrice) ?? ZERO),
      total: formatCents(totals.lineTotals[index]),
    })),
    adjustments: [
      ...(hasDiscount || hasShipping ? [{ label: 'Total parcial', value: money(totals.subtotal) }] : []),
      ...(hasDiscount
        ? [
            {
              label: `Descuento (${percentLabel(input.discountPercent)})`,
              value: `− ${money(totals.discount)}`,
            },
            { label: 'Neto', value: money(totals.net) },
          ]
        : []),
      ...(hasShipping ? [{ label: 'Envío', value: money(totals.shipping) }] : []),
    ],
    total: money(totals.total),
    taxNote: tax.length > 0 ? tax.join(' · ') : null,
    amountInWords: amountInWords(totals.total),
    terms: [
      `Validez de la oferta: ${validityDays} días.`,
      company.payment_terms,
      company.return_policy,
    ].filter((term): term is string => Boolean(term)),
    payments: [
      ...company.bank_accounts.map((account) => ({
        text: `${account.bank} · Cta. ${account.account} · CCI ${account.cci} · ${account.holder ?? company.legal_name ?? ''}`,
        strong: false,
      })),
      ...company.wallets.map((wallet) => ({
        text: `${walletLabel(wallet.kind)}: ${formatMobile(wallet.number)}`,
        strong: true,
      })),
    ],
  }
}
```

- [ ] **Paso 5: Ejecutar y ver que pasan**

Run: `pnpm vitest run --project unit tests/unit/proforma-draft.test.ts tests/unit/document-model.test.ts && pnpm typecheck`
Expected: PASS y sin errores de tipos. Si `pnpm typecheck` marca los usos antiguos de `setNumber(current, n)`, ya se cambiaron en el panel; no hay otros.

- [ ] **Paso 6: Commit**

```bash
git add src/features/proforma/draft.ts src/features/proforma/components/proforma-panel.tsx src/features/proforma/document/input.ts src/features/proforma/document/model.ts tests/unit/proforma-draft.test.ts tests/unit/document-model.test.ts
git commit -m "feat: build the proforma document model"
```

---

### Task 4: El PDF en el servidor

**Archivos:**
- Instalar: `@react-pdf/renderer`
- Crear: `src/features/proforma/document/fonts/` (TTF + licencias), `src/features/proforma/document/pdf.tsx`, `src/features/proforma/document/service.ts`
- Modificar: `src/features/proforma/actions.ts` (Server Action), `next.config.ts` (archivos para Vercel)
- Prueba: `tests/integration/proforma-document.test.ts`

**Interfaces:**
- Consume: `DocumentModel`, `buildDocumentModel`, `documentProblem`, `documentInputSchema`, `DocumentInput`, `GeneratedDocument` (tarea 3); `getCompanyProfile` (empresa); `withOwner`, `failure`, `invalid`.
- Produce: `ProformaPdf` y `renderProformaPdf(model): Promise<Buffer>` (solo servidor); `createProformaDocument(supabase, input, now?): Promise<ActionResult<GeneratedDocument>>` (solo servidor); Server Action `generateProformaDocument(input: unknown): Promise<ActionResult<GeneratedDocument>>`.

- [ ] **Paso 1: Escribir la prueba de integración**

`tests/integration/proforma-document.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentInput } from '@/features/proforma/document/input'
import { createProformaDocument } from '@/features/proforma/document/service'
import { ensureUser, signedInClient } from '../support/local-supabase'
import { connect, fillCompanyProfile, resetCompanyProfile } from './db'

const password = 'documento-clave-123'
const owner = { email: 'documento-owner@catalogo.test', appMetadata: { catalog_access: 'owner' } }

let db: Client
let supabase: SupabaseClient

beforeAll(async () => {
  db = await connect()
  await ensureUser({ password, ...owner })
  supabase = await signedInClient(owner.email, password)
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await resetCompanyProfile(db)
  await fillCompanyProfile(db)
})

const line = (index: number) => ({
  code: `LAP-${String(index).padStart(3, '0')}`,
  name: `Laptop de 14 pulgadas modelo ${index}`,
  description: 'Diseño ligero · 16 GB RAM · SSD de 512 GB · garantía de un año con el fabricante',
  unitPrice: '2590.00',
  quantity: 1,
})

const input = (overrides: Partial<DocumentInput> = {}): DocumentInput => ({
  draft: false,
  number: 1,
  issuedAt: '2026-09-30T15:00:00.000Z',
  lines: [line(1)],
  client: {
    name: 'Cliente de ejemplo S.A.C.',
    document: '20000000001',
    phone: '900000000',
    address: '',
    deliveryTime: '',
  },
  validityDays: '',
  discountPercent: '',
  shipping: '',
  ...overrides,
})

// Cuenta las páginas del PDF (los diccionarios de página no van comprimidos).
const pages = (pdf: Buffer) => pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0

async function generate(value: DocumentInput) {
  const result = await createProformaDocument(supabase, value)
  if (!result.ok) throw new Error(result.error.message)
  return { fileName: result.data.fileName, pdf: Buffer.from(result.data.base64, 'base64') }
}

describe('documento PDF de la proforma', () => {
  it('genera un PDF de una página con su nombre de archivo', async () => {
    const { fileName, pdf } = await generate(input())
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pages(pdf)).toBe(1)
    expect(fileName).toBe('Proforma-0001-Cliente-de-ejemplo-SAC.pdf')
  })

  it('pasa a varias páginas con muchas líneas', async () => {
    const lines = Array.from({ length: 40 }, (_, index) => line(index + 1))
    const { pdf } = await generate(input({ lines }))
    expect(pages(pdf)).toBeGreaterThanOrEqual(2)
  })

  it('genera el borrador aunque falte el cliente', async () => {
    const draft = input({
      draft: true,
      number: null,
      issuedAt: null,
      client: { name: '', document: '', phone: '', address: '', deliveryTime: '' },
    })
    expect((await generate(draft)).fileName).toBe('Proforma-borrador.pdf')
  })

  it('rechaza el documento final si la empresa está incompleta', async () => {
    await resetCompanyProfile(db)
    expect(await createProformaDocument(supabase, input())).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Completa los datos de tu empresa antes de generar el documento.',
      },
    })
  })

  it('rechaza una proforma con un total no válido', async () => {
    expect(await createProformaDocument(supabase, input({ discountPercent: '100' }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: 'Revisa las cantidades, los precios y los totales.' },
    })
  })
})
```

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `pnpm vitest run --project integration tests/integration/proforma-document.test.ts`
Expected: FAIL, no se puede resolver `@/features/proforma/document/service`.

- [ ] **Paso 3: Instalar la librería y las fuentes**

Run: `pnpm add @react-pdf/renderer`
Expected: se añade `@react-pdf/renderer` 4.x a `dependencies`.

Descargar las fuentes estáticas de Google Fonts (OFL) y sus licencias:

```bash
mkdir -p src/features/proforma/document/fonts
node -e '
const { writeFileSync } = require("node:fs")
const dir = "src/features/proforma/document/fonts"
const families = [
  ["Plus Jakarta Sans", "PlusJakartaSans", [400, 600, 700, 800], "plusjakartasans"],
  ["JetBrains Mono", "JetBrainsMono", [400, 700], "jetbrainsmono"],
]
;(async () => {
  for (const [family, file, weights, slug] of families) {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weights.join(";")}`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" } })).text()
    for (const block of css.split("@font-face").slice(1)) {
      const weight = /font-weight:\s*(\d+)/.exec(block)[1]
      const url = /url\((https:[^)]+\.ttf)\)/.exec(block)[1]
      writeFileSync(`${dir}/${file}-${weight}.ttf`, Buffer.from(await (await fetch(url)).arrayBuffer()))
    }
    writeFileSync(`${dir}/${file}-OFL.txt`, await (await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${slug}/OFL.txt`)).text())
  }
})()
'
ls src/features/proforma/document/fonts
```

Expected: `JetBrainsMono-400.ttf`, `JetBrainsMono-700.ttf`, `JetBrainsMono-OFL.txt`, `PlusJakartaSans-400.ttf`, `PlusJakartaSans-600.ttf`, `PlusJakartaSans-700.ttf`, `PlusJakartaSans-800.ttf` y `PlusJakartaSans-OFL.txt`.

- [ ] **Paso 4: Implementar la plantilla, el servicio y la Server Action**

`src/features/proforma/document/pdf.tsx`:

```tsx
import 'server-only'
import path from 'node:path'
import {
  Document,
  Font,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import type { DocumentModel } from './model'

const fonts = path.join(process.cwd(), 'src/features/proforma/document/fonts')
const logo = path.join(process.cwd(), 'public/brand/ventronix-wordmark.png')

Font.register({
  family: 'Jakarta',
  fonts: [400, 600, 700, 800].map((fontWeight) => ({
    src: path.join(fonts, `PlusJakartaSans-${fontWeight}.ttf`),
    fontWeight,
  })),
})
Font.register({
  family: 'JetBrainsMono',
  fonts: [400, 700].map((fontWeight) => ({
    src: path.join(fonts, `JetBrainsMono-${fontWeight}.ttf`),
    fontWeight,
  })),
})
// Las palabras no se cortan con guion: las descripciones se parten entre palabras.
Font.registerHyphenationCallback((word) => [word])

// Colores y medidas de la pizarra «Proforma · Documento A4» (1 px = 0,75 pt).
const color = {
  ink: '#121511',
  text: '#2a3027',
  muted: '#5d6559',
  line: '#e3e7de',
  lime: '#72ce0b',
  soft: '#d6dbd2',
}
const SIDE = 30
// Hueco arriba de cada página para repetir la cabecera de la tabla desde la segunda página. La
// franja negra de la primera página lo ocupa con un margen negativo.
const REPEAT = 36

const s = StyleSheet.create({
  page: {
    fontFamily: 'Jakarta',
    fontSize: 9.75,
    color: color.ink,
    lineHeight: 1.5,
    paddingTop: REPEAT,
    paddingBottom: 48,
  },
  watermark: {
    position: 'absolute',
    top: 360,
    left: 40,
    fontSize: 110,
    fontWeight: 800,
    color: color.lime,
    opacity: 0.12,
    transform: 'rotate(-30deg)',
  },
  repeatHead: { position: 'absolute', top: 12, left: SIDE, right: SIDE },
  header: {
    marginTop: -REPEAT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
    paddingVertical: 19.5,
    paddingHorizontal: SIDE,
  },
  logo: { width: 174 },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { color: '#ffffff', fontSize: 19.5, fontWeight: 800, letterSpacing: 1.56 },
  headerNumber: { color: color.lime, fontFamily: 'JetBrainsMono', fontSize: 13.5, fontWeight: 700 },
  headerDate: { color: color.soft, fontSize: 9 },
  companyRow: {
    flexDirection: 'row',
    paddingVertical: 10.5,
    paddingHorizontal: SIDE,
    borderBottomWidth: 0.75,
    borderBottomColor: color.line,
  },
  companyItem: { flex: 1, paddingRight: 9 },
  label: { fontSize: 8.25, color: color.muted },
  semibold: { fontWeight: 600 },
  bold: { fontWeight: 700 },
  client: {
    marginTop: 15,
    marginHorizontal: SIDE,
    paddingTop: 12,
    paddingBottom: 4.5,
    paddingHorizontal: 13.5,
    borderWidth: 0.75,
    borderColor: color.line,
    borderRadius: 7.5,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  clientLeft: { width: '60%', paddingRight: 18, marginBottom: 7.5 },
  clientRight: { width: '40%', marginBottom: 7.5 },
  clientValue: { fontSize: 10.5 },
  table: { marginTop: 15, marginHorizontal: SIDE },
  thead: { flexDirection: 'row', backgroundColor: '#000000' },
  th: {
    color: '#ffffff',
    fontSize: 8.25,
    fontWeight: 700,
    letterSpacing: 0.5,
    paddingVertical: 6.75,
    paddingHorizontal: 7.5,
  },
  row: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: color.line },
  td: { paddingVertical: 8.25, paddingHorizontal: 7.5 },
  quantity: { width: 42 },
  code: { width: 64.5 },
  mono: { fontFamily: 'JetBrainsMono', fontSize: 9 },
  description: { flex: 1 },
  unit: { width: 78, textAlign: 'right' },
  lineTotal: { width: 84, textAlign: 'right' },
  detail: { fontSize: 9, color: color.muted },
  totals: { marginTop: 13.5, marginHorizontal: SIDE, alignItems: 'flex-end' },
  totalsBox: { width: 225 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4.5 },
  totalsLabel: { color: color.text },
  totalBand: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
    borderRadius: 6,
    paddingVertical: 7.5,
    paddingHorizontal: 9,
  },
  totalLabel: { color: '#ffffff', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.42 },
  totalValue: { color: color.lime, fontSize: 13.5, fontWeight: 800 },
  taxNote: { marginTop: 1.5, fontSize: 8.25, color: color.muted, textAlign: 'right' },
  words: {
    width: 300,
    marginTop: 4.5,
    fontSize: 8.25,
    fontWeight: 600,
    color: color.text,
    textAlign: 'right',
  },
  bottom: {
    marginTop: 19.5,
    marginHorizontal: SIDE,
    paddingTop: 13.5,
    borderTopWidth: 0.75,
    borderTopColor: color.line,
    flexDirection: 'row',
  },
  terms: { flex: 1.3, paddingRight: 18 },
  payments: { flex: 1 },
  heading: { fontSize: 9.75, fontWeight: 700, marginBottom: 6 },
  item: { fontSize: 9, color: color.text, marginBottom: 2.25 },
  thanks: {
    position: 'absolute',
    bottom: 18,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 9.75,
    fontWeight: 600,
    color: color.text,
  },
  pageNumber: { position: 'absolute', bottom: 18, right: SIDE, fontSize: 8.25, color: color.muted },
  limeBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: color.lime,
  },
})

function TableHead() {
  return (
    <View style={s.thead}>
      <Text style={[s.th, s.quantity]}>CANT.</Text>
      <Text style={[s.th, s.code]}>CÓDIGO</Text>
      <Text style={[s.th, s.description]}>DESCRIPCIÓN</Text>
      <Text style={[s.th, s.unit]}>P. UNIT.</Text>
      <Text style={[s.th, s.lineTotal]}>TOTAL</Text>
    </View>
  )
}

// Plantilla A4 de la proforma, igual a la pizarra del prototipo (spec del documento §4).
export function ProformaPdf({ model }: { model: DocumentModel }) {
  return (
    <Document title={model.title} author={model.author} language="es">
      <Page size="A4" style={s.page}>
        {model.draft ? (
          <Text fixed style={s.watermark}>
            BORRADOR
          </Text>
        ) : null}
        <View
          fixed
          style={s.repeatHead}
          render={({ pageNumber }) => (pageNumber > 1 ? <TableHead /> : null)}
        />

        <View style={s.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no es un <img> */}
          <Image src={logo} style={s.logo} />
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>PROFORMA</Text>
            <Text style={s.headerNumber}>{model.numberLabel ?? 'BORRADOR'}</Text>
            <Text style={[s.headerDate, { marginTop: 4.5 }]}>Fecha: {model.date}</Text>
            <Text style={s.headerDate}>Válida hasta: {model.validUntil}</Text>
          </View>
        </View>

        <View style={s.companyRow}>
          {model.company.map((item) => (
            <View key={item.label} style={s.companyItem}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={s.semibold}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={s.client}>
          {model.client.map((item, index) => (
            <View key={item.label} style={index % 2 === 0 ? s.clientLeft : s.clientRight}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={item.strong ? [s.clientValue, s.bold] : s.clientValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={s.table}>
          <TableHead />
          {model.rows.map((row, index) => (
            <View key={index} style={s.row} wrap={false}>
              <Text style={[s.td, s.quantity]}>{row.quantity}</Text>
              <Text style={[s.td, s.code, s.mono]}>{row.code}</Text>
              <View style={[s.td, s.description]}>
                <Text style={s.semibold}>{row.name}</Text>
                {row.description ? <Text style={s.detail}>{row.description}</Text> : null}
              </View>
              <Text style={[s.td, s.unit]}>{row.unitPrice}</Text>
              <Text style={[s.td, s.lineTotal, s.semibold]}>{row.total}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals} wrap={false}>
          <View style={s.totalsBox}>
            {model.adjustments.map((item) => (
              <View key={item.label} style={s.totalsRow}>
                <Text style={s.totalsLabel}>{item.label}</Text>
                <Text>{item.value}</Text>
              </View>
            ))}
            <View style={s.totalBand}>
              <Text style={s.totalLabel}>TOTAL</Text>
              <Text style={s.totalValue}>{model.total}</Text>
            </View>
            {model.taxNote ? <Text style={s.taxNote}>{model.taxNote}</Text> : null}
          </View>
          <Text style={s.words}>{model.amountInWords}</Text>
        </View>

        <View style={s.bottom} wrap={false}>
          <View style={s.terms}>
            <Text style={s.heading}>Términos y condiciones</Text>
            {model.terms.map((term, index) => (
              <Text key={index} style={s.item}>
                {index + 1}. {term}
              </Text>
            ))}
          </View>
          {model.payments.length > 0 ? (
            <View style={s.payments}>
              <Text style={s.heading}>Cuentas para el pago</Text>
              {model.payments.map((payment, index) => (
                <Text key={index} style={payment.strong ? [s.item, s.semibold] : s.item}>
                  {payment.text}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <Text
          fixed
          style={s.thanks}
          render={({ pageNumber, totalPages }) =>
            pageNumber === totalPages ? 'Gracias por su preferencia' : ''
          }
        />
        <Text
          fixed
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `Página ${pageNumber} de ${totalPages}` : ''
          }
        />
        <View fixed style={s.limeBar} />
      </Page>
    </Document>
  )
}

export function renderProformaPdf(model: DocumentModel) {
  return renderToBuffer(<ProformaPdf model={model} />)
}
```

`src/features/proforma/document/service.ts`:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { failure } from '@/features/catalog/action-errors'
import { getCompanyProfile } from '@/features/company/queries'
import type { ActionResult } from '@/lib/action-result'
import type { Database } from '@/lib/supabase/database.types'
import type { DocumentInput, GeneratedDocument } from './input'
import { buildDocumentModel, documentProblem } from './model'
import { renderProformaPdf } from './pdf'

// Genera el PDF con los datos de la empresa guardados; no se guarda nada (spec del documento §3).
export async function createProformaDocument(
  supabase: SupabaseClient<Database>,
  input: DocumentInput,
  now = new Date(),
): Promise<ActionResult<GeneratedDocument>> {
  const company = await getCompanyProfile(supabase)
  if (!company) return failure('NOT_FOUND', 'No encontramos los datos de tu empresa.')
  const problem = documentProblem(input, company)
  if (problem) return failure('VALIDATION', problem)
  const model = buildDocumentModel(input, company, now)
  const pdf = await renderProformaPdf(model)
  return { ok: true, data: { fileName: model.fileName, base64: pdf.toString('base64') } }
}
```

En `src/features/proforma/actions.ts`, añadir a los imports:

```ts
import { documentInputSchema, type GeneratedDocument } from './document/input'
import { createProformaDocument } from './document/service'
```

y al final del archivo:

```ts
// PDF de la proforma (spec del documento §3): la cuenta autorizada, datos validados y nada guardado.
export async function generateProformaDocument(
  input: unknown,
): Promise<ActionResult<GeneratedDocument>> {
  return withOwner(async ({ supabase }) => {
    const parsed = documentInputSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return createProformaDocument(supabase, parsed.data)
  })
}
```

`next.config.ts` (archivo completo):

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // El PDF de la proforma lee sus fuentes y el logotipo del disco en el servidor: se incluyen en la
  // función de Vercel que atiende /products.
  outputFileTracingIncludes: {
    '/products': [
      './src/features/proforma/document/fonts/**',
      './public/brand/ventronix-wordmark.png',
    ],
  },
}

export default nextConfig
```

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `pnpm vitest run --project integration tests/integration/proforma-document.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS (5 casos), sin errores de tipos ni de lint.

- [ ] **Paso 6: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.ts src/features/proforma/document/fonts src/features/proforma/document/pdf.tsx src/features/proforma/document/service.ts src/features/proforma/actions.ts tests/integration/proforma-document.test.ts
git commit -m "feat: render the proforma PDF on the server"
```

---

### Task 5: Vista «lista», «Vista previa» y WhatsApp

**Archivos:**
- Crear: `src/features/proforma/document/files.ts`, `src/features/proforma/components/proforma-ready.tsx`
- Modificar: `src/features/proforma/components/proforma-editor.tsx` (prop `generatePdf` y «Vista previa»), `src/features/proforma/components/proforma-panel.tsx` (usa `ProformaReady`), `src/features/proforma/components/proforma-dialog.tsx` (conecta la Server Action)
- Pruebas: `tests/components/proforma-ready.test.tsx`; actualizar `tests/components/proforma-editor.test.tsx` y `tests/components/proforma-panel.test.tsx` (prop nueva)

**Interfaces:**
- Consume: `documentInput`, `DocumentInput`, `GeneratedDocument` (tarea 3); `documentDates`, `whatsappMessage`, `whatsappLink` (tarea 2); `generateProformaDocument` (tarea 4); `CompanyStatus`, `formatProformaNumber`, `formatCents`, `totalsFromText`, `useProforma`.
- Produce: `base64ToFile`, `downloadFile`, `openFile(file, tab?)`, `shareOnWhatsApp(file, message, phone)`; `<ProformaReady company generatePdf onCorrect onNew />`; `ProformaEditorProps.generatePdf: (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>`.

- [ ] **Paso 1: Escribir las pruebas**

`tests/components/proforma-ready.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProformaReady } from '@/features/proforma/components/proforma-ready'
import type { DocumentInput, GeneratedDocument } from '@/features/proforma/document/input'
import { EMPTY_DRAFT } from '@/features/proforma/draft'
import { ProformaProvider } from '@/features/proforma/store'
import type { ActionResult } from '@/lib/action-result'
import { completeCompany, line, seedProforma } from '../support/proforma'

type Generate = (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>
const pdf: GeneratedDocument = {
  fileName: 'Proforma-0001-Cliente-de-ejemplo-SAC.pdf',
  base64: btoa('%PDF-1.4 prueba'),
}

function renderReady(generatePdf: Generate = vi.fn<Generate>(async () => ({ ok: true, data: pdf }))) {
  render(
    <ProformaProvider>
      <ProformaReady
        company={{ status: 'ready', profile: { ...completeCompany, trade_name: 'Ventronix' } }}
        generatePdf={generatePdf}
        onCorrect={vi.fn()}
        onNew={vi.fn()}
      />
    </ProformaProvider>,
  )
  return { generatePdf, user: userEvent.setup() }
}

const seed = (phone = '900000000') =>
  seedProforma({
    lines: [line()],
    client: { ...EMPTY_DRAFT.client, name: 'Cliente de ejemplo S.A.C.', phone },
    number: 1,
    issuedAt: '2026-09-30T15:00:00.000Z',
  })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:proforma')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('ProformaReady', () => {
  it('prepara el PDF al entrar y lo descarga con su nombre', async () => {
    seed()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { generatePdf, user } = renderReady()
    expect(screen.getByText('Proforma N° 0001 lista')).toBeVisible()
    expect(screen.getByText('Preparando el PDF…')).toBeVisible()
    const download = screen.getByRole('button', { name: 'Descargar PDF' })
    await vi.waitFor(() => expect(download).toBeEnabled())
    expect(generatePdf).toHaveBeenCalledTimes(1)
    expect(generatePdf).toHaveBeenCalledWith(expect.objectContaining({ draft: false, number: 1 }))
    await user.click(download)
    expect(click).toHaveBeenCalledTimes(1)
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(pdf.fileName)
  })

  it('sin celular no deja enviar por WhatsApp y lo explica', async () => {
    seed('')
    renderReady()
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled(),
    )
    expect(screen.getByRole('button', { name: 'Enviar por WhatsApp' })).toBeDisabled()
    expect(
      screen.getByText('Añade el celular del cliente para enviarla por WhatsApp.'),
    ).toBeVisible()
  })

  it('en la PC descarga el PDF y abre el chat del cliente con el mensaje', async () => {
    seed()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { user } = renderReady()
    const send = screen.getByRole('button', { name: 'Enviar por WhatsApp' })
    await vi.waitFor(() => expect(send).toBeEnabled())
    await user.click(send)
    const message =
      'Hola, Cliente de ejemplo S.A.C. Le envío la proforma N° 0001 por S/ 2,590.00, válida hasta el 07/10/2026. Quedamos atentos. — Ventronix'
    expect(open).toHaveBeenCalledWith(
      `https://wa.me/51900000000?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener',
    )
  })

  it('si no se puede preparar el PDF, lo dice y deja reintentar', async () => {
    seed()
    const generatePdf = vi
      .fn<Generate>()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'UNEXPECTED',
          message: 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.',
        },
      })
      .mockResolvedValueOnce({ ok: true, data: pdf })
    const { user } = renderReady(generatePdf)
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos preparar el PDF.')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled(),
    )
    expect(generatePdf).toHaveBeenCalledTimes(2)
  })
})
```

En `tests/components/proforma-editor.test.tsx`:

1. Añadir a los imports `import type { DocumentInput, GeneratedDocument } from '@/features/proforma/document/input'` y `import type { ActionResult } from '@/lib/action-result'`.
2. En `renderEditor`, dentro de `props`, añadir:

```tsx
    generatePdf: vi.fn<(input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>>(
      async () => ({ ok: true, data: { fileName: 'Proforma-borrador.pdf', base64: btoa('%PDF') } }),
    ),
```

3. Añadir esta prueba al final del `describe`:

```tsx
  it('«Vista previa» abre la pestaña al instante y luego muestra el borrador', async () => {
    seedProforma({ lines: [line()] })
    URL.createObjectURL = vi.fn(() => 'blob:borrador')
    URL.revokeObjectURL = vi.fn()
    const tab = { location: { href: '' }, close: vi.fn() } as unknown as Window
    const open = vi.spyOn(window, 'open').mockReturnValue(tab)
    let finish: (value: ActionResult<GeneratedDocument>) => void = () => {}
    const generatePdf = vi.fn(
      (_input: DocumentInput) =>
        new Promise<ActionResult<GeneratedDocument>>((resolve) => (finish = resolve)),
    )
    const { user } = renderEditor({ generatePdf })
    await user.click(screen.getByRole('button', { name: 'Vista previa' }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(generatePdf).toHaveBeenCalledWith(expect.objectContaining({ draft: true }))
    await act(async () =>
      finish({ ok: true, data: { fileName: 'Proforma-borrador.pdf', base64: btoa('%PDF') } }),
    )
    expect(tab.location.href).toBe('blob:borrador')
    open.mockRestore()
  })
```

En `tests/components/proforma-panel.test.tsx`, añadir los mismos dos imports de tipos y, dentro de `props` de `renderPanel`:

```tsx
    generatePdf: vi.fn<(input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>>(
      () => new Promise(() => {}),
    ),
```

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `pnpm vitest run --project components tests/components/proforma-ready.test.tsx tests/components/proforma-editor.test.tsx`
Expected: FAIL: no existe `proforma-ready` y no hay botón «Vista previa».

- [ ] **Paso 3: Implementar**

`src/features/proforma/document/files.ts`:

```ts
import { whatsappLink } from './format'

// El PDF llega en base64 desde la Server Action.
export function base64ToFile(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new File([bytes], fileName, { type: 'application/pdf' })
}

// La dirección temporal se libera después, para no cortar la descarga ni la pestaña.
const release = (url: string) => setTimeout(() => URL.revokeObjectURL(url), 60_000)

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  release(url)
}

// Con una pestaña ya abierta (abierta al pulsar, para que el navegador no la bloquee) se usa esa.
export function openFile(file: File, tab?: Window | null) {
  const url = URL.createObjectURL(file)
  if (tab) tab.location.href = url
  else window.open(url, '_blank', 'noopener')
  release(url)
}

// Móvil: menú de compartir del teléfono con el PDF y el mensaje. PC (o si no se puede compartir):
// descarga el PDF y abre el chat del cliente en WhatsApp (spec del documento §7).
export async function shareOnWhatsApp(file: File, message: string, phone: string) {
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: message })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  downloadFile(file)
  window.open(whatsappLink(phone, message), '_blank', 'noopener')
}
```

`src/features/proforma/components/proforma-ready.tsx`:

```tsx
'use client'

import { Check, Download, MessageCircle, Pencil, Plus } from 'lucide-react'
import { useEffect, useEffectEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ActionResult } from '@/lib/action-result'
import { digitsOnly, isValidMobile } from '@/lib/peru'
import { base64ToFile, downloadFile, openFile, shareOnWhatsApp } from '../document/files'
import { documentDates, whatsappMessage } from '../document/format'
import { documentInput, type DocumentInput, type GeneratedDocument } from '../document/input'
import { formatCents, ZERO } from '../money'
import { formatProformaNumber } from '../number'
import type { CompanyStatus } from '../readiness'
import { useProforma } from '../store'
import { totalsFromText } from '../totals'

type Status = { kind: 'loading' } | { kind: 'ready'; file: File } | { kind: 'error'; message: string }

const inlineAction =
  'font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3 disabled:opacity-50'

type ProformaReadyProps = {
  company: CompanyStatus
  generatePdf: (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>
  onCorrect: () => void
  onNew: () => void
}

// «Proforma N° 0001 lista» (spec del documento §6 y prototipo). El PDF se prepara al entrar: así
// descargar, ver y compartir son inmediatos y el navegador no los bloquea.
export function ProformaReady({ company, generatePdf, onCorrect, onNew }: ProformaReadyProps) {
  const { draft } = useProforma()
  const [status, setStatus] = useState<Status>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const payload = JSON.stringify(documentInput(draft, { draft: false }))
  const generate = useEffectEvent((input: DocumentInput) => generatePdf(input))

  useEffect(() => {
    let active = true
    void generate(JSON.parse(payload)).then((result) => {
      if (!active) return
      setStatus(
        result.ok
          ? { kind: 'ready', file: base64ToFile(result.data.base64, result.data.fileName) }
          : { kind: 'error', message: result.error.message },
      )
    })
    return () => {
      active = false
    }
  }, [payload, attempt])

  const profile = company.status === 'ready' ? company.profile : null
  const totals = totalsFromText(draft)
  const total = `S/ ${formatCents(totals?.total ?? ZERO)}`
  const numberLabel = formatProformaNumber(draft.number ?? 0)
  const validityDays = Number(draft.validityDays || profile?.default_validity_days || 7)
  const validUntil = draft.issuedAt
    ? documentDates(new Date(draft.issuedAt), validityDays).validUntil
    : ''
  const phoneOk = isValidMobile(digitsOnly(draft.client.phone))
  const message = whatsappMessage({
    clientName: draft.client.name,
    numberLabel,
    total,
    validUntil,
    sender: profile?.trade_name || profile?.legal_name || 'Ventronix',
  })
  const file = status.kind === 'ready' ? status.file : null

  function retry() {
    setStatus({ kind: 'loading' })
    setAttempt((current) => current + 1)
  }

  return (
    <div data-view="ready" className="grid justify-items-center gap-2 px-8 pt-9 pb-7 text-center">
      <span className="mb-1.5 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-7" strokeWidth={2.2} aria-hidden />
      </span>
      <p role="status" className="text-xl font-extrabold text-foreground">
        Proforma {numberLabel} lista
      </p>
      <p className="mb-3.5 text-muted-foreground">
        {draft.client.name} · Total {total}
      </p>
      <div className="grid w-full gap-2.5 sm:grid-cols-2">
        <Button
          className="h-11.5 text-[15px] font-bold"
          disabled={!file}
          onClick={() => file && downloadFile(file)}
        >
          <Download aria-hidden />
          Descargar PDF
        </Button>
        <Button
          variant="outline"
          className="h-11.5 text-[15px] font-bold"
          disabled={!file || !phoneOk}
          aria-describedby={phoneOk ? undefined : 'ready-phone-hint'}
          onClick={() => file && void shareOnWhatsApp(file, message, draft.client.phone)}
        >
          <MessageCircle aria-hidden />
          Enviar por WhatsApp
        </Button>
      </div>
      {status.kind === 'loading' ? (
        <p className="text-xs text-muted-foreground">Preparando el PDF…</p>
      ) : status.kind === 'error' ? (
        <p role="alert" className="text-xs text-destructive">
          No pudimos preparar el PDF. {status.message}{' '}
          <button type="button" className={inlineAction} onClick={retry}>
            Reintentar
          </button>
        </p>
      ) : null}
      {phoneOk ? null : (
        <p id="ready-phone-hint" className="text-xs text-muted-foreground">
          Añade el celular del cliente para enviarla por WhatsApp.
        </p>
      )}
      <button
        type="button"
        className={`mt-2 text-sm ${inlineAction}`}
        disabled={!file}
        onClick={() => file && openFile(file)}
      >
        Ver el documento
      </button>
      <div className="mt-1.5 flex flex-wrap justify-center gap-1">
        <Button variant="ghost" className="h-10 text-sm font-semibold" autoFocus onClick={onCorrect}>
          <Pencil aria-hidden />
          Corregir
        </Button>
        <Button variant="ghost" className="h-10 text-sm font-semibold" onClick={onNew}>
          <Plus aria-hidden />
          Nueva proforma
        </Button>
      </div>
    </div>
  )
}
```

En `src/features/proforma/components/proforma-panel.tsx`:

1. Sustituir el import de `lucide-react` y el de `Button` (ya no se usan aquí) por `import { ProformaReady } from './proforma-ready'`, y quitar los imports de `formatCents`, `formatProformaNumber` y `totalsFromText` si quedan sin uso.
2. Sustituir todo el bloque `if (view === 'ready' && draft.number !== null) { … }` por:

```tsx
  if (view === 'ready' && draft.number !== null) {
    return (
      <ProformaReady
        company={editor.company}
        generatePdf={editor.generatePdf}
        onCorrect={() => setView('edit')}
        onNew={startNew}
      />
    )
  }
```

En `src/features/proforma/components/proforma-editor.tsx`:

1. Añadir a los imports:

```tsx
import { useState } from 'react'
import type { ActionResult } from '@/lib/action-result'
import { base64ToFile, openFile } from '../document/files'
import { documentInput, type DocumentInput, type GeneratedDocument } from '../document/input'
import { totalsFromText } from '../totals'
```

2. En `ProformaEditorProps`, añadir:

```tsx
  generatePdf: (input: DocumentInput) => Promise<ActionResult<GeneratedDocument>>
```

y recibir `generatePdf` en la desestructuración de props.

3. Dentro del componente, antes del `return`:

```tsx
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const canPreview = draft.lines.length > 0 && totalsFromText(draft) !== null

  // La pestaña se abre al pulsar, antes de esperar al servidor, para que el navegador no la bloquee.
  async function preview() {
    setPreviewError(null)
    const tab = window.open('', '_blank')
    setPreviewing(true)
    const result = await generatePdf(documentInput(draft, { draft: true }))
    setPreviewing(false)
    if (!result.ok) {
      tab?.close()
      setPreviewError(result.error.message)
      return
    }
    openFile(base64ToFile(result.data.base64, result.data.fileName), tab)
  }
```

4. Dentro de `<ProformaSummary>`, después del bloque del motivo o de «Recibe su número…», añadir:

```tsx
        <button
          type="button"
          disabled={!canPreview || previewing}
          onClick={() => void preview()}
          className="justify-self-start text-xs font-semibold text-foreground underline decoration-primary decoration-2 underline-offset-3 disabled:opacity-50"
        >
          {previewing ? 'Preparando la vista previa…' : 'Vista previa'}
        </button>
        {previewError ? (
          <p role="alert" className="text-xs text-destructive">
            {previewError}
          </p>
        ) : null}
```

En `src/features/proforma/components/proforma-dialog.tsx`, cambiar el import de acciones por `import { generateProformaDocument, reserveProformaNumber } from '../actions'` y añadir a `<ProformaPanel … />` la prop:

```tsx
          generatePdf={(input) => settle(generateProformaDocument(input))}
```

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `pnpm vitest run --project components && pnpm typecheck && pnpm lint`
Expected: todas las pruebas de componentes pasan, sin errores de tipos ni de lint.

- [ ] **Paso 5: Commit**

```bash
git add src/features/proforma/document/files.ts src/features/proforma/components/proforma-ready.tsx src/features/proforma/components/proforma-panel.tsx src/features/proforma/components/proforma-editor.tsx src/features/proforma/components/proforma-dialog.tsx tests/components/proforma-ready.test.tsx tests/components/proforma-editor.test.tsx tests/components/proforma-panel.test.tsx
git commit -m "feat: download and share the proforma PDF"
```

---

### Task 6: E2E, revisión visual y verificación

**Archivos:**
- Modificar: `tests/e2e/proforma.spec.ts`, `docs/setup.md`, `docs/deployment.md`

**Interfaces:**
- Consume: todo lo anterior.

- [ ] **Paso 1: Escribir la e2e**

En `tests/e2e/proforma.spec.ts`, añadir `import { readFileSync } from 'node:fs'` y esta prueba al final:

```ts
test('descarga el PDF y abre WhatsApp con el mensaje escrito', async ({ page }) => {
  await seed()
  // wa.me responde con una página de prueba: las e2e nunca salen a WhatsApp.
  await page
    .context()
    .route('https://wa.me/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>WhatsApp</title>' }),
    )
  await login(page)
  await addLaptop14(page)
  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  const panel = dialog(page)
  await panel.getByLabel('Razón social o nombre').fill('Cliente de ejemplo S.A.C.')
  await panel.getByLabel('Celular').fill('987 654 321')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()

  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Descargar PDF' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('Proforma-0001-Cliente-de-ejemplo-SAC.pdf')
  expect(readFileSync(await file.path()).subarray(0, 5).toString()).toBe('%PDF-')

  const chat = page.context().waitForEvent('page')
  await panel.getByRole('button', { name: 'Enviar por WhatsApp' }).click()
  expect((await chat).url()).toContain(
    'https://wa.me/51987654321?text=Hola%2C%20Cliente%20de%20ejemplo%20S.A.C.%20Le%20env',
  )
})
```

- [ ] **Paso 2: Ejecutar la e2e**

Run: `pnpm test:e2e tests/e2e/proforma.spec.ts`
Expected: PASS en escritorio y móvil.

- [ ] **Paso 3: Revisión visual contra la pizarra A4**

Generar un PDF de ejemplo (E1 con descripciones) y otro de 40 líneas en borrador con una prueba temporal que los escriba en el espacio temporal de la sesión; dibujarlos con pdf.js en Playwright y mirar las imágenes junto a la pizarra «Proforma · Documento A4». Comprobar: franja negra y logotipo, número en verde, fila de la empresa, recuadro del cliente, tabla, totales con la banda negra, nota del IGV, importe en letras, términos, cuentas, «Gracias por su preferencia», franja verde, cabecera repetida y «Página N de M» en el de 40 líneas, marca «BORRADOR». Corregir las medidas que no coincidan (cada corrección con su ruling en el registro) y borrar los archivos temporales.

- [ ] **Paso 4: Documentación**

En `docs/setup.md`, después de la sección «Consulta de RUC», añadir:

```md
## Documento PDF

«Descargar PDF» genera la proforma en el servidor con `@react-pdf/renderer`, con la plantilla del prototipo. Usa las fuentes de `src/features/proforma/document/fonts` (Plus Jakarta Sans y JetBrains Mono, licencia OFL incluida) y el logotipo de `public/brand/ventronix-wordmark.png`. El PDF no se guarda en ningún sitio.
```

En `docs/deployment.md`, en «3. Comprobación después de publicar», antes de la comprobación de claves secretas, añadir:

```md
- [ ] En una proforma generada, «Descargar PDF» baja el documento con el logotipo y los datos de la empresa, y «Enviar por WhatsApp» abre el chat del cliente con el mensaje.
```

- [ ] **Paso 5: Verificación completa**

Run: `pnpm validate && pnpm test:integration && pnpm test:e2e`
Expected: todo en verde.

- [ ] **Paso 6: Commit**

```bash
git add tests/e2e/proforma.spec.ts docs/setup.md docs/deployment.md
git commit -m "test: cover PDF download and WhatsApp sharing end to end"
```
