import { readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  connect,
  fillCompanyProfile,
  resetCatalog,
  resetCompanyProfile,
  resetProformas,
  resetWhatsAppSession,
} from '../integration/db'
import { pdfText } from '../support/pdf-text'
import { login } from './session'

// La empresa con lo obligatorio, la numeración desde 1 y el catálogo vacío.
async function seed() {
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
  await expect(page.getByRole('region', { name: 'Proforma', exact: true })).toContainText(
    '1 producto',
  )

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

// 25 proformas guardadas con su copia, como las deja «Generar». La 7 es de José Pérez.
async function seedHistory() {
  const db = await connect()
  try {
    await resetProformas(db)
    for (let number = 1; number <= 25; number++) {
      const name = number === 7 ? 'José Pérez' : `Cliente ${number}`
      const document = number === 7 ? '12345678' : ''
      const issuedAt = new Date(Date.UTC(2026, 9, 1, 15) + number * 3_600_000).toISOString()
      const snapshot = {
        input: {
          draft: false,
          number,
          issuedAt,
          lines: [
            {
              code: 'LAP-001',
              name: 'Laptop de 14 pulgadas',
              description: null,
              unitPrice: '100.00',
              quantity: 1,
            },
          ],
          client: { name, document, phone: '987654321', address: '', deliveryTime: '' },
          validityDays: '',
          discountPercent: '',
          shipping: '',
        },
        company: {
          legal_name: 'Empresa de Pruebas S.A.C.',
          trade_name: null,
          ruc: '20000000001',
          address: 'Av. Prueba 123, Huamanga',
          phones: ['066 312345'],
          email: null,
          payment_terms: null,
          return_policy: null,
          default_validity_days: 7,
          bank_accounts: [],
          wallets: [],
          whatsapp_message: null,
          updated_at: '2026-10-01T00:00:00Z',
        },
      }
      await db.query(
        `insert into public.proformas
           (number, issued_at, valid_until, client_name, client_document, client_phone,
            item_count, total, document)
         values ($1, $2, '2026-10-08', $3, $4, '987654321', 1, 100, $5)`,
        [number, issuedAt, name, document, snapshot],
      )
    }
  } finally {
    await db.end()
  }
}

const history = (page: Page) => page.getByRole('region', { name: 'Historial de proformas' })
const SEARCH = 'Buscar por cliente, RUC, DNI, celular o N° de proforma'

test('encuentra, pagina, filtra, descarga y reenvía las proformas guardadas', async ({ page }) => {
  await seed()
  await seedHistory()
  // wa.me responde con una página de prueba: las e2e nunca salen a WhatsApp.
  await page
    .context()
    .route('https://wa.me/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>WhatsApp</title>' }),
    )
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await expect(page.getByText(/^25 proformas · \d+ este mes$/)).toBeVisible()
  await expect(history(page).getByText('Proformas 1–20 de 25')).toBeVisible()

  await history(page).getByRole('button', { name: 'Página 2' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(history(page).getByText('Proformas 21–25 de 25')).toBeVisible()

  await history(page).getByLabel(SEARCH).fill('jose perez')
  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()
  await expect(page).toHaveURL(/search=jose/)
  await page.reload()
  // La tabla (PC) y las tarjetas (móvil) están en la página; solo una se ve.
  await expect(history(page).getByText('José Pérez').filter({ visible: true })).toBeVisible()

  const excel = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar Excel' }).click()
  expect((await excel).suggestedFilename()).toMatch(
    /^proformas-jose-perez-\d{4}-\d{2}-\d{2}\.xlsx$/,
  )

  // El N° también se busca, y el nombre del cliente muestra todas sus proformas.
  await history(page).getByLabel(SEARCH).fill('0007')
  await expect(page).toHaveURL(/search=0007/)
  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()
  await history(page).getByRole('button', { name: 'Ver las proformas de José Pérez' }).click()
  await expect(page).toHaveURL(/search=12345678/)
  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()

  await history(page).getByRole('button', { name: 'Reenviar la proforma N° 0007' }).click()
  const resend = page.getByRole('dialog', { name: 'Reenviar proforma N° 0007' })
  await expect(
    resend.getByText(/Hola, José Pérez\. Le envío la proforma N° 0007 por S\/ 100\.00/),
  ).toBeVisible()
  const chat = page.context().waitForEvent('page')
  await resend.getByRole('button', { name: 'Enviar por WhatsApp' }).click()
  expect((await chat).url()).toContain(
    'https://wa.me/51987654321?text=Hola%2C%20Jos%C3%A9%20P%C3%A9rez',
  )
})

// El proveedor de prueba (WHATSAPP_PROVIDER=stub) vincula al instante y nunca sale a WhatsApp.
test('con el WhatsApp vinculado, «Reenviar» la envía sola', async ({ page }) => {
  await seed()
  await seedHistory()
  await login(page)
  await page.getByRole('link', { name: 'Empresa' }).click()
  const card = page.getByRole('region', { name: 'WhatsApp' })
  await card.getByRole('button', { name: 'Vincular WhatsApp' }).click()
  const link = page.getByRole('dialog', { name: 'Vincular WhatsApp' })
  await link.getByLabel('Celular de WhatsApp de la empresa').fill('987 654 321')
  await link.getByRole('button', { name: 'Generar código' }).click()
  await expect(page.getByText('WhatsApp vinculado.')).toBeVisible()

  await page.getByRole('link', { name: 'Proformas' }).click()
  await history(page).getByRole('button', { name: 'Reenviar la proforma N° 0025' }).click()
  const resend = page.getByRole('dialog', { name: 'Reenviar proforma N° 0025' })
  await resend.getByLabel('Celular del cliente').fill('900 000 000')
  await resend.getByRole('button', { name: 'Enviar por WhatsApp' }).click()
  await expect(resend.getByText('Enviada por WhatsApp al 900 000 000.')).toBeVisible()
})

// Preferencia del usuario: las pantallas llenan el contenedor, nada se desborda y la acción
// principal se ve sin bajar.
test('Proformas llena el contenedor sin desbordarse y «Nueva proforma» está a la vista', async ({
  page,
}) => {
  await seed()
  await seedHistory()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await expect(history(page).getByText('Proformas 1–20 de 25')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva proforma' }).first()).toBeInViewport()
  const overflow = () =>
    page.evaluate(() => {
      const section = document.querySelector('[aria-label="Historial de proformas"]')!
      return {
        page: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        section: Math.max(0, section.scrollWidth - section.clientWidth),
      }
    })
  expect(await overflow()).toEqual({ page: 0, section: 0 })
  // En PC, también en un laptop de 1280 px con el menú abierto: los botones no se cortan.
  // Con menos de 1280 px van las tarjetas; desde la tablet también abren el PDF, en el teléfono no.
  const view = history(page).getByRole('button', { name: 'Ver PDF de la proforma N° 0025' })
  if (page.viewportSize()!.width >= 1280) {
    await page.setViewportSize({ width: 1280, height: 800 })
    expect(await overflow()).toEqual({ page: 0, section: 0 })
    await page.setViewportSize({ width: 1100, height: 800 })
    await expect(history(page).getByRole('table')).toBeHidden()
    await expect(view).toBeVisible()
    expect(await overflow()).toEqual({ page: 0, section: 0 })
    await page.setViewportSize({ width: 1440, height: 900 })
  } else {
    await expect(view).toHaveCount(0)
  }
  const main = await page.locator('#main').boundingBox()
  const list = await history(page).boundingBox()
  // Solo el margen interior de la página: sin un ancho máximo que deje espacio vacío.
  expect(list!.width).toBeGreaterThan(main!.width - 100)
})

test('la proforma generada aparece en el historial y «Corregir» la actualiza', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await expect(page.getByText('Todavía no hay proformas guardadas')).toBeVisible()
  // Sin proformas, «Descargar Excel» explica por qué no descarga nada. Con aria-disabled,
  // Playwright no lo pulsa sin force; una persona sí puede pulsarlo.
  await page.getByRole('button', { name: 'Descargar Excel' }).click({ force: true })
  await expect(page.getByText('Todavía no hay proformas para descargar.')).toBeVisible()
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()
  await panel.getByRole('button', { name: 'Corregir' }).click()
  await panel.getByLabel('Cantidad de Instalación en sitio').fill('2')
  await panel.getByRole('button', { name: 'Guardar cambios de la N° 0001' }).click()
  await expect(panel.getByText('Proforma N° 0001 actualizada')).toBeVisible()
  await expect(panel.getByText('Cliente de prueba · Total S/ 700.00')).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()
  await expect(history(page).getByText('S/ 700.00').filter({ visible: true }).first()).toBeVisible()
})

// Fotos de prueba: dos PNG de la marca. El navegador las reduce y las sube en JPEG. Son distintas:
// el PDF incrusta una sola vez dos fotos idénticas.
const PHOTO = 'public/brand/ventronix-mark.png'
const OTHER_PHOTO = 'public/brand/ventronix-wordmark.png'

test('sube fotos del producto y del producto libre y salen en el PDF', async ({ page }) => {
  await seed()
  const db = await connect()
  try {
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
  await login(page)

  // La foto del producto, desde su formulario.
  const list = page.getByRole('region', { name: 'Lista de productos' })
  await list.getByRole('button', { name: 'Editar Laptop de 14 pulgadas' }).click()
  const form = page.getByRole('dialog', { name: 'Editar producto' })
  await form.getByLabel('Foto').setInputFiles(PHOTO)
  await expect(form.getByRole('img', { name: 'Foto de Laptop de 14 pulgadas' })).toBeVisible()
  await form.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()
  // La lista vuelve a pedirse: el producto ya trae su foto al añadirlo.
  await page.reload()

  await list.getByRole('button', { name: 'Añadir Laptop de 14 pulgadas a la proforma' }).click()
  await page
    .getByRole('region', { name: 'Proforma' })
    .getByRole('button', { name: 'Completar proforma' })
    .click()
  const panel = dialog(page)
  await expect(panel.getByRole('img', { name: 'Foto de Laptop de 14 pulgadas' })).toBeVisible()

  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  const free = panel.getByRole('form', { name: 'Añadir producto libre' })
  await free.getByLabel('Foto').setInputFiles(OTHER_PHOTO)
  await expect(free.getByRole('img', { name: 'Foto del producto libre' })).toBeVisible()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await expect(panel.getByRole('img', { name: 'Foto de Instalación en sitio' })).toBeVisible()
  await expect(panel.getByRole('switch', { name: /Incluir fotos en el PDF/ })).toBeChecked()

  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Descargar PDF' }).click()
  const pdf = readFileSync(await (await download).path())
  // El logotipo, la franja de marcas y las dos fotos.
  expect(pdf.toString('latin1').match(/\/Subtype\s*\/Image\b/g)).toHaveLength(4)
  expect(pdfText(pdf)).toContain('Imágenes referenciales.')
})

test('tras «Nueva proforma» en la proforma lista, el foco vuelve a «Nueva proforma»', async ({
  page,
}) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await page.keyboard.press('Escape')
  // Se vuelve a abrir desde la barra: al terminar, la barra (quien la abrió) ya no existe.
  await page
    .getByRole('region', { name: 'Proforma', exact: true })
    .getByRole('button', { name: 'Completar proforma' })
    .click()
  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Proforma N° 0001 lista')).toBeVisible()
  await panel.getByRole('button', { name: 'Nueva proforma' }).click()
  await expect(panel).toHaveCount(0)
  // El de la cabecera: el historial vacío, mientras se actualiza, tiene otro.
  await expect(page.getByRole('button', { name: 'Nueva proforma' }).first()).toBeFocused()
})

test('el formulario del producto libre queda alineado y sin desbordarse', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  const form = panel.getByRole('form', { name: 'Añadir producto libre' })
  const middle = async (locator: Locator) => {
    const box = (await locator.boundingBox())!
    return box.y + box.height / 2
  }
  const choose = await middle(form.getByRole('button', { name: 'Elegir foto' }))
  // La miniatura y su botón, en la misma fila.
  expect(
    Math.abs((await middle(form.locator('[data-slot="photo-preview"]'))) - choose),
  ).toBeLessThan(2)
  // En PC, la foto va en la fila de la cantidad y el precio.
  if (page.viewportSize()!.width >= 1024) {
    expect(Math.abs((await middle(form.getByLabel('Cantidad'))) - choose)).toBeLessThan(2)
  }
  expect(await form.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
})

// Las fotos subidas en esta prueba (la foto y su miniatura), contadas en la base.
async function photosSince(since: Date) {
  const db = await connect()
  try {
    const { rows } = await db.query<{ count: string }>(
      "select count(*) from storage.objects where bucket_id = 'images' and created_at >= $1",
      [since],
    )
    return Number(rows[0].count)
  } finally {
    await db.end()
  }
}

test('la foto que se quita del producto libre se borra de Storage', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  const form = panel.getByRole('form', { name: 'Añadir producto libre' })
  const since = new Date(Date.now() - 1000)
  await form.getByLabel('Foto').setInputFiles(PHOTO)
  await expect(form.getByRole('button', { name: 'Quitar foto' })).toBeEnabled()
  await expect.poll(() => photosSince(since)).toBe(2)
  await form.getByRole('button', { name: 'Quitar foto' }).click()
  await expect.poll(() => photosSince(since)).toBe(0)

  // Una proforma sin generar que se reemplaza con «Empezar una nueva» tampoco deja sus fotos.
  await form.getByLabel('Foto').setInputFiles(PHOTO)
  await expect(form.getByRole('button', { name: 'Quitar foto' })).toBeEnabled()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await expect(panel.getByRole('img', { name: 'Foto de Instalación en sitio' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  await page
    .getByRole('alertdialog', { name: '¿Empezar una proforma nueva?' })
    .getByRole('button', { name: 'Empezar una nueva' })
    .click()
  await expect(panel.getByText(/La proforma está vacía/)).toBeVisible()
  await expect.poll(() => photosSince(since)).toBe(0)
})

test('en la proforma, cada línea deja sitio al nombre y nada se desborda', async ({ page }) => {
  await seed()
  await login(page)
  await page.getByRole('link', { name: 'Proformas' }).click()
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, {
    name: 'Laptop ryzen 7 16GB RAM 512GB SSD',
    code: 'TEST',
    quantity: '12',
    price: '12',
  })
  const name = panel.getByRole('button', {
    name: 'Ver detalle de Laptop ryzen 7 16GB RAM 512GB SSD',
  })
  // El nombre tiene su ancho y la etiqueta, una sola línea.
  expect((await name.boundingBox())!.width).toBeGreaterThan(150)
  expect(
    (await panel.getByText('Producto libre', { exact: true }).boundingBox())!.height,
  ).toBeLessThan(24)
  const list = panel.getByRole('list')
  expect(await list.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
})

// Arma y genera una proforma con un producto libre desde Proformas; queda en «lista», guardada.
async function generateFreeProforma(page: Page) {
  await page.getByRole('link', { name: 'Proformas' }).click()
  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const panel = dialog(page)
  await panel.getByRole('button', { name: 'Añadir producto libre' }).click()
  await addFreeLine(page, { name: 'Instalación en sitio', price: '350' })
  await panel.getByLabel('Razón social o nombre').fill('Cliente de prueba')
  await panel.getByRole('button', { name: 'Generar proforma' }).click()
  await expect(panel.getByText('Quedó guardada en el historial.')).toBeVisible()
}

// Exacto: «Proforma» también está en «Historial de proformas».
const proformaBar = (page: Page) => page.getByRole('region', { name: 'Proforma', exact: true })

test('al cerrar una proforma guardada, la barra queda vacía, también al recargar', async ({
  page,
}) => {
  await seed()
  await login(page)
  await generateFreeProforma(page)
  await page.keyboard.press('Escape')
  await expect(page.getByText('Proforma N° 0001 guardada en el historial')).toBeVisible()
  // Ya cerrada del todo: mientras se cierra, la página sigue oculta para los lectores de pantalla.
  await expect(dialog(page)).toHaveCount(0)
  await expect(proformaBar(page)).toHaveCount(0)
  await page.reload()
  await expect(history(page).getByText('Proformas 1–1 de 1')).toBeVisible()
  await expect(proformaBar(page)).toHaveCount(0)
})

test('«Corregir» del aviso la recupera; a medias, la barra lo dice y «Nueva proforma» pregunta', async ({
  page,
}) => {
  await seed()
  await login(page)
  await generateFreeProforma(page)
  await page.keyboard.press('Escape')
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Corregir' }).click()
  const panel = dialog(page)
  await expect(panel.getByRole('button', { name: 'Guardar cambios de la N° 0001' })).toBeVisible()
  await expect(panel.getByLabel('Razón social o nombre')).toHaveValue('Cliente de prueba')

  // Cerrada sin guardar, la barra dice que es la 0001 a medias, y cabe también en el teléfono.
  await page.keyboard.press('Escape')
  await expect(proformaBar(page)).toContainText('Proforma N° 0001')
  await expect(proformaBar(page)).toContainText('Cambios sin guardar · 1 producto · 1 unidad')
  await expect(proformaBar(page).getByRole('button', { name: 'Continuar' })).toBeVisible()
  expect(
    await proformaBar(page).evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBe(0)

  await page.getByRole('button', { name: 'Nueva proforma' }).first().click()
  const prompt = page.getByRole('alertdialog', { name: '¿Empezar una proforma nueva?' })
  await expect(
    prompt.getByText(
      'Tienes cambios sin guardar en la N° 0001 (1 producto · S/ 350.00). Si empiezas otra, se descartan; lo guardado sigue en el historial.',
    ),
  ).toBeVisible()
  await prompt.getByRole('button', { name: 'Empezar una nueva' }).click()
  await expect(panel.getByText(/La proforma está vacía/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(proformaBar(page)).toHaveCount(0)
  await expect(history(page).getByText('S/ 350.00').filter({ visible: true }).first()).toBeVisible()
})
