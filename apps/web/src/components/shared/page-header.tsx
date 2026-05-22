import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  // `ReactNode` so callers can render an inline-editable title with controls
  // (Cycle 5-A.5) instead of just a string. Plain-string callers stay valid.
  title: ReactNode
  children?: ReactNode
  // When the page already wraps the header area in its own sticky container
  // (e.g. movements page with breadcrumb + title stacked), opt out of the
  // built-in sticky positioning so the two layers don't fight for top-0.
  noSticky?: boolean
}

export function PageHeader({ title, children, noSticky = false }: PageHeaderProps): JSX.Element {
  return (
    <div
      className={cn(
        'h-12 border-b border-border bg-background px-6 md:px-8 flex items-center justify-between',
        !noSticky && 'sticky top-0 z-20',
      )}
    >
      <h1 className="text-base font-semibold text-foreground">{title}</h1>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  )
}
