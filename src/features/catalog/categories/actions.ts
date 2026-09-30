'use server'

import { withOwner } from '@/lib/auth/with-owner'
import type { ActionResult } from '@/lib/action-result'
import { invalid } from '../action-errors'
import { categorySchema, idSchema } from '../schemas'
import type { Category } from '../types'
import { createCategoryRow, deleteCategoryRow, updateCategoryRow } from './repository'

export async function createCategory(input: unknown): Promise<ActionResult<Category>> {
  return withOwner(async ({ supabase }) => {
    const parsed = categorySchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return createCategoryRow(supabase, parsed.data)
  })
}

export async function updateCategory(id: unknown, input: unknown): Promise<ActionResult<Category>> {
  return withOwner(async ({ supabase }) => {
    const parsedId = idSchema.safeParse(id)
    if (!parsedId.success) return invalid(parsedId.error)
    const parsed = categorySchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return updateCategoryRow(supabase, parsedId.data, parsed.data)
  })
}

export async function deleteCategory(id: unknown): Promise<ActionResult<null>> {
  return withOwner(async ({ supabase }) => {
    const parsedId = idSchema.safeParse(id)
    if (!parsedId.success) return invalid(parsedId.error)
    return deleteCategoryRow(supabase, parsedId.data)
  })
}
