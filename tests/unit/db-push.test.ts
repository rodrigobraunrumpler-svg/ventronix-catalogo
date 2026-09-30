import { describe, expect, it } from 'vitest'
import { resolveTarget } from '../../scripts/db-push.mjs'

const apiUrl = 'https://abcdefghijklmnopqrst.supabase.co'
const pooler =
  'postgresql://postgres.abcdefghijklmnopqrst:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'

describe('destino de las migraciones', () => {
  it('pone la contraseña en la cadena, codificada aunque tenga símbolos', () => {
    const password = 'p@ss:w/rd#50%$&'
    const url = new URL(resolveTarget({ connection: pooler, password, apiUrl }).url)
    expect(decodeURIComponent(url.password)).toBe(password)
    expect(url.username).toBe('postgres.abcdefghijklmnopqrst')
    expect(url.hostname).toBe('aws-0-sa-east-1.pooler.supabase.com')
  })

  it('muestra el destino sin la contraseña', () => {
    const { label } = resolveTarget({ connection: pooler, password: 'secreta-123', apiUrl })
    expect(label).toBe(
      'postgres.abcdefghijklmnopqrst@aws-0-sa-east-1.pooler.supabase.com:5432/postgres',
    )
  })

  it('rechaza la URL de la API, que no es la de la base de datos', () => {
    expect(() => resolveTarget({ connection: apiUrl, password: 'x', apiUrl })).toThrow(
      /Connect → Session pooler/,
    )
  })

  it('rechaza una cadena de otro proyecto', () => {
    const other = pooler.replace('abcdefghijklmnopqrst', 'zzzzzzzzzzzzzzzzzzzz')
    expect(() => resolveTarget({ connection: other, password: 'x', apiUrl })).toThrow(
      /otro proyecto/,
    )
  })
})
