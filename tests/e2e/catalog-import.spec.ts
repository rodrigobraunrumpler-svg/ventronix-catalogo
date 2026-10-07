import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { connect, resetCatalog } from '../integration/db'
import { login } from './session'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const TITLES = ['Código', 'Nombre', 'Descripción', 'Categoría', 'Precio con IGV (S/)']

async function seed() {
  const db = await connect()
  try {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string; name: string }>(
      "insert into public.categories (name) values ('Laptops'), ('Impresoras') returning id, name",
    )
    const id = (name: string) => rows.find((row) => row.name === name)!.id
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, description) values
         ('LAP-001', 'Laptop básica', $1, 1180.00, 'Core i3'),
         ('IMP-001', 'Impresora láser', $2, 590.00, 'Monocromática')`,
      [id('Laptops'), id('Impresoras')],
    )
  } finally {
    await db.end()
  }
}

async function product(code: string) {
  const db = await connect()
  try {
    const { rows } = await db.query<{
      name: string
      description: string | null
      price: string
      category: string
    }>(
      `select p.name, p.description, p.unit_price::text as price, c.name as category
         from public.products p join public.categories c on c.id = p.category_id
        where p.code = $1`,
      [code],
    )
    return rows[0] ?? null
  } finally {
    await db.end()
  }
}

// Un .xlsx como el que haría quien gestiona el catálogo: títulos en la fila 1 y una fila por producto.
async function workbook(rows: (string | number | null)[][], titles = TITLES) {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Productos')
  sheet.addRow(titles)
  for (const row of rows) sheet.addRow(row)
  return Buffer.from(await book.xlsx.writeBuffer())
}

// Abre la carga masiva y espera a que la página responda: un archivo elegido antes de que React tome
// la página se perdería. Solo pasa en las pruebas, que eligen el archivo al instante.
async function openImport(page: Page) {
  await page.goto('/products/import')
  await page.waitForLoadState('networkidle')
}

const upload = (page: Page, buffer: Buffer, name = 'productos.xlsx') =>
  page.locator('input[type="file"]').setInputFiles({ name, mimeType: XLSX, buffer })

async function download(page: Page, button: string) {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ])
  return file
}

async function readDownload(file: Download) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile((await file.path())!)
  return book
}

async function importAndConfirm(page: Page, button: string) {
  await page.getByRole('button', { name: button }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Importar' }).click()
  await expect(
    page.getByRole('heading', { name: '¡Listo! Tu catálogo está actualizado' }),
  ).toBeFocused()
}

const visibleText = (page: Page, text: string | RegExp) =>
  page.getByText(text).filter({ visible: true }).first()

// Nada se sale de la pantalla: ni la tabla, ni la maqueta de la plantilla, ni la barra fija.
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

// Capturas para revisarlas a ojo en test-results/ (no se suben al repositorio).
// Con las animaciones terminadas, para ver la pantalla como queda.
const capture = (page: Page, name: string) =>
  page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: true,
    animations: 'disabled',
  })

const box = async (locator: Locator) => (await locator.boundingBox())!

test('se entra desde Productos: lo primero es dónde subir el Excel, y cada archivo se descarga', async ({
  page,
}) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Carga masiva' }).click()
  await expect(page).toHaveURL('/products/import')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Carga masiva de productos' }),
  ).toBeVisible()
  // La zona de carga se ve entera al entrar, sin bajar, en PC y en el teléfono.
  const zone = page.getByRole('button', { name: /Arrastra tu Excel/ })
  await expect(zone).toBeInViewport({ ratio: 1 })
  await expectNoHorizontalScroll(page)
  await capture(page, 'entrada')

  if (test.info().project.name === 'desktop') {
    const guide = page.getByText('¿Cómo completo el archivo?')
    await guide.click()
    for (const width of [1024, 1280, 1440, 1920, 2338]) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await expect(zone).toBeInViewport({ ratio: 1 })
      // La pantalla ocupa todo el contenedor, como Productos: con sitio, la zona de carga y las
      // descargas van lado a lado y llegan hasta el borde.
      const main = await box(page.locator('main'))
      const files = await box(
        page.getByRole('complementary', { name: '¿Aún no tienes el archivo?' }),
      )
      expect(main.x + main.width - (files.x + files.width)).toBeLessThanOrEqual(41)
      if (width >= 1280)
        expect(files.x).toBeGreaterThan((await box(zone)).x + (await box(zone)).width)
      // La guía, abierta, trae su tabla entera, sin barra propia.
      const table = page.getByRole('table', {
        name: 'Ejemplo de la hoja Productos de la plantilla',
      })
      expect(
        await table.locator('..').evaluate((element) => element.scrollWidth - element.clientWidth),
      ).toBeLessThanOrEqual(0)
      await expectNoHorizontalScroll(page)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  }

  const catalog = await download(page, 'Descargar mi catálogo')
  expect(catalog.suggestedFilename()).toMatch(/^productos-\d{4}-\d{2}-\d{2}\.xlsx$/)
  await expect(page.getByText('Catálogo descargado · 2 productos')).toBeVisible()

  const template = await download(page, 'Descargar plantilla')
  expect(template.suggestedFilename()).toBe('plantilla-carga-masiva.xlsx')
  const book = await readDownload(template)
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
    'Instrucciones',
    'Productos',
    'Categorías',
  ])
})

test('un archivo mixto: decide la categoría, confirma, importa y deja el comprobante', async ({
  page,
}) => {
  await seed()
  await login(page)
  await openImport(page)
  await upload(
    page,
    await workbook([
      ['LAP-001', 'Laptop básica', 'Core i3', 'Laptops', 1298],
      ['IMP-001', 'Impresora láser', 'Monocromática', 'Impresoras', 590],
      ['MON-001', 'Monitor 24"', null, 'Monitores', 799],
      ['LAP-002', 'Laptop gamer', null, 'Laptps', 4999],
      ['BAD-001', 'Sin precio', null, 'Laptops', 'abc'],
    ]),
  )

  await expect(page.getByRole('heading', { name: 'Esto es lo que va a pasar' })).toBeFocused()
  await expect(page.getByRole('tab', { name: /Con errores/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(visibleText(page, /Precio: escribe solo números/)).toBeVisible()
  await expect(
    page.getByText('«Laptps» se parece a «Laptops». ¿Usar esa?', { exact: false }),
  ).toBeVisible()
  const importButton = page.getByRole('button', { name: 'Importar 3 productos' })
  await expect(importButton).toBeDisabled()
  await expectNoHorizontalScroll(page)
  await capture(page, 'vista-previa')

  // Las opciones no se estiran: todas miden lo mismo.
  const option = (text: RegExp) => box(page.locator('label').filter({ hasText: text }))
  expect((await option(/^Incluyen IGV$/)).height).toBe(
    (await option(/^Crear y actualizar$/)).height,
  )
  // El aviso de errores no se queda en una columna estrecha: el botón baja si no cabe al lado.
  expect((await box(page.getByText(/fila con errores no se importará/))).width).toBeGreaterThan(200)
  // La barra fija ocupa una fila en PC y dos filas cortas en el teléfono.
  const bar = await box(page.getByRole('region', { name: 'Importación', exact: true }))
  expect(bar.height).toBeLessThan(test.info().project.name === 'mobile' ? 140 : 80)

  await page.getByRole('button', { name: 'Usar "Laptops"' }).click()
  await expect(importButton).toBeEnabled()
  await importAndConfirm(page, 'Importar 3 productos')
  await expect(
    page.getByText('2 productos creados · 1 actualizado · 1 sin cambios · 1 categoría nueva'),
  ).toBeVisible()
  await expectNoHorizontalScroll(page)
  await capture(page, 'resultado')

  const receipt = await download(page, 'Descargar comprobante')
  expect(receipt.suggestedFilename()).toMatch(
    /^comprobante-importacion-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/,
  )
  const book = await readDownload(receipt)
  expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
    'Resumen',
    'Cambios',
    'Para revertir',
  ])

  expect(await product('LAP-001')).toMatchObject({ price: '1298.00' })
  expect(await product('LAP-002')).toMatchObject({ category: 'Laptops' })
  expect(await product('MON-001')).toMatchObject({ category: 'Monitores' })
  expect(await product('BAD-001')).toBeNull()

  await page.getByRole('link', { name: 'Ver productos' }).click()
  await expect(page).toHaveURL('/products?dateBy=updated&date=today&sort=updated')
  await expect(
    page
      .getByRole('region', { name: 'Lista de productos' })
      .getByText('Laptop gamer')
      .filter({ visible: true }),
  ).toBeVisible()
})

test('solo Código y Precio: actualiza los precios y no toca lo demás', async ({ page }) => {
  await seed()
  await login(page)
  await openImport(page)
  await upload(
    page,
    await workbook(
      [
        ['lap-001', '1,250.50'],
        ['IMP-001', 'S/ 600'],
      ],
      ['Código', 'Precio con IGV (S/)'],
    ),
  )
  await expect(
    page.getByText(
      'Tu archivo trae Código y Precio con IGV: solo se actualizarán los precios. El resto de los datos se mantiene.',
    ),
  ).toBeVisible()
  await importAndConfirm(page, 'Importar 2 productos')
  expect(await product('LAP-001')).toEqual({
    name: 'Laptop básica',
    description: 'Core i3',
    price: '1250.50',
    category: 'Laptops',
  })
  expect(await product('IMP-001')).toMatchObject({ name: 'Impresora láser', price: '600.00' })
})

test('la plantilla acepta el precio con punto o con coma decimal y lo importa igual', async ({
  page,
}) => {
  await seed()
  await login(page)
  await openImport(page)
  const book = await readDownload(await download(page, 'Descargar plantilla'))
  // Como lo escribe alguien con su Excel en punto o en coma decimal: Excel lo guarda como texto.
  const sheet = book.getWorksheet('Productos')!
  sheet.getRow(2).values = ['PUNTO-001', 'Con punto', null, 'Laptops', '300.50']
  sheet.getRow(3).values = ['COMA-001', 'Con coma', null, 'Laptops', '300,50']
  await upload(page, Buffer.from(await book.xlsx.writeBuffer()), 'plantilla-carga-masiva.xlsx')
  await expect(page.getByRole('heading', { name: 'Esto es lo que va a pasar' })).toBeFocused()
  await expect(page.getByText('S/ 300.50').filter({ visible: true })).toHaveCount(2)
  // Solo productos nuevos: no pide confirmación.
  await page.getByRole('button', { name: 'Importar 2 productos' }).click()
  await expect(
    page.getByRole('heading', { name: '¡Listo! Tu catálogo está actualizado' }),
  ).toBeFocused()
  expect(await product('PUNTO-001')).toMatchObject({ price: '300.50' })
  expect(await product('COMA-001')).toMatchObject({ price: '300.50' })
})

test('la hoja «Para revertir» del comprobante deja los productos como estaban', async ({
  page,
}) => {
  await seed()
  await login(page)
  await openImport(page)
  await upload(page, await workbook([['LAP-001', 'Laptop básica 2', 'Core i5', 'Laptops', 1416]]))
  await importAndConfirm(page, 'Importar 1 producto')
  const receipt = await download(page, 'Descargar comprobante')
  expect(await product('LAP-001')).toMatchObject({ name: 'Laptop básica 2', price: '1416.00' })

  await page.getByRole('button', { name: 'Hacer otra carga' }).click()
  await upload(page, await readFile((await receipt.path())!), receipt.suggestedFilename())
  await expect(page.getByRole('heading', { name: 'Esto es lo que va a pasar' })).toBeFocused()
  await importAndConfirm(page, 'Importar 1 producto')
  expect(await product('LAP-001')).toEqual({
    name: 'Laptop básica',
    description: 'Core i3',
    price: '1180.00',
    category: 'Laptops',
  })
})

test('un archivo que no sirve explica qué hacer y deja elegir otro', async ({ page }) => {
  await seed()
  await login(page)
  await openImport(page)
  const alert = page.getByRole('alert').filter({ hasText: /\S/ })

  await upload(page, Buffer.from('codigo,precio\nLAP-001,10'), 'productos.csv')
  await expect(alert).toHaveText(
    'Ese archivo no es un Excel .xlsx. Ábrelo en Excel y guárdalo como "Libro de Excel (.xlsx)".',
  )

  await upload(page, await workbook([['Laptop', 10]], ['Nombre', 'Precio']))
  await expect(alert).toHaveText('Falta la columna Código: es la que identifica cada producto.')
  await expect(page.getByRole('button', { name: /Arrastra tu Excel/ })).toBeEnabled()
})
