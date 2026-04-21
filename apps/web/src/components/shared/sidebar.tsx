'use client'

import {
  BarChart2,
  Bell,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
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
import { useSidebarStore } from '@/lib/stores/sidebar'
import { cn } from '@/lib/utils'

interface SubNavItem {
  key: 'automatic' | 'marketplace'
  href: string
}

interface NavItem {
  key: 'stock' | 'products' | 'rules' | 'integrations' | 'notifications' | 'settings'
  href: string
  icon: LucideIcon
  subItems?: SubNavItem[]
}

const NAV_ITEMS: NavItem[] = [
  { key: 'products', href: '/products', icon: Package },
  { key: 'stock', href: '/stock', icon: BarChart2 },
  {
    key: 'integrations',
    href: '/integrations',
    icon: Plug,
    subItems: [
      { key: 'automatic', href: '/integrations/automatic' },
      { key: 'marketplace', href: '/integrations/marketplace' },
    ],
  },
  { key: 'rules', href: '/rules', icon: Sliders },
  { key: 'notifications', href: '/notifications', icon: Bell },
  { key: 'settings', href: '/settings', icon: Settings },
]

export function Sidebar(): JSX.Element {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const { data: tenant } = useTenant()
  const isCollapsed = useSidebarStore((s) => s.isCollapsed)
  const toggle = useSidebarStore((s) => s.toggle)

  async function handleSignOut(): Promise<void> {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside
      className={cn(
        'flex-shrink-0 border-r border-border bg-card flex flex-col transition-all duration-200',
        isCollapsed ? 'w-[56px]' : 'w-[220px]',
      )}
    >
      <div
        className={cn(
          'h-12 border-b border-border flex items-center',
          isCollapsed ? 'justify-center px-0' : 'px-4 justify-between',
        )}
      >
        <Link
          href="/products"
          className="flex items-center gap-2 min-w-0"
          title={isCollapsed ? 'Stocknify' : undefined}
        >
          <Warehouse className="h-5 w-5 text-brand-600 flex-shrink-0" />
          {isCollapsed ? null : (
            <span className="text-sm font-semibold truncate">Stocknify</span>
          )}
        </Link>
        {isCollapsed ? null : (
          <button
            type="button"
            onClick={toggle}
            title={t('collapse')}
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {isCollapsed ? (
        <button
          type="button"
          onClick={toggle}
          title={t('expand')}
          className="h-12 w-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-b border-border"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      ) : null}

      <nav className={cn('flex-1 py-3 space-y-0.5', isCollapsed ? 'px-2' : 'px-3')}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const label = t(item.key)
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                title={isCollapsed ? label : undefined}
                className={cn(
                  'flex items-center h-8 rounded-md text-sm transition-colors',
                  isCollapsed ? 'justify-center px-0' : 'gap-2 px-3',
                  isActive
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                {isCollapsed ? null : <span>{label}</span>}
              </Link>

              {!isCollapsed && item.subItems ? (
                <div className="mt-0.5 space-y-0.5">
                  {item.subItems.map((sub) => {
                    const isSubActive = pathname.startsWith(sub.href)
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={cn(
                          'flex items-center h-7 rounded-md text-xs transition-colors pl-8 pr-3',
                          isSubActive
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {t(`integrationsSub.${sub.key}`)}
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>

      {tenant && !isCollapsed ? (
        <div className="px-3 pb-2 text-xs text-muted-foreground truncate">{tenant.name}</div>
      ) : null}

      <div className={cn('py-3 border-t border-border', isCollapsed ? 'px-2' : 'px-3')}>
        <button
          type="button"
          onClick={handleSignOut}
          title={isCollapsed ? t('signOut') : undefined}
          className={cn(
            'flex w-full items-center h-8 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
            isCollapsed ? 'justify-center px-0' : 'gap-2 px-3',
          )}
        >
          <LogOut className="h-4 w-4" />
          {isCollapsed ? null : <span>{t('signOut')}</span>}
        </button>
      </div>
    </aside>
  )
}
