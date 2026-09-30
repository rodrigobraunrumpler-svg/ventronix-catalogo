// Crea la única cuenta con acceso al catálogo o le vuelve a asignar la marca (spec §5).
// Procedimiento administrativo: se ejecuta a mano, con la clave secreta solo en el entorno.
//
//   SUPABASE_URL=https://<proyecto>.supabase.co \
//   SUPABASE_SECRET_KEY=<clave secreta> \
//   OWNER_EMAIL=<correo> OWNER_PASSWORD=<contraseña> \
//   pnpm owner:create
//
// Las variables también pueden ir en .env.local; las de la línea de comandos tienen prioridad.
// OWNER_PASSWORD es obligatorio al crear la cuenta; en una cuenta existente fija esa contraseña
// (recuperación). La clave secreta nunca se guarda en el repositorio ni en variables NEXT_PUBLIC_:
// si la pusiste en .env.local, bórrala al terminar.
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SECRET_KEY, OWNER_EMAIL, OWNER_PASSWORD } = process.env

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !OWNER_EMAIL) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SECRET_KEY u OWNER_EMAIL.')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (error) throw error

const email = OWNER_EMAIL.trim().toLowerCase()
const project = new URL(SUPABASE_URL).host
const existing = data.users.find((user) => user.email?.toLowerCase() === email)

if (existing) {
  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    app_metadata: { ...existing.app_metadata, catalog_access: 'owner' },
    password: OWNER_PASSWORD || undefined,
  })
  if (updateError) throw updateError
  console.log(
    OWNER_PASSWORD
      ? `Marca de acceso y contraseña nueva asignadas a ${email} en ${project}.`
      : `Marca de acceso asignada a ${email} en ${project}.`,
  )
} else {
  if (!OWNER_PASSWORD) {
    console.error('Para crear la cuenta hace falta OWNER_PASSWORD.')
    process.exit(1)
  }
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password: OWNER_PASSWORD,
    email_confirm: true,
    app_metadata: { catalog_access: 'owner' },
  })
  if (createError) throw createError
  console.log(`Cuenta ${email} creada con acceso al catálogo en ${project}.`)
}
