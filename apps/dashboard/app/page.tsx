import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const { userId } = await auth()
  
  // Si el usuario está autenticado, ir al dashboard
  if (userId) {
    redirect('/dashboard')
  }
  
  // Si no está autenticado, ir al login
  redirect('/sign-in')
}
