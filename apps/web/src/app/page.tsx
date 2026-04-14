import { redirect } from 'next/navigation'

// Root route: redirect to stock dashboard (middleware handles auth check)
export default function RootPage(): never {
  redirect('/stock')
}
