// Tipos de la carga masiva que comparten el servidor y la pantalla (spec del Excel §6).

// Columnas que entiende la carga masiva. Código es la única obligatoria del archivo (spec §6.7).
export const IMPORT_COLUMNS = ['code', 'name', 'description', 'category', 'price'] as const
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]
export type DataColumn = Exclude<ImportColumn, 'code'>
export const DATA_COLUMNS: DataColumn[] = ['name', 'description', 'category', 'price']

export const IMPORT_MODES = ['all', 'create', 'update'] as const
export type ImportMode = (typeof IMPORT_MODES)[number]

// Qué hacer con una categoría del archivo que no existe tal cual (spec §6.8).
export type CategoryDecision = { action: 'use'; target: string } | { action: 'create' }

export type ImportOptions = {
  pricesIncludeTax: boolean
  mode: ImportMode
  // La clave es la categoría del archivo en minúsculas y sin espacios en los extremos.
  categoryMap: Record<string, CategoryDecision>
}

// Cada fila cuenta en una sola tarjeta (spec §6.6): con errores, para revisar y luego lo que pasa.
export type RowStatus = 'create' | 'update' | 'unchanged' | 'review' | 'error' | 'omitted'
export type RowAction = 'create' | 'update' | 'unchanged'

export type FieldChange = { field: DataColumn; before: string | null; after: string | null }

export type PreviewRow = {
  line: number
  status: RowStatus
  // Lo que pasará con la fila; null si tiene errores o queda omitida.
  action: RowAction | null
  code: string
  // Valores tras importar: los del archivo o, si su columna no viene, los actuales.
  name: string | null
  category: string | null
  price: string | null
  // Precio del archivo antes de sumar el IGV, con «No incluyen IGV».
  priceBeforeTax: string | null
  changes: FieldChange[]
  warnings: string[]
  errors: string[]
}

export type PreviewCounts = Record<RowStatus, number>

// Precios que suben y bajan entre los que se actualizan, con el cambio promedio (0.082 = +8.2 %).
export type PriceTrend = {
  up: number
  down: number
  upAverage: number | null
  downAverage: number | null
}

export type CategoryKind = 'near' | 'similar' | 'new'

// Una categoría del archivo que no existe tal cual (spec §6.8).
export type CategoryChoice = {
  key: string
  name: string
  kind: CategoryKind
  suggestion: string | null
  decision: CategoryDecision | null
  products: number
}

// Productos del archivo por categoría, para las barras del resumen.
export type CategoryBar = { name: string; products: number; tag: 'new' | 'similar' | null }

export type ImportPreview = {
  fileName: string
  sheetName: string
  columns: ImportColumn[]
  partialNotice: string | null
  // «Valor sin IGV (S/)» del reporte no se importa: se avisa por si alguien lo cambió.
  ignoredNotice: string | null
  rows: PreviewRow[]
  counts: PreviewCounts
  prices: PriceTrend
  choices: CategoryChoice[]
  bars: CategoryBar[]
  undecided: number
  // Nuevos, se actualizan y para revisar: lo que dice el botón «Importar N productos».
  importable: number
  // Productos existentes que cambian: los cuenta la confirmación.
  updates: number
}

export type DownloadedFile = { base64: string; fileName: string }

export type ImportOutcome = {
  created: number
  updated: number
  unchanged: number
  skipped: number
  errors: number
  categoriesCreated: string[]
  receipt: DownloadedFile
}
