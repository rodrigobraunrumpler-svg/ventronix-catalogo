import { z } from 'zod'

export const signInSchema = z.object({
  email: z.string().trim().pipe(z.email('Escribe un correo válido.')),
  password: z.string().min(1, 'Escribe tu contraseña.'),
})

export type SignInValues = z.input<typeof signInSchema>
