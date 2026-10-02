import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { z } from 'zod'
import { TAX_CONFIG } from '@/features/proforma/tax'
import type { ActionResult } from '@/lib/action-result'
import { lima } from '@/lib/dates'
import type { Database, Json } from '@/lib/supabase/database.types'
import { failure } from '../action-errors'
import { listCategoryOptions } from '../categories/queries'
import { categoryKey, PRICE_CHANGE_WARNING } from '../import/options'
import {
  DATA_COLUMNS,
  type CategoryBar,
  type CategoryChoice,
  type CategoryDecision,
  type DataColumn,
  type DownloadedFile,
  type FieldChange,
  type ImportColumn,
  type ImportMode,
  type ImportOptions,
  type ImportOutcome,
  type ImportPreview,
  type PreviewCounts,
  type PreviewRow,
  type PriceTrend,
  type RowAction,
  type RowStatus,
} from '../import/types'
import { limaDay } from '../list-options'
import { priceColumns } from '../price-columns'
import type { ErrorRow } from './errors-file'
import { readImportFile } from './read'
import type { ReceiptChange } from './receipt'
import { matchCategory } from './similar'
import { checkRows, COLUMN_LABELS, type CheckedRow } from './validate'

type Client = SupabaseClient<Database>

// Lo que se envía a la base por fila: el código y las columnas presentes, ya validadas.
type PayloadRow = {
  line: number
  code: string
  name?: string
  description?: string | null
  category?: string
  price?: string
}

export type ImportAnalysis = {
  preview: ImportPreview
  columns: DataColumn[]
  // Filas que van a import_products: todas menos las de errores y las omitidas.
  payload: PayloadRow[]
  errorRows: ErrorRow[]
  // Categorías elegidas como destino que ya no existen (alguien las borró).
  missingTargets: string[]
}

export type AnalyzeResult = { ok: true; analysis: ImportAnalysis } | { ok: false; message: string }

const planSchema = z.array(
  z.object({
    line: z.number().int(),
    exists: z.boolean(),
    category_exists: z.boolean(),
    current_name: z.string().nullable(),
    current_description: z.string().nullable(),
    current_category: z.string().nullable(),
    current_price: z.string().nullable(),
    name_changed: z.boolean(),
    description_changed: z.boolean(),
    category_changed: z.boolean(),
    price_changed: z.boolean(),
    name_taken_by: z.string().nullable(),
  }),
)
type PlanRow = z.infer<typeof planSchema>[number]

const importResultSchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  skipped: z.number().int(),
  categories_created: z.array(z.string()),
  changes: z.array(
    z.object({
      code: z.string(),
      product: z.string(),
      action: z.enum(['created', 'updated']),
      field: z.enum(['name', 'description', 'category', 'price']).nullable(),
      before: z.string().nullable(),
      after: z.string().nullable(),
    }),
  ),
  previous: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      category: z.string(),
      price: z.string(),
    }),
  ),
})

const NEW_PRODUCT_MISSING = {
  name: 'Producto nuevo: falta el nombre.',
  category: 'Producto nuevo: falta la categoría.',
  price: 'Producto nuevo: falta el precio.',
} as const

const UPDATED_LABELS: Record<DataColumn, string> = {
  name: 'los nombres',
  description: 'las descripciones',
  category: 'las categorías',
  price: 'los precios',
}

