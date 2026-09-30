// Aplica las migraciones de supabase/migrations al proyecto de Supabase en la nube, sin
// `supabase login` ni `link`. Pide la cadena de conexión de la base y la contraseña sin mostrarla,
// enseña qué va a aplicar y espera confirmación.
//
//   pnpm db:push
//
// La cadena se copia en Supabase: botón Connect → Session pooler. Es la de la base de datos
// (postgresql://…), no la URL de la API de .env.local. Para no pegarla cada vez, guárdala en
// .env.local como DATABASE_URL. Si la dejas con [YOUR-PASSWORD], la contraseña se pide al ejecutar
// y no queda en ningún archivo; si la pones completa, queda en .env.local (no se versiona).
import { spawnSync } from 'node:child_process'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'

const PLACEHOLDER = '[YOUR-PASSWORD]'

// Cadena final con la contraseña codificada, y una etiqueta del destino sin la contraseña.
export function resolveTarget({ connection, password, apiUrl }) {
  const text = connection.trim()
  if (!/^postgres(ql)?:\/\//.test(text)) {
    throw new Error(
      'Esa no es la cadena de conexión de la base de datos (debe empezar por postgresql://). ' +
        'Cópiala en Supabase: Connect → Session pooler.',
    )
  }
  // Función de reemplazo: un `$` en la contraseña no se interpreta como patrón.
  const url = new URL(text.replace(PLACEHOLDER, () => encodeURIComponent(password ?? '')))
  const ref = apiUrl ? new URL(apiUrl).hostname.split('.')[0] : null
  if (ref && url.username !== `postgres.${ref}` && url.hostname !== `db.${ref}.supabase.co`) {
    throw new Error(`La cadena es de otro proyecto: tu .env.local usa el proyecto ${ref}.`)
  }
  return { url: url.href, label: `${url.username}@${url.hostname}:${url.port}${url.pathname}` }
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

// Lee sin mostrar lo que se escribe o se pega.
function askHidden(question) {
  return new Promise((resolve, reject) => {
    stdout.write(question)
    let value = ''
    const done = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          done()
          return resolve(value)
        }
        if (char === '\u0003') {
          done()
          return reject(new Error('Cancelado.'))
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char
      }
    }
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.on('data', onData)
    stdin.resume()
  })
}

function supabase(args) {
  const result = spawnSync('supabase', args, { stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

async function main() {
  if (!stdin.isTTY) throw new Error('Ejecuta pnpm db:push en una terminal interactiva.')
  const connection =
    process.env.DATABASE_URL ??
    (await ask('Cadena de conexión de la base (Supabase → Connect → Session pooler):\n> '))
  const password = connection.includes(PLACEHOLDER)
    ? await askHidden('Contraseña de la base de datos (no se muestra): ')
    : undefined
  const target = resolveTarget({
    connection,
    password,
    apiUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })

  console.log(`\nDestino: ${target.label}\nMigraciones pendientes (no se aplica nada todavía):\n`)
  supabase(['db', 'push', '--db-url', target.url, '--dry-run'])

  const answer = await ask('\n¿Aplicarlas? Escribe «si» para continuar: ')
  if (!['si', 'sí'].includes(answer.trim().toLowerCase())) {
    console.log('Cancelado. No se aplicó nada.')
    return
  }
  supabase(['db', 'push', '--db-url', target.url, '--yes'])
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`\n${error.message}`)
    process.exit(1)
  })
}
