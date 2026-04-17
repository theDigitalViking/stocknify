'use client'

import {
  BarChart2,
  Bell,
  LogOut,
  Package,
  Plug,
  Settings,
  Sliders,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { useTenant } from '@/lib/api/use-tenant'
import { signOut } from '@/lib/auth'
import { cn } from '@/lib/utils'

interface NavItem {
  key: 'stock' | 'products' | 'rules' | 'integrations' | 'notifications' | 'settings'
  href: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { key: 'stock', href: '/stock', icon: BarChart2 },
  { key: 'products', href: '/products', icon: Package },
  { key: 'rules', href: '/rules', icon: Sliders },
  { key: 'integrations', href: '/integrations', icon: Plug },
  { key: 'notifications', href: '/notifications', icon: Bell },
  { key: 'settings', href: '/settings', icon: Settings },
]

export function Sidebar(): JSX.Element {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const { data: tenant } = useTenant()

  async function handleSignOut(): Promise<void> {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-[220px] flex-shrink-0 border-r border-border bg-card flex flex-col">
      <div className="h-12 px-4 border-b border-border flex items-center gap-2">
        <Link href="/stock" className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-brand-600" />
          <span className="text-sm font-semibold">Stocknify</span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 h-8 px-3 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{t(item.key)}</span>
            </Link>
          )
        })}
      </nav>

      {tenant ? (
        <div className="px-3 pb-2 text-xs text-muted-foreground truncate">{tenant.name}</div>
      ) : null}

      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-2 h-8 px-3 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>{t('signOut')}</span>
        </button>
      </div>
    </aside>
  )
}
