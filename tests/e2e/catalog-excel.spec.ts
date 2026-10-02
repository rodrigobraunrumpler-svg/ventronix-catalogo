import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { connect, fillCompanyProfile, resetCatalog, resetCompanyProfile } from '../integration/db'
import { login } from './session'

async function seed() {
  const db = await connect()
  try {
    await resetCatalog(db)
    await resetCompanyProfile(db)
    await fillCompanyProfile(db)
    const { rows } = await db.query<{ id: string; name: string }>(
      "insert into public.categories (name) values ('Laptops'), ('Impresoras') returning id, name",
    )
    const id = (name: string) => rows.find((row) => row.name === name)!.id
    await db.query(
      `insert into public.products (code, name, category_id, unit_price, description) values
         ('LAP-001', 'Laptop básica', $1, 1180.00, 'Core i3'),
         ('LAP-002', 'Laptop pro', $1, 3540.00, null),
         ('IMP-001', 'Impresora láser', $2, 590.00, 'Monocromática')`,
      [id('Laptops'), id('Impresoras')],
    )
    return { laptops: id('Laptops') }
  } finally {
    await db.end()
  }
}

async function downloadExcel(page: Page, option: RegExp) {
  await page.getByRole('button', { name: 'Descargar Excel' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: option }).click(),
  ])
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile((await download.path())!)
  return { workbook, fileName: download.suggestedFilename() }
}

test('el reporte completo trae lo filtrado, en el orden de la lista', async ({ page }) => {
  const { laptops } = await seed()
  await login(page)
  await page.goto(`/products?category=${laptops}&sort=price-desc`)
  await expect(
    page
      .getByRole('region', { name: 'Lista de productos' })
      .getByText('Laptop pro')
      .filter({ visible: true }),
  ).toBeVisible()
  const { workbook, fileName } = await downloadExcel(page, /Reporte completo/)
  expect(fileName).toMatch(/^productos-laptops-\d{4}-\d{2}-\d{2}\.xlsx$/)
  const sheet = workbook.getWorksheet('Productos')!
  expect(sheet.getCell('C4').value).toBe('Categoría: Laptops · Orden: Precio de mayor a menor')
  expect([sheet.getCell('B9').value, sheet.getCell('B10').value]).toEqual(['LAP-002', 'LAP-001'])
  expect(sheet.getCell('F9').value).toBe(3540)
  await expect(page.getByText('Excel descargado · 2 productos')).toBeVisible()
})

test('la lista de precios agrupa por categoría y trae los datos de la empresa', async ({
  page,
}) => {
  await seed()
  await login(page)
  const { workbook, fileName } = await downloadExcel(page, /Lista de precios/)
  expect(fileName).toMatch(/^lista-de-precios-\d{4}-\d{2}-\d{2}\.xlsx$/)
  const sheet = workbook.getWorksheet('Lista de precios')!
  expect(sheet.getCell('C1').value).toBe('Empresa de Pruebas S.A.C.')
  expect(String(sheet.getCell('C2').value)).toContain('RUC 20000000001')
  expect(['A8', 'A9', 'A10'].map((cell) => sheet.getCell(cell).value)).toEqual([
    'Impresoras',
    'IMP-001',
    'Laptops',
  ])
})

test('sin productos que descargar, el botón queda desactivado', async ({ page }) => {
  await seed()
  await login(page)
  await page.goto('/products?search=nada-que-coincida')
  await expect(page.getByText('No encontramos productos')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Descargar Excel' })).toBeDisabled()
})
