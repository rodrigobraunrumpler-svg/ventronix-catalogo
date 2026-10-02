'use server'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { headers } from 'next/headers'
import { z } from 'zod'
import { getCompanyProfile } from '@/features/company/queries'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { failure, invalid } from '../action-errors'
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
import { resolveDateRange } from '../list-options'
import { exportProductRows } from './queries'

export type ExcelFile = { base64: string; fileName: string; count: number; truncated: boolean }

// Ya se incluye en la función de /products (next.config.ts, outputFileTracingIncludes).
const LOGO = path.join(process.cwd(), 'public/brand/ventronix-logo-proforma.jpg')

// Dirección de la app para «Abrir esta vista en la app», tomada de la petición (spec §5.2).
async function viewUrl(pathAndQuery: string) {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host')
  if (!host) return null
  const protocol =
    list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}${pathAndQuery}`
}

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
    const [company, logo] = await Promise.all([
      getCompanyProfile(supabase),
      readFile(LOGO).catch(() => null),
    ])

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
            viewUrl: await viewUrl(exportViewPath(parsed.data)),
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
