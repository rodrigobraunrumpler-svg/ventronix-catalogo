import { centsToDecimal, parseCents } from '@/features/proforma/money'
import { applyTax } from '@/features/proforma/tax'
import type { ImportColumn } from '../import/types'
import { categorySchema, productSchema } from '../schemas'
import { cellPrice, cellText, checkPrice, EMPTY_CELL, type ReadRow } from './normalize'

export const COLUMN_LABELS: Record<ImportColumn, string> = {
  code: 'Código',
  name: 'Nombre',
  description: 'Descripción',
  category: 'Categoría',
  price: 'Precio',
}

// Una fila con sus valores limpios y validados; solo trae las columnas presentes y válidas.
export type CheckedRow = {
  line: number
  code: string
  // Código válido y primera vez en el archivo: se puede buscar en la base.
  codeOk: boolean
  name?: string
  description?: string | null
  category?: string
  price?: string
  priceBeforeTax?: string
  errors: string[]
}

export type TaxOption = { pricesIncludeTax: boolean; ratePercent: number }

// «Precio: escribe solo números…»: el motivo sigue en minúscula tras el nombre de la columna.
export const fieldError = (column: ImportColumn, message: string) =>
  `${COLUMN_LABELS[column]}: ${message.charAt(0).toLowerCase()}${message.slice(1)}`

// Columna presente con la celda vacía (spec §6.7): solo la descripción puede quedar vacía, y se borra.
const EMPTY_MESSAGES = {
  name: 'Nombre: está vacío. Escríbelo o quita la columna del archivo.',
  category: 'Categoría: está vacía. Escríbela o quita la columna del archivo.',
  price: 'Precio: está vacío. Escríbelo o quita la columna del archivo.',
}

// Las mismas reglas del formulario (spec §3), aplicadas solo a las columnas presentes. Un producto
// nuevo sin nombre, categoría o precio se detecta después, cuando la base dice que el código no existe.
export function checkRows(rows: ReadRow[], columns: ImportColumn[], tax: TaxOption): CheckedRow[] {
  const firstLine = new Map<string, number>()
  const has = (column: ImportColumn) => columns.includes(column)
  return rows.map((row) => {
    const checked: CheckedRow = { line: row.line, code: '', codeOk: false, errors: [] }
    const fail = (column: ImportColumn, message: string) =>
      checked.errors.push(fieldError(column, message))
    const cell = (column: ImportColumn) => row.cells[column] ?? EMPTY_CELL

    const code = cellText(cell('code'), { integerOnly: true })
    if (!code.ok) fail('code', code.error)
    else {
      checked.code = code.value.toUpperCase()
      const parsed = productSchema.shape.code.safeParse(code.value)
      if (!parsed.success) fail('code', parsed.error.issues[0].message)
      else if (firstLine.has(parsed.data)) {
        checked.errors.push(`Código repetido: ya está en la fila ${firstLine.get(parsed.data)}.`)
      } else {
        firstLine.set(parsed.data, row.line)
        checked.codeOk = true
      }
    }

    if (has('name')) {
      const name = cellText(cell('name'))
      if (!name.ok) fail('name', name.error)
      else if (name.value === '') checked.errors.push(EMPTY_MESSAGES.name)
      else {
        const parsed = productSchema.shape.name.safeParse(name.value)
        if (parsed.success) checked.name = parsed.data
        else fail('name', parsed.error.issues[0].message)
      }
    }

    if (has('description')) {
      const description = cellText(cell('description'), { multiline: true })
      if (!description.ok) fail('description', description.error)
      else {
        const parsed = productSchema.shape.description.safeParse(description.value)
        if (parsed.success) checked.description = parsed.data
        else fail('description', parsed.error.issues[0].message)
      }
    }

    if (has('category')) {
      const category = cellText(cell('category'))
      if (!category.ok) fail('category', category.error)
      else if (category.value === '') checked.errors.push(EMPTY_MESSAGES.category)
      else {
        const parsed = categorySchema.shape.name.safeParse(category.value)
        if (parsed.success) checked.category = parsed.data
        else fail('category', parsed.error.issues[0].message)
      }
    }

    if (has('price')) {
      const price = cellPrice(cell('price'))
      if (!price.ok) fail('price', price.error)
      else if (price.value === '') checked.errors.push(EMPTY_MESSAGES.price)
      else if (tax.pricesIncludeTax) checked.price = price.value
      else {
        // «No incluyen IGV: sumar 18 %» (spec §9.4): en céntimos, con la mitad hacia arriba y antes de
        // validar, así que un precio que pasa el máximo da su error normal.
        const cents = parseCents(price.value) ?? BigInt(0)
        const total = applyTax(cents, { mode: 'added', ratePercent: tax.ratePercent }).total
        const withTax = checkPrice(centsToDecimal(total))
        if (!withTax.ok) fail('price', withTax.error)
        else {
          checked.price = withTax.value
          checked.priceBeforeTax = price.value
        }
      }
    }
    return checked
  })
}
