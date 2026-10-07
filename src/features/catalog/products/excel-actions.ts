'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getCompanyProfile } from '@/features/company/queries'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { appUrl } from '@/lib/request-url'
import type { Database } from '@/lib/supabase/database.types'
import { failure, invalid } from '../action-errors'
import { listCategoryOptions } from '../categories/queries'
import {
  describeExportFilters,
  EXPORT_FORMATS,
  EXPORT_MAX_ROWS,
  exportFileName,
  exportFiltersSchema,
  exportViewPath,
  type ExportFilters,
  type ExportFormat,
} from '../excel/export-request'
import { readImportRequest } from '../excel/import-request'
import { readReportLogo } from '../excel/theme'
import type { DownloadedFile, ImportOutcome, ImportPreview } from '../import/types'
import { resolveDateRange } from '../list-options'
import { exportProductRows } from './queries'

export type ExcelFile = { base64: string; fileName: string; count: number; truncated: boolean }

// «Descargar Excel» (spec del Excel §5): lo filtrado, en el orden de la lista. ExcelJS se carga
// solo aquí, con import(), para no frenar el arranque de la página.
export async function exportProducts(
  filters: ExportFilters,
  format: ExportFormat,
): Promise<ActionResult<ExcelFile>> {
  return withOwner(async ({ supabase }) => {
    const parsed = exportFiltersSchema.safeParse(filters)
    if (!parsed.success) {
      return failure(
        'VALIDATION',
        'Los filtros de la lista no son válidos. Recarga la página e inténtalo de nuevo.',
      )
    }
    const kind = z.enum(EXPORT_FORMATS).safeParse(format)
    if (!kind.success) return invalid(kind.error)

    const now = new Date()
    const range = resolveDateRange(parsed.data, now)
    const rows = await exportProductRows(
      supabase,
      {
        search: parsed.data.search,
        category: parsed.data.category,
        dateBy: parsed.data.dateBy,
        dateFrom: range?.from ?? null,
        dateTo: range?.to ?? null,
        sort: parsed.data.sort,
      },
      EXPORT_MAX_ROWS + 1,
    )
    if (rows.length === 0) {
      return failure('VALIDATION', 'No hay productos para descargar con estos filtros.')
    }
    const truncated = rows.length > EXPORT_MAX_ROWS
    const included = truncated ? rows.slice(0, EXPORT_MAX_ROWS) : rows

    const category = parsed.data.category
      ? await supabase
          .from('categories')
          .select('name')
          .eq('id', parsed.data.category)
          .maybeSingle()
      : null
    const categoryName = category?.data?.name ?? null
    const [company, logo] = await Promise.all([getCompanyProfile(supabase), readReportLogo()])

    const buffer =
      kind.data === 'report'
        ? await (
            await import('../excel/report')
          ).buildProductsReport({
            rows: included,
            companyName: company?.trade_name ?? company?.legal_name ?? null,
            logo,
            generatedAt: now,
            filtersText: describeExportFilters(parsed.data, categoryName),
            viewUrl: await appUrl(exportViewPath(parsed.data)),
            truncatedAt: truncated ? EXPORT_MAX_ROWS : null,
          })
        : await (
            await import('../excel/price-list')
          ).buildPriceList({ rows: included, company, logo, generatedAt: now })

    return {
      ok: true,
      data: {
        base64: buffer.toString('base64'),
        fileName: exportFileName(kind.data, categoryName, now),
        count: included.length,
        truncated,
      },
    }
  })
}

// Plantilla de la carga masiva (spec §8), con las categorías actuales en su desplegable.
export async function downloadImportTemplate(): Promise<ActionResult<DownloadedFile>> {
  return withOwner(async ({ supabase }) => {
    const categories = await listCategoryOptions(supabase)
    const { buildTemplate } = await import('../excel/template')
    const buffer = await buildTemplate(categories.map((category) => category.name))
    return {
      ok: true,
      data: { base64: buffer.toString('base64'), fileName: 'plantilla-carga-masiva.xlsx' },
    }
  })
}

// Cada acción de la carga masiva vuelve a leer y validar el archivo: nunca se confía en el
// navegador (spec §3). ExcelJS se carga solo aquí.
async function analyzeRequest(supabase: SupabaseClient<Database>, formData: FormData) {
  const request = readImportRequest(formData)
  if (!request.ok) return { ok: false as const, failure: failure('VALIDATION', request.message) }
  const { analyzeImport } = await import('../excel/import-service')
  const result = await analyzeImport(supabase, {
    data: await request.file.arrayBuffer(),
    fileName: request.file.name,
    options: request.options,
  })
  if (!result.ok) return { ok: false as const, failure: failure('VALIDATION', result.message) }
  return { ok: true as const, analysis: result.analysis, options: request.options }
}

export async function previewProductImport(
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  return withOwner(async ({ supabase }) => {
    const result = await analyzeRequest(supabase, formData)
    return result.ok ? { ok: true, data: result.analysis.preview } : result.failure
  })
}

export async function importProducts(formData: FormData): Promise<ActionResult<ImportOutcome>> {
  return withOwner(async ({ supabase }) => {
    const result = await analyzeRequest(supabase, formData)
    if (!result.ok) return result.failure
    const { runImport } = await import('../excel/import-service')
    return runImport(supabase, result.analysis, result.options.mode)
  })
}

export async function downloadImportSimulation(
  formData: FormData,
): Promise<ActionResult<DownloadedFile>> {
  return withOwner(async ({ supabase }) => {
    const result = await analyzeRequest(supabase, formData)
    if (!result.ok) return result.failure
    const { buildSimulation } = await import('../excel/import-service')
    return { ok: true, data: await buildSimulation(result.analysis) }
  })
}

export async function downloadImportErrors(
  formData: FormData,
): Promise<ActionResult<DownloadedFile>> {
  return withOwner(async ({ supabase }) => {
    const result = await analyzeRequest(supabase, formData)
    if (!result.ok) return result.failure
    const { buildErrors } = await import('../excel/import-service')
    const file = await buildErrors(result.analysis)
    return file
      ? { ok: true, data: file }
      : failure('VALIDATION', 'Este archivo no tiene filas con errores.')
  })
}
