import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { REPORT_TABLE_ROW } from '@/features/catalog/excel/theme'
import { buildProformasReport } from '@/features/proforma/history/excel'
import {
  describeHistoryFilters,
  historyFileName,
  historyFiltersSchema,
  historyViewPath,
} from '@/features/proforma/history/export-request'
import type { ProformaRow } from '@/features/proforma/history/queries'

const row = (number: number, overrides: Partial<ProformaRow> = {}): ProformaRow => ({
  id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
  number,
  // 03:00 UTC del 3 de octubre = 2 de octubre en Lima.
  issued_at: '2026-10-03T03:00:00Z',
  valid_until: '2026-10-09',
  client_name: 'Inversiones Nuevo Sol S.A.C.',
  client_document: '20601234567',
  client_phone: '987 654 321',
  item_count: 3,
  total: '7960.00',
  ...overrides,
})

const input = {
  rows: [row(42), row(41, { client_name: '=HIPERVINCULO("x")', total: '350.50' })],
  companyName: 'Ventronix',
  logo: null,
  generatedAt: new Date('2026-10-06T19:35:00Z'),
  filtersText: 'Búsqueda: perez',
  viewUrl: 'https://ventronix-catalogo.vercel.app/proformas?search=perez',
  truncatedAt: null,
}

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(buffer).buffer)
  return workbook.getWorksheet('Proformas')!
}

describe('buildProformasReport', () => {
  it('arma la cabecera, las columnas de cada proforma y la suma del periodo debajo', async () => {
    const sheet = await load(await buildProformasReport(input))
    expect(sheet.getCell('C1').value).toBe('Ventronix')
    expect(sheet.getCell('C2').value).toBe('Reporte de proformas')
    expect(sheet.getCell('C3').value).toBe('Generado el 06/10/2026 a las 14:35 (hora de Lima)')
    expect(sheet.getCell('C4').value).toBe('Búsqueda: perez')
    expect(sheet.getCell('C5').value).toBe('2 proformas')
    expect((sheet.getRow(REPORT_TABLE_ROW).values as unknown[]).slice(1)).toEqual([
      'N°',
      'Fecha',
      'Cliente',
      'RUC/DNI',
      'Celular',
      'Productos',
      'Total',
      'Vence',
    ])
    const first = sheet.getRow(REPORT_TABLE_ROW + 1)
    expect(first.getCell(1).value).toBe(42)
    expect(first.getCell(1).numFmt).toBe('0000')
    expect(first.getCell(2).value).toEqual(new Date('2026-10-02T00:00:00.000Z'))
    expect(first.getCell(7).value).toBe(7960)
    expect(first.getCell(8).value).toEqual(new Date('2026-10-09T00:00:00.000Z'))
    expect(sheet.getRow(REPORT_TABLE_ROW + 2).getCell(3).value).toBe('=HIPERVINCULO("x")')
    const total = sheet.getRow(REPORT_TABLE_ROW + 4)
    expect(total.getCell(3).value).toBe('Total del periodo')
    expect(total.getCell(7).value).toBe(8310.5)
  })

  it('avisa si se recortó en el tope', async () => {
    const sheet = await load(await buildProformasReport({ ...input, truncatedAt: 10_000 }))
    expect(sheet.getCell('C7').value).toBe('Este reporte muestra las primeras 10 000 proformas.')
  })
})

describe('filtros del Excel', () => {
  const parse = (value: object) =>
    historyFiltersSchema.parse({ search: '', date: null, from: null, to: null, ...value })
  const now = new Date('2026-10-06T15:00:00Z')

  it('describe los filtros, nombra el archivo con ellos y arma el enlace a la vista', () => {
    expect(describeHistoryFilters(parse({}))).toBe('Sin filtros')
    expect(describeHistoryFilters(parse({ search: ' Pérez ', date: 'month' }))).toBe(
      'Búsqueda: Pérez · Fecha: este mes',
    )
    expect(historyFileName(parse({}), now)).toBe('proformas-2026-10-06.xlsx')
    expect(historyFileName(parse({ search: 'Pérez', date: 'month' }), now)).toBe(
      'proformas-perez-este-mes-2026-10-06.xlsx',
    )
    expect(
      historyViewPath(
        parse({ search: 'perez', date: 'custom', from: '2026-10-01', to: '2026-10-05' }),
      ),
    ).toBe('/proformas?search=perez&date=custom&from=2026-10-01&to=2026-10-05')
    expect(historyViewPath(parse({}))).toBe('/proformas')
  })

  it('rechaza fechas que no existen', () => {
    expect(
      historyFiltersSchema.safeParse({ search: '', date: 'custom', from: '2026-02-30', to: null })
        .success,
    ).toBe(false)
  })
})
