'use client'

import {
  BarChart3,
  Bell,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import { signOut } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Stock', href: '/stock', icon: BarChart3 },
  { label: 'Rules', href: '/rules', icon: GitBranch },
  { label: 'Integrations', href: '/integrations', icon: Package },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar(): JSX.Element {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut(): Promise<void> {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 flex-shrink-0 border-r border-border bg-card flex flex-col">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-border">
        <Link href="/stock" className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-brand-600" />
          <span className="font-bold text-lg">Stocknify</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className={cn('h-4 w-4', isActive ? 'text-brand-600' : '')} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 py-4 border-t border-border">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
