import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import {
  connect,
  fillCompanyProfile,
  resetCatalog,
  resetCompanyProfile,
  resetWhatsAppSession,
} from '../integration/db'
import { pdfText } from '../support/pdf-text'
import { login } from './session'

// La empresa con lo obligatorio, la numeración desde 1 y el catálogo vacío.
async function seed() {
  const db = await connect()
  try {
    await resetCatalog(db)
    await resetCompanyProfile(db)
    await resetWhatsAppSession(db)
    await fillCompanyProfile(db)
    await db.query('alter sequence public.proforma_number_seq restart with 1')
  } finally {
    await db.end()
  }
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Completar proforma' })

async function addFreeLine(
  page: Page,
  line: { name: string; code?: string; quantity?: string; price: string },
) {
  const form = dialog(page).getByRole('form', { name: 'Añadir producto libre' })
  await form.getByLabel('Descripción').fill(line.name)
  if (line.code) await form.getByLabel('Código').fill(line.code)
  if (line.quantity) await form.getByLabel('Cantidad').fill(line.quantity)
  await form.getByLabel('Precio con IGV (S/)').fill(line.price)
  await form.getByRole('button', { name: 'Añadir a la proforma' }).click()
}

test('arma y genera una proforma solo con productos libres, desde Proformas', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await expect(page).toHaveURL(/\/proformas$/)
  // El menú, con un enlace más, cabe también en el teléfono: la página no se desborda.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0)
  // Desde la tarea 10, con el historial vacío, el estado vacío también la ofrece.
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await expect(panel.getByRole('button', { name: 'Seguir eligiendo productos' })).toHaveCount(0)

  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await addFreeLine(page, {
    name: 'Cable HDMI de 3 metros',
    code: 'HDMI-3',
    quantity: '2',
    price: '25',
  })
  await expect(panel.getByText('Producto libre', { exact: true })).toHaveCount(2)
  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()
  await expect(panel.getByText('Cliente de prueba · Total S/ 400.00')).toBeVisible()

  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Descargar PDF' }).click()
  const text = pdfText(readFileSync(await (await download).path()))
  expect(text).toContain('Instalación en sitio')
  expect(text).toContain('HDMI-3')
  expect(text).toContain('—')
})

test('«Nueva proforma» pregunta antes de borrar una proforma sin generar', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  const start = page.getByRole('button', { name: 'Nueva proforma' }).first()
  await start.click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await page.keyboard.press('Escape')
  // La proforma en curso se ve en su barra, como en Productos.
  await expect(page.getByRole('region', { name: 'Proforma' })).toContainText('1 producto')

  await start.click()
  const prompt = page.getByRole('alertdialog', { name: '¿Empezar una proforma nueva?' })
  await expect(prompt).toContainText('1 producto · S/ 350.00')
  await prompt.getByRole('button', { name: 'Seguir con la actual' }).click()
  await expect(panel.getByLabel('Cantidad de Instalación en sitio')).toBeVisible()
  await page.keyboard.press('Escape')

  await start.click()
  await prompt.getByRole('button', { name: 'Empezar una nueva' }).click()
  await expect(panel.getByText(/La proforma está vacía/)).toBeVisible()
})
