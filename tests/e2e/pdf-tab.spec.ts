import { expect, test } from '@playwright/test'
import {
  connect,
  fillCompanyProfile,
  resetCatalog,
  resetCompanyProfile,
  resetProformas,
  resetWhatsAppSession,
} from '../integration/db'
import { login } from './session'

// Chromium completo: el de las demás pruebas no muestra PDF y aborta la navegación al PDF.
test.use({ channel: 'chromium' })

test('«Ver PDF» muestra la carga con el logo hasta que llega el PDF', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 768, 'En el teléfono el historial no abre el PDF.')
  const db = await connect()
  try {
    await resetCatalog(db)
    await resetProformas(db)
    await resetCompanyProfile(db)
    await resetWhatsAppSession(db)
    await fillCompanyProfile(db)
    await db.query('alter sequence public.proforma_number_seq restart with 1')
  } finally {
    await db.end()
  }
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = page.getByRole('dialog', { name: 'Completar proforma' })
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  const form = panel.getByRole('form', { name: 'Añadir producto libre' })
  await form.getByLabel('Descripción').fill('Instalación en sitio')
  await form.getByLabel('Precio con IGV (S/)').fill('350')
  await form.getByRole('button', { name: 'Añadir a la proforma' }).click()
  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Quedó guardada en el historial.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  // El servidor tarda: 2 s más en cada respuesta de esta página. Sin page.route, que deja sin
  // cargar las imágenes de una pestaña en blanco.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 2000,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })
  const opened = page.context().waitForEvent('page')
  await page
    .getByRole('region', { name: 'Historial de proformas' })
    .getByRole('button', { name: 'Ver PDF de la proforma N° 0001' })
    .click()
  const tab = await opened
  await expect(tab.getByRole('status')).toHaveText('Preparando la proforma N° 0001…')
  await expect(tab).toHaveTitle('Proforma N° 0001')
  await expect(tab.getByRole('img', { name: 'Ventronix' })).toBeVisible()
  await expect.poll(() => tab.url(), { timeout: 15_000 }).toMatch(/^blob:/)
})
