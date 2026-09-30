import { z } from 'zod'
import { digitsOnly, isValidMobile, isValidRuc } from '@/lib/peru'

// Datos de la empresa para la proforma (spec §6.2). Importable en cliente y servidor. La salida
// vuelve a validar igual: el servidor comprueba exactamente lo que envía el formulario.
const tooLong = (max: number) => `Usa como máximo ${max} caracteres.`
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, tooLong(max))
    .nullish()
    .transform((value) => value || null)

export const PHONE_LIMIT = 4
export const ACCOUNT_LIMIT = 6
export const WALLET_LIMIT = 4
export const WALLET_KINDS = ['yape', 'plin', 'ambos'] as const

const accountMessage = 'Escribe el número de cuenta: de 6 a 20 dígitos.'
const mobileMessage = 'Escribe 9 dígitos que empiecen por 9.'
const validityMessage = 'La validez va de 1 a 365 días.'

const phoneSchema = z.object({
  number: z
    .string()
    .trim()
    .regex(
      /^[\d +()-]{6,20}$/,
      'Escribe un teléfono válido: números, espacios, +, - o paréntesis.',
    ),
})

export const bankAccountSchema = z.object({
  bank: z.string().trim().min(1, 'Escribe el banco.').max(60, tooLong(60)),
  account: z
    .string()
    .trim()
    .regex(/^[\d -]+$/, accountMessage)
    .refine((value) => {
      const digits = digitsOnly(value).length
      return digits >= 6 && digits <= 20
    }, accountMessage),
  cci: z
    .string()
    .trim()
    .regex(/^[\d -]+$/, 'El CCI tiene 20 dígitos.')
    .transform(digitsOnly)
    .refine((value) => value.length === 20, 'El CCI tiene 20 dígitos.'),
  holder: optionalText(200),
})

export const walletSchema = z.object({
  kind: z.enum(WALLET_KINDS),
  number: z
    .string()
    .trim()
    .regex(/^[\d ]+$/, mobileMessage)
    .transform(digitsOnly)
    .refine(isValidMobile, mobileMessage),
})

export const companyProfileSchema = z.object({
  legal_name: z.string().trim().min(1, 'Escribe la razón social.').max(200, tooLong(200)),
  trade_name: optionalText(120),
  ruc: z
    .string()
    .trim()
    .refine(isValidRuc, 'Escribe un RUC válido: 11 dígitos con su dígito verificador.'),
  address: z.string().trim().min(1, 'Escribe la dirección.').max(300, tooLong(300)),
  phones: z
    .array(phoneSchema)
    .min(1, 'Añade al menos un teléfono.')
    .max(PHONE_LIMIT, `Hasta ${PHONE_LIMIT} teléfonos.`),
  email: z
    .string()
    .trim()
    .max(254, tooLong(254))
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      'Escribe un correo válido.',
    )
    .nullish()
    .transform((value) => value || null),
  payment_terms: optionalText(500),
  return_policy: optionalText(500),
  default_validity_days: z.coerce
    .number(validityMessage)
    .int(validityMessage)
    .min(1, validityMessage)
    .max(365, validityMessage),
  bank_accounts: z.array(bankAccountSchema).max(ACCOUNT_LIMIT, `Hasta ${ACCOUNT_LIMIT} cuentas.`),
  wallets: z.array(walletSchema).max(WALLET_LIMIT, `Hasta ${WALLET_LIMIT} números.`),
})

export type CompanyFormValues = z.input<typeof companyProfileSchema>
export type CompanyInput = z.output<typeof companyProfileSchema>
export type BankAccount = z.output<typeof bankAccountSchema>
export type Wallet = z.output<typeof walletSchema>
export type WalletKind = (typeof WALLET_KINDS)[number]

// Lo guardado: empieza vacío hasta que la cuenta autorizada lo completa en «Empresa».
export type CompanyProfile = {
  legal_name: string | null
  trade_name: string | null
  ruc: string | null
  address: string | null
  phones: string[]
  email: string | null
  payment_terms: string | null
  return_policy: string | null
  default_validity_days: number
  bank_accounts: BankAccount[]
  wallets: Wallet[]
  updated_at: string
}
