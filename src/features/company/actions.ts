'use server'

import { invalid } from '@/features/catalog/action-errors'
import type { ActionResult } from '@/lib/action-result'
import { withOwner } from '@/lib/auth/with-owner'
import { saveCompanyProfileRow } from './repository'
import { companyProfileSchema, type CompanyProfile } from './schemas'

export async function saveCompanyProfile(input: unknown): Promise<ActionResult<CompanyProfile>> {
  return withOwner(async ({ supabase }) => {
    const parsed = companyProfileSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return saveCompanyProfileRow(supabase, parsed.data)
  })
}
