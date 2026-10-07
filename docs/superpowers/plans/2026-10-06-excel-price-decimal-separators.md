# Excel Price Decimal Separators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the bulk-import template to accept prices written with either a decimal point or a decimal comma and normalize both to the canonical `300.50` form during preview.

**Architecture:** Keep Excel's numeric display and selection help, but remove the blocking price error alert that depends on the user's regional separators. Keep `cellPrice` and `unitPriceSchema` as the authoritative normalization and validation path after upload, so the Excel template does not duplicate business rules.

**Tech Stack:** TypeScript 5, ExcelJS 4.4.0, Vitest 5, pnpm 10

## Global Constraints

- `300,50`, `300.50`, `300,5`, and `300.5` must normalize to the canonical string `300.50`.
- Keep the price column's visual format `#,##0.00` and its input help.
- Do not change the database contract or catalog money rules.
- Do not change any other template validation.
- Do not add dependencies or duplicate the price parser in an Excel formula.
- Invalid prices must still be rejected in the upload preview before import.

---

### Task 1: Make the Excel price hint non-blocking and prove both separators round-trip

**Files:**

- Modify: `tests/unit/import-template.test.ts`
- Modify: `src/features/catalog/excel/template.ts:39-47,157-167`

**Interfaces:**

- Consumes: `buildTemplate(categories: string[]): Promise<Buffer>`, `readImportFile(data: ArrayBuffer, fileName: string): Promise<ReadResult>`, and `checkRows(rows, columns, tax): CheckedRow[]`.
- Produces: a price-cell validation that retains `type: 'decimal'`, `operator: 'greaterThan'`, `formulae: [0]`, and the input prompt while omitting a blocking error alert; both decimal separators reach `checkRows` and produce `price: '300.50'`.

- [ ] **Step 1: Write the failing validation and round-trip tests**

Add the `checkRows` import to `tests/unit/import-template.test.ts`:

```ts
import { checkRows } from '@/features/catalog/excel/validate'
```

Replace the price-validation assertion inside the existing “la hoja Productos lleva títulos…” test with:

```ts
const priceValidation = products.getCell('E2').dataValidation
expect(priceValidation).toMatchObject({
  type: 'decimal',
  operator: 'greaterThan',
  formulae: [0],
  showInputMessage: true,
  promptTitle: 'Precio con IGV (S/)',
  prompt:
    'Precios en soles (S/), con IGV incluido. Mayor que 0, hasta 2 decimales. Puedes escribir 300.50 o 300,50. Se revisará al subir.',
})
expect(priceValidation.showErrorMessage).not.toBe(true)
expect(priceValidation).not.toHaveProperty('errorStyle')
expect(priceValidation).not.toHaveProperty('errorTitle')
expect(priceValidation).not.toHaveProperty('error')
```

Also assert that the instructions advertise both decimal separators by adding this after the existing instructions assertion:

```ts
expect(instructions).toContain(
  '4. Precios en soles (S/), con IGV incluido. Por ejemplo 1250.50 o 1250,50.',
)
```

Add this test after the existing completed-template test:

```ts
it('guarda precios con punto o coma y ambos se normalizan con punto', async () => {
  const workbook = await load(await buildTemplate(['Laptops']))
  const products = workbook.getWorksheet('Productos')!
  products.getRow(2).values = ['PUNTO-1', 'Con punto', null, 'Laptops', '300.50']
  products.getRow(3).values = ['COMA-1', 'Con coma', null, 'Laptops', '300,50']

  const data = new Uint8Array(await workbook.xlsx.writeBuffer()).buffer
  const result = await readImportFile(data, 'plantilla.xlsx')
  expect(result.ok).toBe(true)
  if (!result.ok) return

  const checked = checkRows(result.sheet.rows, result.sheet.columns, {
    pricesIncludeTax: true,
    ratePercent: 18,
  })
  expect(checked.map(({ code, price, errors }) => ({ code, price, errors }))).toEqual([
    { code: 'PUNTO-1', price: '300.50', errors: [] },
    { code: 'COMA-1', price: '300.50', errors: [] },
  ])
})
```

- [ ] **Step 2: Run the focused test and verify the new expectation fails**

Run:

```bash
pnpm exec vitest run --project unit tests/unit/import-template.test.ts
```

Expected: FAIL because the current price validation still reloads with `showErrorMessage: true`, `errorStyle: 'stop'`, and the old prompt; the new round-trip assertion itself may already pass because the server normalizer supports both separators.

- [ ] **Step 3: Make only the price validation non-blocking**

In `writeInstructions` within `src/features/catalog/excel/template.ts`, replace the price example step with:

```ts
`${priceColumns().note} Por ejemplo 1250.50 o 1250,50.`,
```

Replace the `E2:E${LAST_ROW}` validation with:

```ts
rules.add(`E2:E${LAST_ROW}`, {
  ...help,
  showErrorMessage: false,
  type: 'decimal',
  operator: 'greaterThan',
  formulae: [0],
  promptTitle: titles.price,
  prompt: `${priceColumns().note} Mayor que 0, hasta 2 decimales. Puedes escribir 300.50 o 300,50. Se revisará al subir.`,
})
```

Do not modify `normalize.ts`: its `priceText`, `cellPrice`, and `unitPriceSchema` path already provides the required canonical value and validation.

- [ ] **Step 4: Run focused template and normalization tests**

Run:

```bash
pnpm exec vitest run --project unit tests/unit/import-template.test.ts tests/unit/import-normalize.test.ts
```

Expected: PASS for both test files. The template test proves the alert is non-blocking and both separators normalize identically; the normalization suite continues to reject numeric values with more than two real decimals.

- [ ] **Step 5: Run static checks and the complete unit/component suite**

Run:

```bash
pnpm exec eslint src/features/catalog/excel/template.ts tests/unit/import-template.test.ts
pnpm typecheck
pnpm test
```

Expected: all commands exit with code 0; Vitest reports all unit and component test files passing.

- [ ] **Step 6: Inspect the generated validation model**

Run:

```bash
pnpm exec vitest run --project unit tests/unit/import-template.test.ts --reporter=verbose
```

Expected: all template tests pass, including the assertion that `showErrorMessage` is not `true` and no error-style fields survive the XLSX round trip.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/features/catalog/excel/template.ts tests/unit/import-template.test.ts
git commit -m "fix: accept both decimal separators in import template"
```

### Task 2: Close the gaps found in review (added 2026-10-07)

Task 1 left the acceptance criterion "al importar" without an end-to-end test, the preview errors
advertising only the decimal point, no manual check for a comma-decimal Excel, and the spec and
plan out of version control.

- [x] Preview errors show both separators: `unitPriceSchema` and `cellPrice` now say «por ejemplo
  1250.50 o 1250,50.»
- [x] End-to-end test with the real template: `300.50` and `300,50` show S/ 300.50 in the preview
  and import as `300.50` (`tests/e2e/catalog-import.spec.ts`).
- [x] Manual check for a comma-decimal Excel in `docs/deployment.md` (Carga masiva).
- [x] Known limit documented in the spec: one separator followed by exactly three digits reads as
  thousands.
- [x] Spec and plan committed together with the implementation.

