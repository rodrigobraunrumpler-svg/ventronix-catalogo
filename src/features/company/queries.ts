import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { WALLET_KINDS, type CompanyProfile } from './schemas'

type Client = SupabaseClient<Database>

export const companyColumns =
  'legal_name, trade_name, ruc, address, phones, email, payment_terms, return_policy, default_validity_days, bank_accounts, wallets, whatsapp_message, updated_at'

// Lo guardado ya pasó por companyProfileSchema: aquí solo se comprueba su forma. Sirve para la fila
// de la empresa y para la copia que guarda cada proforma del historial (spec de productos libres §3).
export const storedCompanySchema = z.object({
  legal_name: z.string().nullable(),
  trade_name: z.string().nullable(),
  ruc: z.string().nullable(),
  address: z.string().nullable(),
  phones: z.array(z.string()),
  email: z.string().nullable(),
  payment_terms: z.string().nullable(),
  return_policy: z.string().nullable(),
  default_validity_days: z.number().int(),
  bank_accounts: z.array(
    z.object({
      bank: z.string(),
      account: z.string(),
      cci: z.string(),
      holder: z.string().nullable(),
    }),
  ),
  wallets: z.array(z.object({ kind: z.enum(WALLET_KINDS), number: z.string() })),
  whatsapp_message: z.string().nullable(),
  updated_at: z.string(),
}) satisfies z.ZodType<CompanyProfile>

export const toCompanyProfile = (row: unknown): CompanyProfile => storedCompanySchema.parse(row)

export async function getCompanyProfile(supabase: Client): Promise<CompanyProfile | null> {
  const { data, error } = await supabase
    .from('company_profile')
    .select(companyColumns)
    .maybeSingle()
  if (error) throw error
  return data ? toCompanyProfile(data) : null
}
