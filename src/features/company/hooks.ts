'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { settle } from '@/lib/action-result'
import { createClient } from '@/lib/supabase/client'
import { saveCompanyProfile } from './actions'
import { getCompanyProfile } from './queries'
import type { CompanyInput } from './schemas'

export const companyKeys = { profile: ['company', 'profile'] as const }

export function useCompanyProfile() {
  return useQuery({
    queryKey: companyKeys.profile,
    queryFn: () => getCompanyProfile(createClient()),
  })
}

// Lo guardado pasa a la caché: la proforma usa los datos nuevos sin volver a pedirlos.
export function useSaveCompanyProfile() {
  const queryClient = useQueryClient()
  return async (input: CompanyInput) => {
    const result = await settle(saveCompanyProfile(input))
    if (result.ok) queryClient.setQueryData(companyKeys.profile, result.data)
    return result
  }
}
