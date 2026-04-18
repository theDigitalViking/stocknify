import { redirect } from 'next/navigation'

// Root route: redirect to products list (middleware handles auth check)
export default function RootPage(): never {
  redirect('/products')
}
