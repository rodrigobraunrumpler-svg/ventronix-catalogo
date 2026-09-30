import { expect, test, type Page } from '@playwright/test'
import { connect, fillCompanyProfile, resetCatalog, resetCompanyProfile } from '../integration/db'
import { login } from './session'

// Dos laptops, la numeración desde 1 y, si se pide, la empresa con lo obligatorio.
async function seed({ company = true } = {}) {
  const db = await connect()
  try {
    await resetCatalog(db)
    await resetCompanyProfile(db)
    if (company) await fillCompanyProfile(db)
    await db.query('alter sequence public.proforma_number_seq restart with 1')
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    await db.query(
      `insert into public.products (code, name, category_id, unit_price) values
         ('LAP-001', 'Laptop de 14 pulgadas', $1, 2590),
         ('LAP-002', 'Laptop de 16 pulgadas', $1, 3490)`,
      [rows[0].id],
    )
  } finally {
    await db.end()
  }
}

const list = (page: Page) => page.getByRole('region', { name: 'Lista de productos' })
const bar = (page: Page) => page.getByRole('region', { name: 'Proforma' })
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Completar proforma' })

async function addLaptop14(page: Page) {
  await list(page)
    .getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' })
    .click()
}

// Las Server Actions de la pantalla se envían por POST a /products; cortarlas simula perder la red.
async function goOffline(page: Page) {
  await page.route(
    (url) => url.pathname === '/products',
    (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  )
}

test('arma, genera, corrige y empieza otra proforma', async ({ page }) => {
  await seed()
  await login(page)
  await addLaptop14(page)
  await list(page).getByRole('button', { name: 'Una unidad más de Laptop de 14 pulgadas' }).click()
  await list(page)
    .getByRole('button', { name: 'Añadir Laptop de 16 pulgadas a la proforma' })
    .click()
  await expect(bar(page)).toContainText('2 productos · 3 unidades')
  await expect(bar(page)).toContainText('S/ 8,670.00')

  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  const panel = dialog(page)
  await expect(panel.getByLabel('Razón social o nombre')).toBeFocused()
  await panel.getByLabel('RUC o DNI').fill('20000000001')
  await expect(panel.getByLabel('Razón social o nombre')).toHaveValue('EMPRESA DE PRUEBA S.A.C.')

  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()
  await panel.getByRole('button', { name: 'Corregir' }).click()
  await panel.getByLabel('Cantidad de Laptop de 16 pulgadas').fill('2')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()

  await panel.getByRole('button', { name: 'Nueva proforma' }).click()
  await expect(panel).toHaveCount(0)
  await expect(bar(page)).toHaveCount(0)
  await expect(page.getByLabel('Buscar por nombre o código')).toBeFocused()
})

test('«/» lleva al buscador y Enter añade el único resultado', async ({ page }) => {
  await seed()
  await login(page)
  await page.keyboard.press('/')
  await expect(page.getByLabel('Buscar por nombre o código')).toBeFocused()
  await page.keyboard.type('lap-002')
  await page.keyboard.press('Enter')
  await expect(bar(page)).toContainText('1 producto · 1 unidad')
  await expect(
    list(page).getByRole('group', { name: 'Cantidad de Laptop de 16 pulgadas en la proforma' }),
  ).toContainText('1')
})

test('sin conexión, generar avisa y conserva lo escrito', async ({ page }) => {
  await seed()
  await login(page)
  await addLaptop14(page)
  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  await dialog(page).getByLabel('Razón social o nombre').fill('Cliente sin conexión')
  await goOffline(page)
  await dialog(page).getByRole('button', { name: 'Generar proforma' }).click()
  await expect(dialog(page).getByRole('alert')).toContainText('Revisa tu conexión')
  await expect(dialog(page).getByLabel('Razón social o nombre')).toHaveValue('Cliente sin conexión')
})

test('sin los datos de la empresa, «Generar» lleva a completarlos y luego deja generar', async ({
  page,
}) => {
  await seed({ company: false })
  await login(page)
  await addLaptop14(page)
  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  await dialog(page).getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await expect(dialog(page).getByText(/Completa los datos de tu empresa/)).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Generar proforma' })).toBeDisabled()

  await dialog(page).getByRole('link', { name: 'Ir a Empresa' }).click()
  await expect(page).toHaveURL(/\/company$/)
  await page.getByLabel('Razón social', { exact: true }).fill('Empresa de Pruebas S.A.C.')
  await page.getByLabel('RUC', { exact: true }).fill('20000000001')
  await page.getByLabel('Dirección', { exact: true }).fill('Av. Prueba 123, Huamanga')
  await page.getByLabel('Teléfono 1', { exact: true }).fill('066 312345')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()

  await page.getByRole('link', { name: 'Productos' }).click()
  await bar(page).getByRole('button', { name: 'Completar proforma' }).click()
  await expect(dialog(page).getByLabel('Razón social o nombre')).toHaveValue('Cliente de prueba')
  await expect(dialog(page).getByRole('button', { name: 'Generar proforma' })).toBeEnabled()
})
