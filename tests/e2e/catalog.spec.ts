import { expect, test, type Page } from '@playwright/test'
import { connect, resetCatalog } from '../integration/db'
import { e2eUsers } from './users'

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(e2eUsers.owner.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(e2eUsers.owner.password)
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

// 51 laptops y 1 impresora: dos páginas de 50.
async function seedCatalog() {
  const db = await connect()
  try {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string; name: string }>(
      "insert into public.categories (name) values ('Laptops'), ('Impresoras') returning id, name",
    )
    const id = (name: string) => rows.find((row) => row.name === name)!.id
    for (let i = 1; i <= 51; i++) {
      const n = String(i).padStart(2, '0')
      await db.query(
        `insert into public.products (code, name, category_id, unit_price) values ($1, $2, $3, 2590)`,
        [`LAP-0${n}`, `Laptop ${n}`, id('Laptops')],
      )
    }
    await db.query(
      `insert into public.products (code, name, category_id, unit_price)
       values ('IMP-001', 'Impresora láser', $1, 890)`,
      [id('Impresoras')],
    )
  } finally {
    await db.end()
  }
}

const productList = (page: Page) => page.getByRole('region', { name: 'Lista de productos' })

test('pagina, filtra y busca; atrás, adelante y recargar restauran el estado', async ({ page }) => {
  await seedCatalog()
  await login(page)
  const list = productList(page)
  await expect(list.getByText('Mostrando 1–50 de 52 productos')).toBeVisible()

  await list.getByRole('button', { name: 'Página siguiente' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(list.getByText('Mostrando 51–52 de 52 productos')).toBeVisible()

  await categoriesCard(page)
    .getByRole('button', { name: /^Impresoras/ })
    .click()
  await expect(page).not.toHaveURL(/page=/)
  await expect(list.getByText('Mostrando 1–1 de 1 producto')).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(/page=2/)
  await expect(list.getByText('Mostrando 51–52 de 52 productos')).toBeVisible()
  await page.goForward()
  await expect(list.getByText('Mostrando 1–1 de 1 producto')).toBeVisible()

  await categoriesCard(page)
    .getByRole('button', { name: /^Todos los productos/ })
    .click()
  await list.getByLabel('Buscar por nombre o código').fill('lap-007')
  await expect(page).toHaveURL(/search=lap-007/)
  await expect(list.getByText('Mostrando 1–1 de 1 producto')).toBeVisible()
  await expect(list.getByText('Laptop 07').filter({ visible: true })).toBeVisible()

  await page.reload()
  await expect(productList(page).getByLabel('Buscar por nombre o código')).toHaveValue('lap-007')
  await expect(productList(page).getByText('Laptop 07').filter({ visible: true })).toBeVisible()
})

test('cambia de página desde arriba, sin bajar hasta el final', async ({ page }) => {
  await seedCatalog()
  await login(page)
  const list = productList(page)
  const top = list.getByRole('group', { name: 'Cambiar de página' })
  await expect(top).toContainText('Página 1 de 2')
  await top.getByRole('button', { name: 'Siguiente' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(top).toContainText('Página 2 de 2')
  await expect(list.getByText('Mostrando 51–52 de 52 productos')).toBeVisible()
  await top.getByRole('button', { name: 'Anterior' }).click()
  await expect(list.getByText('Mostrando 1–50 de 52 productos')).toBeVisible()
})

test('al cambiar de página con los botones de abajo, vuelve al principio de la lista', async ({
  page,
}) => {
  const db = await connect()
  try {
    await resetCatalog(db)
    const { rows } = await db.query<{ id: string }>(
      "insert into public.categories (name) values ('Laptops') returning id",
    )
    await db.query(
      `insert into public.products (code, name, category_id, unit_price)
       select 'LAP-' || lpad(n::text, 3, '0'), 'Laptop ' || lpad(n::text, 3, '0'), $1, 2590
       from generate_series(1, 110) as n`,
      [rows[0].id],
    )
  } finally {
    await db.end()
  }
  await login(page)
  const list = productList(page)
  await list.getByRole('button', { name: 'Página siguiente' }).click()
  await expect(list.getByText('Mostrando 51–100 de 110 productos')).toBeVisible()
  await expect(list.getByRole('group', { name: 'Cambiar de página' })).toBeInViewport()
})

test('distingue la búsqueda sin resultados del catálogo vacío', async ({ page }) => {
  await seedCatalog()
  await login(page)
  const list = productList(page)
  await list.getByLabel('Buscar por nombre o código').fill('no-existe')
  await expect(list.getByText('No encontramos productos')).toBeVisible()
  await list.getByRole('button', { name: 'Limpiar filtros' }).first().click()
  await expect(list.getByText('Mostrando 1–50 de 52 productos')).toBeVisible()

  await seed([])
  await page.reload()
  await expect(productList(page).getByText('Tu catálogo empieza aquí')).toBeVisible()
})

test('edita un producto desde la lista y muestra el nombre de categoría renombrada', async ({
  page,
}) => {
  await seedCatalog()
  await login(page)
  const list = productList(page)
  await list.getByRole('button', { name: 'Editar Impresora láser' }).click()
  const sheet = page.getByRole('dialog', { name: 'Editar producto' })
  await expect(sheet.getByLabel('Código')).toHaveValue('IMP-001')
  await sheet.getByLabel('Nombre del producto').fill('Impresora láser B/N')
  await sheet.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(list.getByText('Impresora láser B/N').filter({ visible: true })).toBeVisible()

  const card = categoriesCard(page)
  await card.getByRole('button', { name: /^Impresoras/ }).click()
  await card.getByRole('button', { name: 'Renombrar Impresoras' }).click()
  await page.getByLabel('Nombre de la categoría').fill('Impresión')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(list.getByText('Impresión', { exact: true }).filter({ visible: true })).toBeVisible()
})

test('al borrar el último producto de la última página vuelve a la anterior', async ({ page }) => {
  await seedCatalog()
  await login(page)
  const list = productList(page)
  await list.getByRole('button', { name: 'Página siguiente' }).click()
  await expect(list.getByText('Mostrando 51–52 de 52 productos')).toBeVisible()
  await list.getByRole('button', { name: 'Eliminar Laptop 51' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar producto' }).click()
  await expect(list.getByText('Mostrando 51–51 de 51 productos')).toBeVisible()
  await list.getByRole('button', { name: 'Eliminar Laptop 50' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar producto' }).click()
  await expect(list.getByText('Mostrando 1–50 de 50 productos')).toBeVisible()
  await expect(page).not.toHaveURL(/page=2/)
})

test('flujo completo: categoría, producto, búsqueda, edición, borrados y salida', async ({
  page,
}) => {
  await seed([])
  await login(page)
  const card = categoriesCard(page)
  const list = productList(page)

  await card.getByRole('button', { name: 'Nueva categoría' }).click()
  await page.getByLabel('Nombre de la categoría').fill('Laptops')
  await page.getByRole('button', { name: 'Crear categoría' }).click()
  await expect(card.getByRole('button', { name: /^Laptops/ })).toBeVisible()

  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  const create = page.getByRole('dialog', { name: 'Nuevo producto' })
  await create.getByLabel('Código').fill('lap-100')
  await create.getByLabel('Nombre del producto').fill('Laptop de prueba')
  await create.getByLabel('Categoría').selectOption({ label: 'Laptops' })
  await create.getByLabel('Precio unitario').fill('2590')
  await create.getByRole('button', { name: 'Crear producto' }).click()
  await expect(list.getByText('Laptop de prueba').filter({ visible: true })).toBeVisible()

  await list.getByLabel('Buscar por nombre o código').fill('LAP-100')
  await expect(list.getByText('Mostrando 1–1 de 1 producto')).toBeVisible()
  await card.getByRole('button', { name: /^Laptops/ }).click()
  await expect(page).toHaveURL(/category=/)
  await expect(list.getByText('Mostrando 1–1 de 1 producto')).toBeVisible()

  await list.getByRole('button', { name: 'Editar Laptop de prueba' }).click()
  const edit = page.getByRole('dialog', { name: 'Editar producto' })
  await edit.getByLabel('Precio unitario').fill('2490,9')
  await edit.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(list.getByText('2,490.90').filter({ visible: true })).toBeVisible()

  await card.getByRole('button', { name: 'Eliminar Laptops' }).click()
  await expect(
    page.getByText('«Laptops» tiene 1 producto. Muévelo o elimínalo primero.'),
  ).toBeVisible()

  await list.getByRole('button', { name: 'Eliminar Laptop de prueba' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar producto' }).click()
  await expect(list.getByText('No encontramos productos')).toBeVisible()

  await card.getByRole('button', { name: 'Eliminar Laptops' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(card.getByText('Aún no hay categorías.')).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('se puede usar con el teclado', async ({ page }) => {
  await seed(['Laptops'])
  await page.goto('/login')
  await page.getByLabel('Correo').focus()
  await page.keyboard.type(e2eUsers.owner.email)
  await page.keyboard.press('Tab')
  await page.keyboard.type(e2eUsers.owner.password)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/products/)

  const card = categoriesCard(page)
  await card.getByRole('button', { name: /^Laptops/ }).focus()
  await page.keyboard.press('Enter')
  await expect(card.getByRole('button', { name: /^Laptops/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Tab')
  await expect(card.getByRole('button', { name: 'Renombrar Laptops' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Nombre de la categoría')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(card.getByRole('button', { name: 'Renombrar Laptops' })).toBeFocused()
})

// Las Server Actions de la pantalla se envían por POST a /products; cortarlas simula perder la red.
async function goOffline(page: Page) {
  await page.route(
    (url) => url.pathname === '/products',
    (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
  )
}

test('sin conexión, guardar avisa y conserva lo escrito', async ({ page }) => {
  await seed(['Laptops'])
  await login(page)
  await goOffline(page)

  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  const sheet = page.getByRole('dialog', { name: 'Nuevo producto' })
  await sheet.getByLabel('Código').fill('lap-010')
  await sheet.getByLabel('Nombre del producto').fill('Laptop de 13 pulgadas')
  await sheet.getByLabel('Categoría').selectOption({ label: 'Laptops' })
  await sheet.getByLabel('Precio unitario').fill('1299.50')
  await sheet.getByRole('button', { name: 'Crear producto' }).click()
  await expect(sheet.getByRole('alert')).toContainText('Revisa tu conexión')
  await expect(sheet.getByLabel('Nombre del producto')).toHaveValue('Laptop de 13 pulgadas')
  await sheet.getByRole('button', { name: 'Cancelar' }).click()

  await categoriesCard(page).getByRole('button', { name: 'Nueva categoría' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva categoría' })
  await dialog.getByLabel('Nombre de la categoría').fill('Impresoras')
  await dialog.getByRole('button', { name: 'Crear categoría' }).click()
  await expect(dialog.getByRole('alert')).toContainText('Revisa tu conexión')
  await expect(dialog.getByLabel('Nombre de la categoría')).toHaveValue('Impresoras')
})

test('la ventana conserva lo escrito al cerrarla y al recargar; Descartar lo borra', async ({
  page,
}) => {
  await seed(['Laptops'])
  await login(page)
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo producto' })
  await dialog.getByLabel('Código').fill('lap-020')
  await dialog.getByLabel('Nombre del producto').fill('Laptop de 16 pulgadas')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await page.reload()
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await expect(dialog.getByRole('status')).toContainText('Recuperamos lo que estabas escribiendo')
  // El foco va al primer campo, no a «Descartar»: Enter no borra el borrador por accidente.
  await expect(dialog.getByLabel('Código')).toBeFocused()
  await expect(dialog.getByLabel('Código')).toHaveValue('lap-020')
  await expect(dialog.getByLabel('Nombre del producto')).toHaveValue('Laptop de 16 pulgadas')
  await dialog.getByRole('button', { name: 'Descartar' }).click()
  await expect(dialog.getByLabel('Código')).toHaveValue('')
})

test('cerrar sesión borra los borradores del navegador', async ({ page }) => {
  await seed(['Laptops'])
  await login(page)
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo producto' })
  await dialog.getByLabel('Código').fill('lap-021')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)

  await login(page)
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  await expect(dialog.getByLabel('Código')).toHaveValue('')
  await expect(dialog.getByRole('status')).toHaveCount(0)
})

test('Crear y añadir otro permite cargar varios productos seguidos', async ({ page }) => {
  await seed(['Laptops'])
  await login(page)
  await page.getByRole('button', { name: 'Nuevo producto' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo producto' })
  await dialog.getByLabel('Código').fill('lap-030')
  await dialog.getByLabel('Nombre del producto').fill('Laptop A')
  await dialog.getByLabel('Categoría').selectOption({ label: 'Laptops' })
  await dialog.getByLabel('Precio unitario').fill('1000')
  await dialog.getByRole('button', { name: 'Crear y añadir otro' }).click()

  await expect(page.getByText('Producto creado')).toBeVisible()
  await expect(dialog.getByLabel('Código')).toBeFocused()
  await expect(dialog.getByLabel('Código')).toHaveValue('')
  await expect(dialog.getByLabel('Categoría').locator('option:checked')).toHaveText('Laptops')
  await dialog.getByLabel('Código').fill('lap-031')
  await dialog.getByLabel('Nombre del producto').fill('Laptop B')
  await dialog.getByLabel('Precio unitario').fill('2000')
  await dialog.getByRole('button', { name: 'Crear producto' }).click()

  await expect(dialog).toHaveCount(0)
  const list = page.getByRole('region', { name: 'Lista de productos' })
  await expect(list.getByText('Laptop A').filter({ visible: true })).toBeVisible()
  await expect(list.getByText('Laptop B').filter({ visible: true })).toBeVisible()
})

test('en PC, la categoría va debajo del nombre y el nombre gana el ancho de esa columna', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'La tabla es solo de PC; en el celular cada producto es una tarjeta.')
  await seed(['Laptops'], 'Laptops')
  await login(page)
  const table = productList(page).getByRole('table', { name: 'Productos del catálogo' })
  await expect(table.getByRole('columnheader')).toHaveText([
    'Producto',
    'Precio unitario',
    'Proforma',
    'Acciones',
  ])
  const row = table.getByRole('row', { name: /Laptop de 14 pulgadas/ })
  await expect(row.getByRole('cell').first()).toContainText('Laptops')
})

test('el menú lateral se pliega, se recuerda al recargar y se vuelve a abrir', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'En el celular no hay menú lateral.')
  await seed([])
  await login(page)
  const sidebar = page.getByRole('complementary')
  const width = async () => (await sidebar.boundingBox())!.width
  expect(await width()).toBeGreaterThan(200)

  await page.getByRole('button', { name: 'Ocultar menú' }).click()
  expect(await width()).toBeLessThan(80)
  await page.reload()
  expect(await width()).toBeLessThan(80)

  // Plegado, los iconos siguen llevando a cada sección.
  await sidebar.getByRole('link', { name: 'Empresa' }).click()
  await expect(page).toHaveURL(/\/company$/)
  expect(await width()).toBeLessThan(80)

  await page.getByRole('button', { name: 'Mostrar menú' }).click()
  expect(await width()).toBeGreaterThan(200)
  await page.reload()
  expect(await width()).toBeGreaterThan(200)
})
