import { Warehouse } from 'lucide-react'
import type { ReactNode } from 'react'

interface AuthLayoutProps {
  children: ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-8 flex items-center gap-2">
        <Warehouse className="h-5 w-5 text-brand-600" />
        <span className="text-sm font-semibold">Stocknify</span>
      </div>
      {children}
    </div>
  )
}
