import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/supabase/database.types'
import { WALLET_KINDS, type CompanyProfile } from './schemas'

type Client = SupabaseClient<Database>

export const companyColumns =
  'legal_name, trade_name, ruc, address, phones, email, payment_terms, return_policy, default_validity_days, bank_accounts, wallets, whatsapp_message, updated_at'

// Lo guardado ya pasó por companyProfileSchema: aquí solo se comprueba la forma de las listas.
const storedLists = z.object({
  bank_accounts: z.array(
    z.object({
      bank: z.string(),
      account: z.string(),
      cci: z.string(),
      holder: z.string().nullable(),
    }),
  ),
  wallets: z.array(z.object({ kind: z.enum(WALLET_KINDS), number: z.string() })),
})

type CompanyRow = Omit<CompanyProfile, 'bank_accounts' | 'wallets'> & {
  bank_accounts: unknown
  wallets: unknown
}

export function toCompanyProfile(row: CompanyRow): CompanyProfile {
  return {
    ...row,
    ...storedLists.parse({ bank_accounts: row.bank_accounts, wallets: row.wallets }),
  }
}

export async function getCompanyProfile(supabase: Client): Promise<CompanyProfile | null> {
  const { data, error } = await supabase
    .from('company_profile')
    .select(companyColumns)
    .maybeSingle()
  if (error) throw error
  return data ? toCompanyProfile(data) : null
}
