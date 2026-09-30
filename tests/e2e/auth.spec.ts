import { expect, test, type Page } from '@playwright/test'
import { e2eUsers } from './users'

const genericError = 'No se pudo iniciar sesión. Revisa tu correo y contraseña.'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

test('sin sesión, el catálogo lleva al acceso', async ({ page }) => {
  await page.goto('/products')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
})

test('una contraseña incorrecta muestra un mensaje genérico', async ({ page }) => {
  await login(page, e2eUsers.owner.email, 'otra-clave-cualquiera')
  await expect(page.getByRole('alert').filter({ hasText: genericError })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('una cuenta sin autorización no entra al catálogo', async ({ page }) => {
  await login(page, e2eUsers.intruder.email, e2eUsers.intruder.password)
  await expect(page.getByRole('alert').filter({ hasText: genericError })).toBeVisible()
  await page.goto('/products')
  await expect(page).toHaveURL(/\/login$/)
})

test('la cuenta autorizada entra y sale; volver atrás no muestra el catálogo', async ({ page }) => {
  await login(page, e2eUsers.owner.email, e2eUsers.owner.password)
  await expect(page).toHaveURL(/\/products$/)
  await expect(page.getByRole('heading', { name: 'Productos', exact: true })).toBeVisible()

  // Otra URL para que «atrás» vuelva a una página del catálogo (la misma URL reemplaza la entrada).
  await page.goto('/products?desde=historial')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.goBack()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Productos', exact: true })).toHaveCount(0)
})

test('una sesión inválida vuelve al acceso', async ({ page, context }) => {
  await login(page, e2eUsers.owner.email, e2eUsers.owner.password)
  await expect(page).toHaveURL(/\/products$/)

  const cookies = await context.cookies()
  await context.clearCookies()
  await context.addCookies(
    cookies
      .filter((cookie) => cookie.name.startsWith('sb-'))
      .map((cookie) => ({ ...cookie, value: 'base64-e30' })),
  )
  await page.goto('/products')
  await expect(page).toHaveURL(/\/login$/)
})

test('sin conexión, cerrar sesión avisa y sigue en el catálogo', async ({ page }) => {
  await login(page, e2eUsers.owner.email, e2eUsers.owner.password)
  await expect(page).toHaveURL(/\/products$/)
  await page.route(
    (url) => url.pathname === '/products',
    (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  )
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByText('Revisa tu conexión')).toBeVisible()
  await expect(page).toHaveURL(/\/products$/)
})
