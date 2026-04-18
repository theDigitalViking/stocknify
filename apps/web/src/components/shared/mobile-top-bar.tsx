'use client'

import { Menu, Warehouse } from 'lucide-react'
import Link from 'next/link'

import { useSidebarStore } from '@/lib/stores/sidebar'

export function MobileTopBar(): JSX.Element {
  const openMobile = useSidebarStore((s) => s.openMobile)

  return (
    <div className="md:hidden h-12 border-b border-border px-4 flex items-center gap-3 bg-card">
      <button
        type="button"
        onClick={openMobile}
        className="h-8 w-8 -ml-1 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>
      <Link href="/stock" className="flex items-center gap-2">
        <Warehouse className="h-5 w-5 text-brand-600" />
        <span className="text-sm font-semibold">Stocknify</span>
      </Link>
    </div>
  )
}
