import { redirect } from 'next/navigation'

// La tarea 3 decide entre /products y /login según la sesión.
export default function Home() {
  redirect('/products')
}
