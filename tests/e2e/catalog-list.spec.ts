import { expect, test, type Page } from '@playwright/test'
import { connect, resetCatalog } from '../integration/db'
import { login } from './session'

// «Hoy» de Lima lo calcula la base, para no depender del reloj del equipo.
async function seed() {
  const db = await connect()
  try {
    await resetCatalog(db)
    const {
      rows: [lima],
    } = await db.query<{ today: string }>(
      "select to_char((now() at time zone 'America/Lima')::date, 'YYYY-MM-DD') as today",
    )
    const {
      rows: [category],
    } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    const today = `${lima.today}T10:00:00-05:00`
    const old = '2025-01-15T10:00:00-05:00'
    const insert = (code: string, name: string, price: number, created: string, updated: string) =>
      db.query(
        `insert into public.products (code, name, category_id, unit_price, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [code, name, category.id, price, created, updated],
      )
    await insert('NEW-1', 'Laptop nueva A', 2500, today, today)
    await insert('NEW-2', 'Laptop nueva B', 3500, today, today)
    await insert('OLD-1', 'Laptop antigua editada', 1500, old, today)
    await insert('OLD-2', 'Laptop antigua', 900, old, old)
  } finally {
    await db.end()
  }
}

const list = (page: Page) => page.getByRole('region', { name: 'Lista de productos' })
const names = (page: Page) =>
  list(page)
    .getByRole('button', { name: /^Ver ficha de / })
    .filter({ visible: true })
    .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim()))

test('los indicadores muestran las cifras y aplican su filtro', async ({ page }) => {
  await seed()
  await login(page)
  const stats = page.getByRole('group', { name: 'Resumen del catálogo' })
  await expect(stats.getByRole('button', { name: '4 productos' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  // La cifra y el texto se ven separados: «4 productos», no «4productos».
  expect(await stats.getByRole('button', { name: '4 productos' }).innerText()).toBe('4 productos')

  await stats.getByRole('button', { name: '2 nuevos este mes' }).click()
  await expect(page).toHaveURL(/date=month/)
  await expect(page).toHaveURL(/sort=newest/)
  await expect.poll(() => names(page)).toEqual(['Laptop nueva A', 'Laptop nueva B'])

  await stats.getByRole('button', { name: '3 modificados en 7 días' }).click()
  await expect(page).toHaveURL(/dateBy=updated/)
  await expect
    .poll(() => names(page))
    .toEqual(['Laptop antigua editada', 'Laptop nueva A', 'Laptop nueva B'])

  await stats.getByRole('button', { name: '4 productos' }).click()
  await expect(page).not.toHaveURL(/date=/)
  await expect.poll(() => names(page)).toHaveLength(4)
})

test('el filtro de fecha y el orden quedan en la URL y sobreviven a recargar', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('button', { name: 'Filtrar por fecha' }).click()
  await page.getByRole('radio', { name: 'Hoy' }).click()
  await expect(page).toHaveURL(/date=today/)
  await expect(page.getByRole('button', { name: 'Fecha: Registro: hoy' })).toBeVisible()
  await expect.poll(() => names(page)).toEqual(['Laptop nueva A', 'Laptop nueva B'])

  await page.getByLabel('Ordenar por').selectOption({ label: 'Precio: mayor a menor' })
  await expect(page).toHaveURL(/sort=price-desc/)
  await expect.poll(() => names(page)).toEqual(['Laptop nueva B', 'Laptop nueva A'])
  await expect(list(page).getByText('Registrado hoy').filter({ visible: true })).toHaveCount(2)

  await page.reload()
  await expect.poll(() => names(page)).toEqual(['Laptop nueva B', 'Laptop nueva A'])
  await list(page).getByRole('button', { name: 'Quitar filtro de fecha' }).click()
  await expect.poll(() => names(page)).toHaveLength(4)
})

test('los valores raros en la URL se ignoran', async ({ page }) => {
  await seed()
  await login(page)
  await page.goto('/products?date=semana&sort=precio&from=2026-02-30&dateBy=otro')
  await expect.poll(() => names(page)).toHaveLength(4)
  await expect(page.getByLabel('Ordenar por')).toHaveValue('name')
})

test('«Copiar enlace» copia la vista actual', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await seed()
  await login(page)
  await page.goto('/products?sort=price-asc')
  await list(page).getByRole('button', { name: 'Copiar enlace de esta vista' }).click()
  await expect(page.getByText(/Enlace copiado/)).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url())
})

test('con filtros activos, la barra de filtros cabe en la pantalla del celular', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'En el celular es donde falta espacio.')
  await seed()
  await login(page)
  await page.goto('/products?search=laptop&date=7d')
  const clear = list(page).getByRole('button', { name: 'Limpiar filtros' })
  await expect(clear).toBeVisible()
  const box = (await clear.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  // Ni la página entera: nada la ensancha (ni los esqueletos mientras carga).
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  )
})

test('en un laptop bajo, el panel de fecha se puede usar entero', async ({ page, isMobile }) => {
  test.skip(isMobile, 'La pantalla baja es la de un laptop.')
  await page.setViewportSize({ width: 1366, height: 640 })
  await seed()
  await login(page)
  await page.goto('/products?date=7d')
  await page.getByRole('button', { name: 'Fecha: Registro: últimos 7 días' }).click()
  await page.getByRole('radio', { name: 'Personalizado' }).click()
  await page.getByRole('button', { name: 'Quitar filtro', exact: true }).click()
  await expect(page).not.toHaveURL(/date=/)
})
