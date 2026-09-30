'use server'

import { withOwner } from '@/lib/auth/with-owner'
import type { ActionResult } from '@/lib/action-result'
import { invalid } from '../action-errors'
import { idSchema, productSchema } from '../schemas'
import type { Product } from '../types'
import { createProductRow, deleteProductRow, updateProductRow } from './repository'

export async function createProduct(input: unknown): Promise<ActionResult<Product>> {
  return withOwner(async ({ supabase }) => {
    const parsed = productSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return createProductRow(supabase, parsed.data)
  })
}

export async function updateProduct(id: unknown, input: unknown): Promise<ActionResult<Product>> {
  return withOwner(async ({ supabase }) => {
    const parsedId = idSchema.safeParse(id)
    if (!parsedId.success) return invalid(parsedId.error)
    const parsed = productSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    return updateProductRow(supabase, parsedId.data, parsed.data)
  })
}

export async function deleteProduct(id: unknown): Promise<ActionResult<null>> {
  return withOwner(async ({ supabase }) => {
    const parsedId = idSchema.safeParse(id)
    if (!parsedId.success) return invalid(parsedId.error)
    return deleteProductRow(supabase, parsedId.data)
  })
}
