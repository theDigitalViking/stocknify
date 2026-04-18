import type { ReactNode } from 'react'

import { MobileSidebar } from '@/components/shared/mobile-sidebar'
import { MobileTopBar } from '@/components/shared/mobile-top-bar'
import { Sidebar } from '@/components/shared/sidebar'

interface DashboardLayoutProps {
  children: ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps): JSX.Element {
  return (
    <div className="flex h-screen bg-background">
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      <MobileSidebar />

      <main className="flex-1 overflow-y-auto min-w-0">
        <MobileTopBar />
        {children}
      </main>
    </div>
  )
}
