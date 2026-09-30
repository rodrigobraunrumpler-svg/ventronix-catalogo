import { expect, test } from '@playwright/test'

test('la app no aparece en buscadores y el enlace compartido muestra la marca', async ({
  page,
  request,
}) => {
  await page.goto('/login')
  await expect(page).toHaveTitle('Iniciar sesión · Ventronix')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Ventronix · Catálogo comercial',
  )
  const image = new URL((await page.locator('meta[property="og:image"]').getAttribute('content'))!)
  const response = await request.get(image.pathname + image.search)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
})

test('el manifiesto y los íconos cargan sin sesión', async ({ page, request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.status()).toBe(200)
  const body = await manifest.json()
  expect(body).toMatchObject({ name: 'Ventronix Catálogo', start_url: '/products' })

  await page.goto('/login')
  const icons: string[] = body.icons.map((icon: { src: string }) => icon.src)
  for (const rel of ['icon', 'apple-touch-icon']) {
    const hrefs = await page
      .locator(`link[rel="${rel}"]`)
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')!))
    expect(hrefs.length).toBeGreaterThan(0)
    icons.push(...hrefs)
  }
  for (const src of icons) {
    const icon = await request.get(src)
    expect(icon.status(), src).toBe(200)
    expect(icon.headers()['content-type'], src).toMatch(/^image\//)
  }
})
