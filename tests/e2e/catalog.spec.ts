import { expect, test, type Page } from '@playwright/test'
import { connect, resetCatalog } from '../integration/db'
import { e2eUsers } from './users'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(e2eUsers.owner.email)
  await page.getByLabel('Contraseña').fill(e2eUsers.owner.password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/products/)
}

// Fixtures directas en la base local: la tarjeta aún no crea productos.
async function seed(categories: string[], productIn?: string) {
  const db = await connect()
  try {
    await resetCatalog(db)
    const ids: Record<string, string> = {}
    for (const name of categories) {
      const { rows } = await db.query<{ id: string }>(
        'insert into public.categories (name) values ($1) returning id',
        [name],
      )
      ids[name] = rows[0].id
    }
    if (productIn) {
      await db.query(
        `insert into public.products (code, name, category_id, unit_price)
         values ('LAP-001', 'Laptop de 14 pulgadas', $1, 2590.00)`,
        [ids[productIn]],
      )
    }
    return ids
  } finally {
    await db.end()
  }
}

const categoriesCard = (page: Page) => page.getByRole('region', { name: 'Categorías' })

test('crea, renombra y elimina una categoría vacía', async ({ page }) => {
  await seed([])
  await login(page)
  const card = categoriesCard(page)
  await expect(card.getByText('Aún no hay categorías.')).toBeVisible()

  await card.getByRole('button', { name: 'Nueva categoría' }).click()
  await page.getByLabel('Nombre de la categoría').fill('Impresoras')
  await page.getByRole('button', { name: 'Crear categoría' }).click()
  await expect(card.getByRole('button', { name: /^Impresoras/ })).toBeVisible()

  await card.getByRole('button', { name: /^Impresoras/ }).click()
  await card.getByRole('button', { name: 'Renombrar Impresoras' }).click()
  await page.getByLabel('Nombre de la categoría').fill('Impresoras láser')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(card.getByRole('button', { name: /^Impresoras láser/ })).toBeVisible()

  await card.getByRole('button', { name: 'Eliminar Impresoras láser' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(card.getByRole('button', { name: /^Impresoras láser/ })).toHaveCount(0)
  await expect(card.getByText('Aún no hay categorías.')).toBeVisible()
})

test('no elimina una categoría con productos y lo explica', async ({ page }) => {
  await seed(['Laptops'], 'Laptops')
  await login(page)
  const card = categoriesCard(page)
  await card.getByRole('button', { name: /^Laptops/ }).click()
  await card.getByRole('button', { name: 'Eliminar Laptops' }).click()
  await expect(
    page.getByText('«Laptops» tiene 1 producto. Muévelo o elimínalo primero.'),
  ).toBeVisible()
  await expect(card.getByRole('button', { name: /^Laptops/ })).toBeVisible()
})

test('elegir una categoría la guarda en la URL y «Todos los productos» la quita', async ({
  page,
}) => {
  const ids = await seed(['Impresoras', 'Laptops'])
  await login(page)
  const card = categoriesCard(page)
  await card.getByRole('button', { name: /^Laptops/ }).click()
  await expect(page).toHaveURL(new RegExp(`category=${ids.Laptops}`))
  await expect(card.getByRole('button', { name: /^Laptops/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await card.getByRole('button', { name: /^Todos los productos/ }).click()
  await expect(page).not.toHaveURL(/category=/)
})

test('crea un producto desde el panel lateral y guarda el precio exacto', async ({ page }) => {
  await seed(['Laptops'])
  await login(page)
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  const sheet = page.getByRole('dialog', { name: 'Nuevo producto' })
  await sheet.getByLabel('Código').fill('lap-010')
  await sheet.getByLabel('Nombre del producto').fill('Laptop de 13 pulgadas')
  await sheet.getByLabel('Categoría').selectOption({ label: 'Laptops' })
  await sheet.getByLabel('Precio unitario').fill('1299,5')
  await sheet.getByRole('button', { name: 'Crear producto' }).click()

  await expect(page.getByText('Producto creado')).toBeVisible()
  await expect(sheet).toHaveCount(0)
  await expect(categoriesCard(page).getByRole('button', { name: /^Laptops/ })).toContainText('1')

  const db = await connect()
  try {
    const { rows } = await db.query('select code, unit_price::text as price from public.products')
    expect(rows).toEqual([{ code: 'LAP-010', price: '1299.50' }])
  } finally {
    await db.end()
  }
})

test('sin categorías, el formulario de producto permite crear una', async ({ page }) => {
  await seed([])
  await login(page)
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  const sheet = page.getByRole('dialog', { name: 'Nuevo producto' })
  await sheet.getByRole('button', { name: 'Crear una categoría' }).click()
  await page.getByLabel('Nombre de la categoría').fill('Plotters')
  await page.getByRole('button', { name: 'Crear categoría' }).click()
  await expect(sheet.getByLabel('Categoría')).toContainText('Plotters')
})
