import { expect, test } from '@playwright/test'
import { connect, resetCatalog } from '../integration/db'
import { e2eUsers } from './users'

// El catálogo queda unos minutos en caché: volver a la pestaña o reabrir la ventana de producto no
// repite las consultas. Guardar, editar o borrar sí refrescan lo que cambia (ver catalog.spec.ts).
test('no repite consultas al volver a la pestaña ni al reabrir la ventana', async ({ page }) => {
  const db = await connect()
  try {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    await db.query(
      `insert into public.products (code, name, category_id, unit_price)
       values ('LAP-001', 'Laptop de 14 pulgadas', $1, 2590)`,
      [rows[0].id],
    )
  } finally {
    await db.end()
  }

  await page.goto('/login')
  await page.getByLabel('Correo').fill(e2eUsers.owner.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(e2eUsers.owner.password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page.getByText('Laptop de 14 pulgadas').filter({ visible: true })).toBeVisible()
  const dialog = page.getByRole('dialog', { name: 'Nuevo producto' })
  const laptops = dialog.getByLabel('Categoría').locator('option', { hasText: 'Laptops' })
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await expect(laptops).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.waitForLoadState('networkidle')

  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/rest/v1/')) requests.push(new URL(request.url()).pathname)
  })
  // TanStack Query escucha `visibilitychange` en window para saber que se volvió a la pestaña.
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await expect(laptops).toHaveCount(1)
  await page.waitForTimeout(1000)
  expect(requests).toEqual([])
})
