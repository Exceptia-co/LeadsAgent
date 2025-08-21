import { auth } from '@clerk/nextjs'
import { redirect } from 'next/navigation'

export default function Home() {
  const { userId } = auth()
  
  // Si el usuario está autenticado, ir al dashboard
  if (userId) {
    redirect('/dashboard')
  }
  
  // Si no está autenticado, ir al login
  redirect('/sign-in')
}
