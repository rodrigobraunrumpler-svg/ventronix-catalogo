// Catálogo de prueba: 100 productos en 7 categorías, para ver cómo se arman y emiten las proformas
// con un catálogo grande. Entra como la cuenta autorizada (OWNER_EMAIL y OWNER_PASSWORD) en el
// Supabase de NEXT_PUBLIC_SUPABASE_URL, todo de .env.local. Sus códigos empiezan por DEMO-.
//
//   pnpm demo:seed    añade los que falten (no duplica)
//   pnpm demo:clean   borra los productos DEMO-… y las categorías de prueba que queden vacías
//
// Las variables de la línea de comandos tienen prioridad sobre .env.local.
import { createClient } from '@supabase/supabase-js'

// [nombre, descripción, precio en soles]
const CATALOG = [
  {
    category: 'Fotocopiadoras',
    prefix: 'FOT',
    items: [
      ['Ricoh IM 2702', 'Multifuncional A3 · 27 ppm · dúplex y red', '7890.00'],
      ['Ricoh IM C3000', 'Multifuncional color A3 · 30 ppm', '15900.00'],
      ['Ricoh MP 2014AD', 'Fotocopiadora A3 · 20 ppm · dúplex', '4690.00'],
      ['Konica Minolta bizhub C250i', 'Multifuncional color A3 · 25 ppm', '14500.00'],
      ['Konica Minolta bizhub 4020i', 'Multifuncional A4 · 40 ppm · monocromática', '3890.00'],
      ['Canon imageRUNNER 2425', 'Multifuncional A3 · 25 ppm', '6490.00'],
      ['Canon imageRUNNER ADVANCE DX C3826i', 'Multifuncional color A3 · 26 ppm', '16800.00'],
      ['Kyocera TASKalfa 2554ci', 'Multifuncional color A3 · 25 ppm', '13200.00'],
      ['Kyocera ECOSYS M3655idn', 'Multifuncional A4 · 55 ppm', '5290.00'],
      ['Sharp BP-50C26', 'Multifuncional color A3 · 26 ppm', '12900.00'],
      ['Xerox VersaLink C7120', 'Multifuncional color A3 · 20 ppm', '11500.00'],
      ['Toshiba e-STUDIO 2528A', 'Multifuncional A3 · 25 ppm', '6990.00'],
    ],
  },
  {
    category: 'Impresoras',
    prefix: 'IMP',
    items: [
      ['HP LaserJet Pro M404dn', 'Láser monocromática · 40 ppm · dúplex y red', '1290.00'],
      ['HP LaserJet Pro MFP M428fdw', 'Multifuncional láser · WiFi · fax', '2190.00'],
      ['HP Color LaserJet Pro M454dw', 'Láser color · 28 ppm · WiFi', '2450.00'],
      ['HP Smart Tank 580', 'Multifuncional de tinta continua · WiFi', '799.00'],
      ['Epson EcoTank L3250', 'Multifuncional de tinta continua · WiFi', '749.00'],
      ['Epson EcoTank L5590', 'Multifuncional con fax y alimentador automático', '1290.00'],
      ['Epson EcoTank L8050', 'Fotográfica A4 · 6 colores', '1390.00'],
      ['Epson EcoTank L14150', 'Multifuncional A3+ · WiFi', '2890.00'],
      ['Brother HL-L2350DW', 'Láser monocromática · WiFi · dúplex', '699.00'],
      ['Brother DCP-L5650DN', 'Multifuncional láser · red', '1890.00'],
      ['Brother MFC-T4500DW', 'Multifuncional A3 de tinta continua', '2390.00'],
      ['Canon PIXMA G3170', 'Multifuncional de tinta continua · WiFi', '749.00'],
      ['Canon imageCLASS MF445dw', 'Multifuncional láser · WiFi', '1590.00'],
      ['Kyocera ECOSYS P2040dn', 'Láser monocromática · 40 ppm', '990.00'],
      ['Epson LX-350', 'Matricial de 9 pines', '1090.00'],
      ['Zebra ZD220', 'Térmica de etiquetas · 4 pulgadas', '1190.00'],
    ],
  },
  {
    category: 'Laptops',
    prefix: 'LAP',
    items: [
      ['Lenovo ThinkPad E14 Gen 5', 'Core i5 · 16 GB RAM · SSD de 512 GB', '3590.00'],
      ['Lenovo ThinkPad E16 Gen 1', 'Core i7 · 16 GB RAM · SSD de 1 TB', '4690.00'],
      ['Lenovo IdeaPad Slim 3 15"', 'Ryzen 5 · 8 GB RAM · SSD de 512 GB', '2190.00'],
      ['Lenovo IdeaPad 1 14"', 'Celeron · 4 GB RAM · 128 GB', '1190.00'],
      ['HP ProBook 440 G10', 'Core i5 · 16 GB RAM · SSD de 512 GB', '3790.00'],
      ['HP ProBook 450 G10', 'Core i7 · 16 GB RAM · SSD de 512 GB', '4490.00'],
      ['HP 15-fd0000', 'Core i3 · 8 GB RAM · SSD de 256 GB', '1790.00'],
      ['HP Victus 15', 'Ryzen 5 · RTX 3050 · 16 GB RAM', '3690.00'],
      ['Dell Latitude 3440', 'Core i5 · 8 GB RAM · SSD de 256 GB', '3290.00'],
      ['Dell Latitude 5440', 'Core i7 · 16 GB RAM · SSD de 512 GB', '5190.00'],
      ['Dell Vostro 3520', 'Core i5 · 8 GB RAM · SSD de 512 GB', '2690.00'],
      ['Dell Inspiron 15 3530', 'Core i7 · 16 GB RAM · SSD de 512 GB', '3490.00'],
      ['Asus Vivobook 15', 'Core i5 · 8 GB RAM · SSD de 512 GB', '2290.00'],
      ['Asus ExpertBook B1', 'Core i5 · 16 GB RAM · SSD de 512 GB', '3190.00'],
      ['Asus TUF Gaming F15', 'Core i7 · RTX 4050 · 16 GB RAM', '4990.00'],
      ['Acer Aspire 5', 'Core i5 · 8 GB RAM · SSD de 512 GB', '2390.00'],
      ['Acer Extensa 15', 'Core i3 · 8 GB RAM · SSD de 256 GB', '1690.00'],
      ['Apple MacBook Air 13" M2', '8 GB RAM · SSD de 256 GB', '4499.00'],
      ['Apple MacBook Air 15" M3', '16 GB RAM · SSD de 512 GB', '6899.00'],
      ['MSI Modern 15', 'Core i5 · 8 GB RAM · SSD de 512 GB', '2490.00'],
    ],
  },
  {
    category: 'Computadoras',
    prefix: 'PC',
    items: [
      ['Lenovo ThinkCentre M70s', 'Core i5 · 8 GB RAM · SSD de 512 GB', '3290.00'],
      ['Lenovo ThinkCentre neo 50s', 'Core i3 · 8 GB RAM · SSD de 256 GB', '2290.00'],
      ['Lenovo IdeaCentre AIO 3 24"', 'Todo en uno · Core i5 · 8 GB RAM', '3190.00'],
      ['HP ProDesk 400 G9 SFF', 'Core i5 · 8 GB RAM · SSD de 512 GB', '3190.00'],
      ['HP EliteDesk 800 G9 Mini', 'Core i7 · 16 GB RAM · SSD de 512 GB', '4890.00'],
      ['HP All-in-One 24-cr0000', 'Todo en uno · Core i5 · 16 GB RAM', '3690.00'],
      ['Dell OptiPlex 3000 Tower', 'Core i5 · 8 GB RAM · SSD de 256 GB', '2990.00'],
      ['Dell OptiPlex 7010 Micro', 'Core i7 · 16 GB RAM · SSD de 512 GB', '4590.00'],
      ['Dell Inspiron 24 All-in-One', 'Todo en uno · Core i7 · 16 GB RAM', '4290.00'],
      ['Asus ExpertCenter D5', 'Core i5 · 8 GB RAM · SSD de 512 GB', '2790.00'],
      ['PC armada Core i5-12400', '16 GB RAM · SSD de 512 GB · monitor de 22"', '2690.00'],
      ['PC armada Core i7-13700', '32 GB RAM · SSD de 1 TB', '4190.00'],
      ['PC armada Ryzen 5 5600G', '16 GB RAM · SSD de 512 GB', '2190.00'],
      ['PC gamer Ryzen 7', 'RTX 4060 · 32 GB RAM · SSD de 1 TB', '5990.00'],
    ],
  },
  {
    category: 'Plotters',
    prefix: 'PLT',
    items: [
      ['HP DesignJet T230 24"', 'Plotter de 24 pulgadas · WiFi', '5290.00'],
      ['HP DesignJet T650 36"', 'Plotter de 36 pulgadas · con base', '9890.00'],
      ['HP DesignJet T830 36"', 'Plotter multifuncional de 36 pulgadas', '13900.00'],
      ['Canon imagePROGRAF TM-200 24"', 'Plotter de 24 pulgadas · 5 colores', '6290.00'],
      ['Canon imagePROGRAF TM-300 36"', 'Plotter de 36 pulgadas · 5 colores', '9490.00'],
      ['Epson SureColor T3170 24"', 'Plotter de escritorio de 24 pulgadas', '3990.00'],
      ['Epson SureColor T5170 36"', 'Plotter de 36 pulgadas · WiFi', '6990.00'],
      ['Epson SureColor F570 24"', 'Plotter de sublimación de 24 pulgadas', '7490.00'],
    ],
  },
  {
    category: 'Suministros',
    prefix: 'SUM',
    items: [
      ['Tóner HP 58A CF258A', 'Original · 3 000 páginas', '349.00'],
      ['Tóner HP 26A CF226A', 'Original · 3 100 páginas', '389.00'],
      ['Tóner Brother TN-2370', 'Original · 2 600 páginas', '249.00'],
      ['Tóner Kyocera TK-1175', 'Original · 12 000 páginas', '289.00'],
      ['Tóner Ricoh MP 2014', 'Original · 12 000 páginas', '129.00'],
      ['Tóner Konica Minolta TN-328K', 'Original negro · 28 000 páginas', '299.00'],
      ['Tinta Epson T544 negra', 'Botella de 65 ml', '39.00'],
      ['Tinta Epson T544 a color', 'Kit de 3 botellas de 65 ml', '109.00'],
      ['Tinta HP GT53 negra', 'Botella de 90 ml', '45.00'],
      ['Tinta Canon GI-190 negra', 'Botella de 135 ml', '39.00'],
      ['Tinta Brother BTD60BK', 'Botella de 108 ml', '49.00'],
      ['Drum Brother DR-2370', 'Unidad de imagen · 12 000 páginas', '289.00'],
      ['Cartucho HP 712 negro', 'Para plotter · 80 ml', '249.00'],
      ['Rollo bond para plotter 24"', '24 pulgadas × 50 m · 80 g', '89.00'],
      ['Rollo bond para plotter 36"', '36 pulgadas × 50 m · 80 g', '129.00'],
      ['Papel bond A4 75 g', 'Caja de 10 millares', '239.00'],
      ['Papel fotográfico glossy A4', 'Paquete de 100 hojas', '59.00'],
      ['Kit de mantenimiento HP M404', 'Fusor y rodillos', '799.00'],
    ],
  },
  {
    category: 'Accesorios',
    prefix: 'ACC',
    items: [
      ['Monitor LG 24" Full HD', 'Panel IPS · HDMI', '549.00'],
      ['Monitor Samsung 27" curvo', 'Full HD · 75 Hz', '799.00'],
      ['Monitor Dell P2422H 24"', 'Full HD · ajustable en altura', '899.00'],
      ['Teclado y mouse Logitech MK270', 'Inalámbricos', '99.00'],
      ['Mouse Logitech M170', 'Inalámbrico', '39.00'],
      ['Mochila para laptop 15.6"', 'Impermeable', '89.00'],
      ['SSD Kingston A400 480 GB', 'SATA de 2.5 pulgadas', '129.00'],
      ['Memoria RAM 16 GB DDR4', '3200 MHz', '189.00'],
      ['UPS Forza 1000 VA', '6 tomas · regulador incorporado', '349.00'],
      ['Estabilizador 1200 VA', '8 tomas', '99.00'],
      ['Cable HDMI 2 m', 'Alta velocidad', '25.00'],
      ['Router TP-Link Archer C6', 'Doble banda AC1200', '169.00'],
    ],
  },
]

