import { expect, test } from '@playwright/test'
import { connect, resetCompanyProfile } from '../integration/db'
import { login } from './session'

test.beforeEach(async () => {
  const db = await connect()
  try {
    await resetCompanyProfile(db)
  } finally {
    await db.end()
  }
})

test('completa los datos de la empresa con cuentas, teléfonos y Yape o Plin', async ({ page }) => {
  await login(page)
  await page.getByRole('link', { name: 'Empresa' }).click()
  await expect(page).toHaveURL(/\/company$/)

  await page.getByLabel('Razón social', { exact: true }).fill('Empresa de Pruebas S.A.C.')
  await page.getByLabel('RUC', { exact: true }).fill('20000000001')
  await page.getByRole('tab', { name: /Contacto/ }).click()
  await page.getByLabel('Dirección', { exact: true }).fill('Av. Prueba 123, Huamanga')
  await page.getByLabel('Teléfono 1', { exact: true }).fill('066 312345')
  await page.getByRole('button', { name: 'Añadir teléfono' }).click()
  await page.getByLabel('Teléfono 2', { exact: true }).fill('987 654 321')

  await page.getByRole('tab', { name: /Pagos/ }).click()
  await page.getByRole('button', { name: 'Añadir cuenta' }).click()
  await page.getByLabel('Banco de la cuenta 1').fill('BCP')
  await page.getByLabel('Número de cuenta 1').fill('191-1234567-0-12')
  await page.getByLabel('CCI de la cuenta 1').fill('00219100123456701254')
  await page.getByRole('button', { name: 'Añadir cuenta' }).click()
  await page.getByLabel('Banco de la cuenta 2').fill('Interbank')
  await page.getByRole('button', { name: 'Quitar cuenta 2' }).click()

  await page.getByRole('button', { name: 'Añadir número de Yape o Plin' }).click()
  await page.getByRole('radiogroup', { name: 'Tipo del número 1' }).getByText('Plin').click()
  await page.getByLabel('Número 1 de Yape o Plin').fill('987654321')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Razón social', { exact: true })).toHaveValue(
    'Empresa de Pruebas S.A.C.',
  )
  await page.getByRole('tab', { name: /Contacto/ }).click()
  await expect(page.getByLabel('Teléfono 2', { exact: true })).toHaveValue('987 654 321')
  await page.getByRole('tab', { name: /Pagos/ }).click()
  await expect(page.getByLabel('CCI de la cuenta 1')).toHaveValue('00219100123456701254')
  await expect(page.getByLabel('Banco de la cuenta 2')).toHaveCount(0)
  await expect(
    page
      .getByRole('radiogroup', { name: 'Tipo del número 1' })
      .getByRole('radio', { name: 'Plin' }),
  ).toBeChecked()
  await expect(
    page.getByRole('complementary', { name: 'Así saldrá en tus proformas' }),
  ).toContainText('Plin: 987 654 321')
})
