'use server'

import { z } from 'zod'
import { failure, invalid } from '@/features/catalog/action-errors'
import { EXPORT_MAX_ROWS } from '@/features/catalog/excel/export-request'
import { readReportLogo } from '@/features/catalog/excel/theme'
import { resolveDateRange } from '@/features/catalog/list-options'
import type { ExcelFile } from '@/features/catalog/products/excel-actions'
import { idSchema } from '@/features/catalog/schemas'
import { getCompanyProfile } from '@/features/company/queries'
import { getWhatsAppProvider } from '@/features/whatsapp/provider'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { appUrl } from '@/lib/request-url'
import {
  describeHistoryFilters,
  historyFileName,
  historyFiltersSchema,
  historyViewPath,
} from './export-request'
import { exportProformaRows } from './queries'
import { resendStoredProforma, storedProformaDocument } from './service'
import type { StoredDocument } from './snapshot'

// «Ver PDF», «Descargar PDF» y el mensaje de «Reenviar» (spec de productos libres §6).
export async function getProformaDocument(id: unknown): Promise<ActionResult<StoredDocument>> {
  return withOwner(async ({ supabase }) => {
    const parsed = idSchema.safeParse(id)
    if (!parsed.success) return invalid(parsed.error)
    return storedProformaDocument(supabase, parsed.data)
  })
}

const resendSchema = z.object({ id: idSchema, phone: z.string().max(20) })

// Reenvío con el WhatsApp de la empresa (spec §4.4): conecta, envía y guarda la sesión, hasta un
// minuto (maxDuration de Proformas).
export async function resendProforma(input: unknown): Promise<ActionResult<{ phone: string }>> {
  return withOwner(async ({ supabase }) => {
    const parsed = resendSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return resendStoredProforma(supabase, parsed.data, getWhatsAppProvider(supabase))
  })
}

// «Descargar Excel» del historial (spec de productos libres §6): lo filtrado, de la más reciente a
// la más antigua, con el tope de Productos. ExcelJS se carga solo aquí, con import().
export async function exportProformas(filters: unknown): Promise<ActionResult<ExcelFile>> {
  return withOwner(async ({ supabase }) => {
    const parsed = historyFiltersSchema.safeParse(filters)
    if (!parsed.success) {
      return failure(
        'VALIDATION',
        'Los filtros de la lista no son válidos. Recarga la página e inténtalo de nuevo.',
      )
    }
    const now = new Date()
    const range = resolveDateRange(parsed.data, now)
    const rows = await exportProformaRows(
      supabase,
      { search: parsed.data.search, dateFrom: range?.from ?? null, dateTo: range?.to ?? null },
      EXPORT_MAX_ROWS + 1,
    )
    if (rows.length === 0) {
      return failure('VALIDATION', 'No hay proformas para descargar con estos filtros.')
    }
    const truncated = rows.length > EXPORT_MAX_ROWS
    const included = truncated ? rows.slice(0, EXPORT_MAX_ROWS) : rows
    const [company, logo, viewUrl] = await Promise.all([
      getCompanyProfile(supabase),
      readReportLogo(),
      appUrl(historyViewPath(parsed.data)),
    ])
    const { buildProformasReport } = await import('./excel')
    const buffer = await buildProformasReport({
      rows: included,
      companyName: company?.trade_name ?? company?.legal_name ?? null,
      logo,
      generatedAt: now,
      filtersText: describeHistoryFilters(parsed.data),
      viewUrl,
      truncatedAt: truncated ? EXPORT_MAX_ROWS : null,
    })
    return {
      ok: true,
      data: {
        base64: buffer.toString('base64'),
        fileName: historyFileName(parsed.data, now),
        count: included.length,
        truncated,
      },
    }
  })
}
