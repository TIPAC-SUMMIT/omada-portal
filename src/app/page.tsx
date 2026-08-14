import { redirect } from 'next/navigation'

export default function HomePage() {
  // Root page redirects to admin login
  redirect('/admin/login')
}