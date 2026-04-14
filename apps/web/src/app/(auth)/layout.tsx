import type { ReactNode } from 'react'

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-600">Stocknify</h1>
          <p className="text-muted-foreground mt-1">Inventory intelligence for modern merchants</p>
        </div>
        {children}
      </div>
    </div>
  )
}
