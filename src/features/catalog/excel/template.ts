import 'server-only'
import ExcelJS from 'exceljs'
import { IMPORT_MAX_ROWS, templateTitles } from '../import/options'
import { IMPORT_COLUMNS, type ImportColumn } from '../import/types'
import { priceColumns } from '../price-columns'
import { COLORS, FONT, styleBodyRow, styleHeaderRow } from './theme'

const WIDTHS: Record<ImportColumn, number> = {
  code: 16,
  name: 40,
  description: 60,
  category: 24,
  price: 18,
}
const LAST_ROW = IMPORT_MAX_ROWS + 1

type Validations = { add(range: string, validation: ExcelJS.DataValidation): void }

// ExcelJS acepta validaciones por rango aunque sus tipos no lo declaren: una sola regla para 5 000
// filas y un archivo de pocos KB.
const validations = (sheet: ExcelJS.Worksheet) =>
  (sheet as unknown as { dataValidations: Validations }).dataValidations

const EXAMPLES: ExcelJS.CellValue[][] = [
  ['LAP-001', 'Laptop 14" Core i5', 'Core i5 · 16 GB · SSD 512 GB', 'Laptops', 2590],
  ['IMP-014', 'Impresora láser HP M404dn', 'Monocromática, dúplex', 'Impresoras', 1180],
  ['FOT-002', 'Fotocopiadora Ricoh MP 3054', null, 'Fotocopiadoras', 12500],
]

// Hoja «Instrucciones», la primera al abrir (spec §8): pasos cortos y un ejemplo que no se importa.
function writeInstructions(sheet: ExcelJS.Worksheet) {
  const titles = templateTitles()
  sheet.columns = [{ width: 3 }, ...IMPORT_COLUMNS.map((column) => ({ width: WIDTHS[column] }))]
  const title = sheet.getCell('B2')
  title.value = 'Cómo cargar tus productos'
  title.font = { name: FONT, size: 16, bold: true, color: { argb: COLORS.ink } }
  const steps = [
    'Completa la hoja «Productos»: una fila por producto, desde la fila 2.',
    'Código es obligatorio. Si ya existe, se actualiza ese producto; si no, se crea uno nuevo.',
    `Para un producto nuevo completa también Nombre, Categoría y ${titles.price}.`,
    `${priceColumns().note} Por ejemplo 1250.50 o 1,250.50.`,
    'Elige la categoría del desplegable o escribe una nueva: se creará al importar.',
    `Para actualizar solo precios, deja Código y ${titles.price}, y borra las demás columnas.`,
    'Puedes dejar filas vacías: se ignoran. No cambies los títulos de la primera fila.',
    'Súbela en Productos › Carga masiva: antes de guardar verás qué pasará con cada fila.',
  ]
  steps.forEach((text, index) => {
    const row = 4 + index
    sheet.mergeCells(row, 2, row, 6)
    const cell = sheet.getCell(row, 2)
    cell.value = `${index + 1}. ${text}`
    cell.font = { name: FONT, size: 11, color: { argb: COLORS.ink } }
  })

  const exampleTitle = sheet.getCell(13, 2)
  exampleTitle.value = 'Ejemplo'
  exampleTitle.font = { name: FONT, size: 13, bold: true, color: { argb: COLORS.link } }
  const header = sheet.getRow(14)
  header.values = [null, ...IMPORT_COLUMNS.map((column) => titles[column])]
  styleHeaderRow(header)
  EXAMPLES.forEach((values, index) => {
    const row = sheet.getRow(15 + index)
    row.values = [null, ...values]
    styleBodyRow(row, index)
  })
  sheet.mergeCells(19, 2, 19, 6)
  const note = sheet.getCell(19, 2)
  note.value = 'Las filas de ejemplo de esta hoja no se importan.'
  note.font = { name: FONT, size: 10, italic: true, color: { argb: COLORS.muted } }
}

// Plantilla de importación (spec §8): desplegable de categorías desde una hoja oculta (una lista
// escrita no puede pasar de 255 caracteres), ayudas al seleccionar cada celda y el código como
// texto, para que Excel no convierta «00123» ni «1E5».
export async function buildTemplate(categories: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Ventronix · Catálogo comercial'
  const titles = templateTitles()

  writeInstructions(
    workbook.addWorksheet('Instrucciones', { properties: { tabColor: { argb: COLORS.ink } } }),
  )

  const products = workbook.addWorksheet('Productos', {
    properties: { tabColor: { argb: COLORS.primary } },
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  products.columns = IMPORT_COLUMNS.map((column) => ({ width: WIDTHS[column] }))
  const header = products.getRow(1)
  header.values = IMPORT_COLUMNS.map((column) => titles[column])
  styleHeaderRow(header)
  products.getColumn(1).numFmt = '@'
  products.getColumn(3).alignment = { wrapText: true, vertical: 'top' }
  products.getColumn(5).numFmt = '#,##0.00'

  const rules = validations(products)
  const help = { allowBlank: true, showInputMessage: true, showErrorMessage: true }
  rules.add(`A2:A${LAST_ROW}`, {
    ...help,
    type: 'textLength',
    operator: 'between',
    formulae: [1, 64],
    promptTitle: 'Código',
    prompt: 'Obligatorio y único. Si ya existe, se actualiza ese producto.',
    errorStyle: 'stop',
    errorTitle: 'Código',
    error: 'Usa de 1 a 64 caracteres.',
  })
  rules.add(`B2:B${LAST_ROW}`, {
    ...help,
    type: 'textLength',
    operator: 'between',
    formulae: [1, 120],
    promptTitle: 'Nombre',
    prompt: 'Obligatorio para productos nuevos. Hasta 120 caracteres.',
    errorStyle: 'stop',
    errorTitle: 'Nombre',
    error: 'Usa como máximo 120 caracteres.',
  })
  rules.add(`C2:C${LAST_ROW}`, {
    ...help,
    type: 'textLength',
    operator: 'between',
    formulae: [0, 2000],
    promptTitle: 'Descripción',
    prompt: 'Opcional, hasta 2 000 caracteres. Puede tener varias líneas.',
    errorStyle: 'stop',
    errorTitle: 'Descripción',
    error: 'Usa como máximo 2000 caracteres.',
  })
  rules.add(
    `D2:D${LAST_ROW}`,
    categories.length > 0
      ? {
          ...help,
          type: 'list',
          formulae: [`'Categorías'!$A$1:$A$${categories.length}`],
          promptTitle: 'Categoría',
          prompt: 'Elígela del desplegable o escribe una nueva: se creará al importar.',
          // Información y no advertencia: una categoría nueva no es un error.
          errorStyle: 'information',
          errorTitle: 'Categoría nueva',
          error: 'No está en tu lista: se creará al importar.',
        }
      : {
          ...help,
          type: 'textLength',
          operator: 'between',
          formulae: [1, 120],
          promptTitle: 'Categoría',
          prompt: 'Escribe la categoría: se creará al importar.',
          errorStyle: 'stop',
          errorTitle: 'Categoría',
          error: 'Usa como máximo 120 caracteres.',
        },
  )
  rules.add(`E2:E${LAST_ROW}`, {
    ...help,
    type: 'decimal',
    operator: 'greaterThan',
    formulae: [0],
    promptTitle: titles.price,
    prompt: priceColumns().note,
    errorStyle: 'stop',
    errorTitle: 'Precio',
    error: 'Escribe un precio mayor que 0, con hasta 2 decimales.',
  })

  const list = workbook.addWorksheet('Categorías', { state: 'hidden' })
  categories.forEach((name, index) => {
    list.getCell(index + 1, 1).value = name
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