const listText = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`

const columnTitle = (column: ImportColumn) =>
  column === 'price' ? priceColumns().catalog.replace(/\s*\(S\/\)$/, '') : COLUMN_LABELS[column]

// «Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios…» (spec §6.6).
function partialNotice(columns: ImportColumn[]) {
  const present = DATA_COLUMNS.filter((column) => columns.includes(column))
  if (present.length === DATA_COLUMNS.length) return null
  return `Tu archivo trae ${listText(columns.map(columnTitle))}: solo se actualizarán ${listText(
    present.map((column) => UPDATED_LABELS[column]),
  )}. El resto de los datos se mantiene.`
}

// El reporte trae «Valor sin IGV (S/)» junto al precio: si alguien lo cambió pensando que se
// importa, se entera antes (revisión 2 del plan).
const ignoredNotice = (derived: string | null) =>
  derived
    ? `La columna «${derived}» no se importa: los precios se cambian en «${priceColumns().catalog}».`
    : null

function payloadRow(row: CheckedRow, withValues: boolean): PayloadRow {
  if (!withValues) return { line: row.line, code: row.code }
  return {
    line: row.line,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    price: row.price,
  }
}

type Resolution = {
  choices: Map<string, CategoryChoice>
  fileKeys: Map<number, string>
  missingTargets: string[]
}

// Categorías del archivo frente a las existentes, con las decisiones de la persona (spec §6.8).
// Cambia la categoría de cada fila por la que se usará: la existente elegida o la nueva tal cual.
function resolveCategories(
  rows: CheckedRow[],
  existing: string[],
  decisions: Record<string, CategoryDecision>,
): Resolution {
  const choices = new Map<string, CategoryChoice>()
  const resolved = new Map<string, string>()
  const fileKeys = new Map<number, string>()
  const missingTargets: string[] = []
  const findExisting = (name: string) =>
    existing.find((candidate) => categoryKey(candidate) === categoryKey(name))
  for (const row of rows) {
    if (row.category === undefined) continue
    const key = categoryKey(row.category)
    fileKeys.set(row.line, key)
    if (!resolved.has(key)) {
      const match = matchCategory(row.category, existing)
      if (match.kind === 'existing') resolved.set(key, match.target)
      else {
        // Solo las decisiones enviadas: una categoría llamada «constructor» no lee el prototipo.
        const asked = Object.hasOwn(decisions, key) ? decisions[key] : undefined
        const target = asked?.action === 'use' ? findExisting(asked.target) : undefined
        if (asked?.action === 'use' && !target) missingTargets.push(asked.target)
        let decision: CategoryDecision | null = null
        if (target) decision = { action: 'use', target }
        else if (asked?.action === 'create' || match.kind === 'new') decision = { action: 'create' }
        else if (match.kind === 'near') decision = { action: 'use', target: match.target }
        resolved.set(key, decision?.action === 'use' ? decision.target : row.category)
        choices.set(key, {
          key,
          name: row.category,
          kind: match.kind,
          suggestion: match.kind === 'new' ? null : match.target,
          decision,
          products: 0,
        })
      }
    }
    row.category = resolved.get(key)
  }
  return { choices, fileKeys, missingTargets }
}

function fieldChanges(row: CheckedRow, found: PlanRow): FieldChange[] {
  const changes: FieldChange[] = []
  if (found.name_changed)
    changes.push({ field: 'name', before: found.current_name, after: row.name ?? null })
  if (found.description_changed) {
    changes.push({
      field: 'description',
      before: found.current_description,
      after: row.description ?? null,
    })
  }
  if (found.category_changed) {
    changes.push({ field: 'category', before: found.current_category, after: row.category ?? null })
  }
  if (found.price_changed)
    changes.push({ field: 'price', before: found.current_price, after: row.price ?? null })
  return changes
}

// Avisos «Para revisar» (spec §9.4): se importan igual, pero conviene mirarlos.
function rowWarnings(
  row: CheckedRow,
  found: PlanRow,
  action: 'create' | 'update',
  firstByName: Map<string, { line: number; code: string }>,
) {
  const warnings: string[] = []
  if (action === 'update' && found.price_changed && row.price && found.current_price) {
    const before = Number(found.current_price)
    const ratio = before > 0 ? (Number(row.price) - before) / before : 0
    if (Math.abs(ratio) >= PRICE_CHANGE_WARNING) {
      const percent = Math.round(Math.abs(ratio) * 100)
      warnings.push(
        ratio > 0
          ? `El precio sube un ${percent} %. ¿Es correcto?`
          : `El precio baja un ${percent} %. ¿Es correcto?`,
      )
    }
  }
  if (row.name) {
    const first = firstByName.get(row.name.toLowerCase())
    if (first && first.line !== row.line && first.code !== row.code) {
      warnings.push(`Mismo nombre que la fila ${first.line} (otro código).`)
    }
    if (found.name_taken_by && (action === 'create' || found.name_changed)) {
      warnings.push(`Ya existe "${row.name}" con el código ${found.name_taken_by}.`)
    }
  }
  return warnings
}

// Estado de cada fila (spec §6.6): cuenta en una sola tarjeta, por este orden: con errores, omitida
// por el modo, para revisar y luego nuevo, se actualiza o sin cambios.
function describeRows(
  rows: CheckedRow[],
  plan: Map<number, PlanRow>,
  columns: ImportColumn[],
  mode: ImportMode,
): PreviewRow[] {
  const firstByName = new Map<string, { line: number; code: string }>()
  for (const row of rows) {
    const key = row.name?.toLowerCase()
    if (key && !firstByName.has(key)) firstByName.set(key, { line: row.line, code: row.code })
  }
  return rows.map((row) => {
    const found = row.codeOk ? plan.get(row.line) : undefined
    if (row.codeOk && !found) throw new Error(`La base no devolvió la fila ${row.line}.`)
    const errors = [...row.errors]
    let status: RowStatus = 'error'
    let action: RowAction | null = null
    let warnings: string[] = []
    if (found && (found.exists ? mode === 'create' : mode === 'update')) status = 'omitted'
    else if (found) {
      if (!found.exists) {
        for (const column of ['name', 'category', 'price'] as const) {
          if (!columns.includes(column)) errors.push(NEW_PRODUCT_MISSING[column])
        }
      }
      if (errors.length === 0) {
        const changed =
          found.name_changed ||
          found.description_changed ||
          found.category_changed ||
          found.price_changed
        action = !found.exists ? 'create' : changed ? 'update' : 'unchanged'
        warnings = action === 'unchanged' ? [] : rowWarnings(row, found, action, firstByName)
        status = warnings.length > 0 ? 'review' : action
      }
    }
    return {
      line: row.line,
      status,
      action,
      code: row.code,
      name: row.name ?? found?.current_name ?? null,
      category: row.category ?? found?.current_category ?? null,
      price: row.price ?? found?.current_price ?? null,
      priceBeforeTax: row.priceBeforeTax ?? null,
      changes: action === 'update' && found ? fieldChanges(row, found) : [],
      warnings,
      errors: status === 'error' ? errors : [],
    }
  })
}

function countRows(rows: PreviewRow[]): PreviewCounts {
  const counts: PreviewCounts = {
    create: 0,
    update: 0,
    unchanged: 0,
    review: 0,
    error: 0,
    omitted: 0,
  }
  for (const row of rows) counts[row.status] += 1
  return counts
}

function priceTrend(rows: PreviewRow[]): PriceTrend {
  const ups: number[] = []
  const downs: number[] = []
  for (const row of rows) {
    for (const change of row.changes) {
      if (change.field !== 'price' || !change.before || !change.after) continue
      const before = Number(change.before)
      if (before <= 0) continue
      const ratio = (Number(change.after) - before) / before
      if (ratio > 0) ups.push(ratio)
      else if (ratio < 0) downs.push(ratio)
    }
  }
  const average = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
  return {
    up: ups.length,
    down: downs.length,
    upAverage: average(ups),
    downAverage: average(downs),
  }
}

const importable = (row: PreviewRow) => row.status !== 'error' && row.status !== 'omitted'

function categoryBars(
  rows: PreviewRow[],
  choices: CategoryChoice[],
  existing: string[],
): CategoryBar[] {
  const existingKeys = new Set(existing.map(categoryKey))
  const undecided = new Set(
    choices.filter((choice) => choice.decision === null).map((choice) => choice.key),
  )
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.category && importable(row))
      totals.set(row.category, (totals.get(row.category) ?? 0) + 1)
  }
  const bars: CategoryBar[] = []
  for (const [name, products] of totals) {
    const key = categoryKey(name)
    const tag = undecided.has(key) ? 'similar' : existingKeys.has(key) ? null : 'new'
    bars.push({ name, products, tag })
  }
  return bars.sort((a, b) => b.products - a.products || a.name.localeCompare(b.name, 'es'))
}

// Lee el archivo, lo valida con las reglas del formulario, compara las categorías y pide a la base el
// plan de cada fila (spec §6.6). No guarda nada: lo usan la vista previa, la simulación, el archivo
// de errores y la importación, que lo vuelve a calcular todo (spec §6.9).
export async function analyzeImport(
  supabase: Client,
  input: { data: ArrayBuffer; fileName: string; options: ImportOptions },
): Promise<AnalyzeResult> {
  const read = await readImportFile(input.data, input.fileName)
  if (!read.ok) return read
  const { sheet } = read
  const columns = DATA_COLUMNS.filter((column) => sheet.columns.includes(column))
  const checked = checkRows(sheet.rows, sheet.columns, {
    pricesIncludeTax: input.options.pricesIncludeTax,
    ratePercent: TAX_CONFIG.ratePercent,
  })
  const existing = (await listCategoryOptions(supabase)).map((category) => category.name)
  const { choices, fileKeys, missingTargets } = resolveCategories(
    checked,
    existing,
    input.options.categoryMap,
  )

  // Las filas con errores solo envían el código: hace falta saber si existe por el modo.
  const lookup = checked
    .filter((row) => row.codeOk)
    .map((row) => payloadRow(row, row.errors.length === 0))
  const { data, error } = await supabase.rpc('preview_product_import', {
    rows: lookup as unknown as Json,
    columns,
  })
  if (error) throw error
  const plan = new Map(planSchema.parse(data).map((row) => [row.line, row]))
  const rows = describeRows(checked, plan, sheet.columns, input.options.mode)

  for (const row of rows) {
    const key = fileKeys.get(row.line)
    const choice = key === undefined ? undefined : choices.get(key)
    if (choice && importable(row)) choice.products += 1
  }
  // Una categoría que solo aparece en filas con errores u omitidas no pide decisión.
  const used = [...choices.values()].filter((choice) => choice.products > 0)
  const counts = countRows(rows)
  const preview: ImportPreview = {
    fileName: input.fileName,
    sheetName: sheet.sheetName,
    columns: sheet.columns,
    partialNotice: partialNotice(sheet.columns),
    ignoredNotice: ignoredNotice(sheet.derivedPrice),
    rows,
    counts,
    prices: priceTrend(rows),
    choices: used,
    bars: categoryBars(rows, used, existing),
    undecided: used.filter((choice) => choice.decision === null).length,
    importable: counts.create + counts.update + counts.review,
    updates: rows.filter((row) => row.action === 'update').length,
  }

  const byLine = new Map(checked.map((row) => [row.line, row]))
  const cells = new Map(sheet.rows.map((row) => [row.line, row.cells]))
  return {
    ok: true,
    analysis: {
      preview,
      columns,
      payload: rows.filter(importable).map((row) => payloadRow(byLine.get(row.line)!, true)),
      errorRows: rows
        .filter((row) => row.status === 'error')
        .map((row) => ({ line: row.line, cells: cells.get(row.line) ?? {}, errors: row.errors })),
      missingTargets,
    },
  }
}

// Importa en una sola transacción lo que mostró la vista previa (spec §6.9) y arma el comprobante.
export async function runImport(
  supabase: Client,
  analysis: ImportAnalysis,
  mode: ImportMode,
  now = new Date(),
): Promise<ActionResult<ImportOutcome>> {
  const { preview } = analysis
  if (analysis.missingTargets.length > 0) {
    return failure(
      'CONFLICT',
      `La categoría «${analysis.missingTargets[0]}» ya no existe. Vuelve a revisar el archivo.`,
    )
  }
  if (preview.undecided > 0) {
    return failure(
      'VALIDATION',
      preview.undecided === 1
        ? 'Decide 1 categoría antes de importar.'
        : `Decide ${preview.undecided} categorías antes de importar.`,
    )
  }
  if (preview.importable === 0) {
    return failure(
      'VALIDATION',
      preview.counts.unchanged > 0
        ? 'Tu catálogo ya está al día con este archivo.'
        : 'No hay filas para importar.',
    )
  }
  const { data, error } = await supabase.rpc('import_products', {
    rows: analysis.payload as unknown as Json,
    columns: analysis.columns,
    mode,
  })
  if (error?.code === '23505') {
    return failure(
      'CONFLICT',
      'Otro cambio en el catálogo chocó con este archivo. No se importó nada: vuelve a revisarlo.',
    )
  }
  if (error) throw error
  const result = importResultSchema.parse(data)
  const skipped = result.skipped + preview.counts.omitted
  const { buildReceipt } = await import('./receipt')
  const receipt = await buildReceipt({
    kind: 'receipt',
    fileName: preview.fileName,
    generatedAt: now,
    counts: {
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped,
      errors: preview.counts.error,
    },
    categoriesCreated: result.categories_created,
    changes: result.changes,
    previous: result.previous,
    columns: preview.columns,
  })
  return {
    ok: true,
    data: {
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      skipped,
      errors: preview.counts.error,
      categoriesCreated: result.categories_created,
      receipt: {
        base64: receipt.toString('base64'),
        fileName: `comprobante-importacion-${limaDay(now)}-${format(now, 'HHmm', { in: lima })}.xlsx`,
      },
    },
  }
}

// «Descargar simulación» (spec §6.6): el comprobante de lo que pasaría, sin guardar nada.
export async function buildSimulation(
  analysis: ImportAnalysis,
  now = new Date(),
): Promise<DownloadedFile> {
  const { preview } = analysis
  const changes: ReceiptChange[] = []
  for (const row of preview.rows) {
    const product = row.name ?? row.code
    if (row.action === 'create') {
      changes.push({
        code: row.code,
        product,
        action: 'created',
        field: null,
        before: null,
        after: null,
      })
    }
    if (row.action === 'update') {
      for (const change of row.changes) {
        changes.push({ code: row.code, product, action: 'updated', ...change })
      }
    }
  }
  changes.sort((a, b) => a.code.localeCompare(b.code))
  const { buildReceipt } = await import('./receipt')
  const buffer = await buildReceipt({
    kind: 'simulation',
    fileName: preview.fileName,
    generatedAt: now,
    counts: {
      created: preview.rows.filter((row) => row.action === 'create').length,
      updated: preview.updates,
      unchanged: preview.counts.unchanged,
      skipped: preview.counts.omitted,
      errors: preview.counts.error,
    },
    categoriesCreated: preview.bars.filter((bar) => bar.tag === 'new').map((bar) => bar.name),
    changes,
    previous: [],
    columns: preview.columns,
  })
  return {
    base64: buffer.toString('base64'),
    fileName: `simulacion-importacion-${limaDay(now)}.xlsx`,
  }
}

// «Descargar filas con errores» (spec §6.6): null si no hay ninguna.
export async function buildErrors(
  analysis: ImportAnalysis,
  now = new Date(),
): Promise<DownloadedFile | null> {
  if (analysis.errorRows.length === 0) return null
  const { buildErrorsFile } = await import('./errors-file')
  const buffer = await buildErrorsFile(analysis.errorRows, analysis.preview.columns)
  return { base64: buffer.toString('base64'), fileName: `filas-con-errores-${limaDay(now)}.xlsx` }
}
