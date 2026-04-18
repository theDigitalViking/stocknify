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
  X,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { useTenant } from '@/lib/api/use-tenant'
import { signOut } from '@/lib/auth'
import { useSidebarStore } from '@/lib/stores/sidebar'
import { cn } from '@/lib/utils'

interface NavItem {
  key: 'stock' | 'products' | 'rules' | 'integrations' | 'notifications' | 'settings'
  href: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { key: 'products', href: '/products', icon: Package },
  { key: 'stock', href: '/stock', icon: BarChart2 },
  { key: 'integrations', href: '/integrations', icon: Plug },
  { key: 'rules', href: '/rules', icon: Sliders },
  { key: 'notifications', href: '/notifications', icon: Bell },
  { key: 'settings', href: '/settings', icon: Settings },
]

export function MobileSidebar(): JSX.Element {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('nav')
  const { data: tenant } = useTenant()
  const isOpen = useSidebarStore((s) => s.isMobileOpen)
  const close = useSidebarStore((s) => s.closeMobile)

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, close])

  async function handleSignOut(): Promise<void> {
    close()
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div
      className={cn(
        'md:hidden fixed inset-0 z-50 transition-opacity duration-200',
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      aria-hidden={!isOpen}
    >
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={close}
        aria-label="Close sidebar"
      />
      <aside
        className={cn(
          'absolute inset-y-0 left-0 w-[260px] bg-card border-r border-border flex flex-col transition-transform duration-200',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="h-12 px-4 border-b border-border flex items-center justify-between">
          <Link
            href="/stock"
            className="flex items-center gap-2"
            onClick={close}
          >
            <Warehouse className="h-5 w-5 text-brand-600" />
            <span className="text-sm font-semibold">Stocknify</span>
          </Link>
          <button
            type="button"
            onClick={close}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={cn(
                  'flex items-center gap-2 h-9 px-3 rounded-md text-sm transition-colors',
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
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 h-9 px-3 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('signOut')}</span>
          </button>
        </div>
      </aside>
    </div>
  )
}