const products = CATALOG.flatMap(({ category, prefix, items }) =>
  items.map(([name, description, unit_price], index) => ({
    category,
    code: `DEMO-${prefix}-${String(index + 1).padStart(3, '0')}`,
    name,
    description,
    unit_price,
  })),
)

const command = process.argv[2]
const {
  NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  OWNER_EMAIL,
  OWNER_PASSWORD,
} = process.env

if (!['seed', 'clean'].includes(command)) {
  console.error('Uso: pnpm demo:seed o pnpm demo:clean')
  process.exit(1)
}
if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.')
  process.exit(1)
}
if (!OWNER_EMAIL || !OWNER_PASSWORD) {
  console.error('Faltan OWNER_EMAIL y OWNER_PASSWORD (la cuenta con acceso al catálogo).')
  process.exit(1)
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const fail = (error) => {
  if (error) throw new Error(error.message)
}

const { error: loginError } = await supabase.auth.signInWithPassword({
  email: OWNER_EMAIL,
  password: OWNER_PASSWORD,
})
fail(loginError)
const project = new URL(NEXT_PUBLIC_SUPABASE_URL).host
const names = CATALOG.map(({ category }) => category)

if (command === 'seed') {
  const { data: existing, error } = await supabase.from('categories').select('id, name')
  fail(error)
  const byName = new Map(
    existing.map((category) => [category.name.trim().toLowerCase(), category.id]),
  )
  const missing = names.filter((name) => !byName.has(name.toLowerCase()))
  if (missing.length > 0) {
    const { data: created, error: createError } = await supabase
      .from('categories')
      .insert(missing.map((name) => ({ name })))
      .select('id, name')
    fail(createError)
    for (const category of created) byName.set(category.name.toLowerCase(), category.id)
  }
  const { data: present, error: presentError } = await supabase
    .from('products')
    .select('code')
    .like('code', 'DEMO-%')
  fail(presentError)
  const codes = new Set(present.map((product) => product.code))
  const rows = products
    .filter((product) => !codes.has(product.code))
    .map(({ category, ...product }) => ({
      ...product,
      category_id: byName.get(category.toLowerCase()),
    }))
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('products').insert(rows)
    fail(insertError)
  }
  console.log(
    `${rows.length} productos de prueba añadidos en ${project} (${products.length - rows.length} ya estaban).`,
  )
} else {
  const { data: removed, error } = await supabase
    .from('products')
    .delete()
    .like('code', 'DEMO-%')
    .select('code')
  fail(error)
  // Solo las categorías de prueba que quedaron vacías: si tienen productos tuyos, se quedan.
  const { data: categories, error: listError } = await supabase
    .from('categories')
    .select('id, name, products(count)')
    .in('name', names)
  fail(listError)
  const empty = categories.filter((category) => category.products[0].count === 0)
  if (empty.length > 0) {
    const { error: deleteError } = await supabase
      .from('categories')
      .delete()
      .in(
        'id',
        empty.map((category) => category.id),
      )
    fail(deleteError)
  }
  console.log(
    `${removed.length} productos de prueba y ${empty.length} categorías vacías borrados en ${project}.`,
  )
}
