import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  children?: ReactNode
}

export function PageHeader({ title, children }: PageHeaderProps): JSX.Element {
  return (
    <div className="h-12 border-b border-border px-6 flex items-center justify-between">
      <h1 className="text-base font-semibold text-foreground">{title}</h1>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  )
}
