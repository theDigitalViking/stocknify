'use client'

import { FileText, Hand, Zap, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

interface ProductSourceIconsProps {
  metadata: Record<string, unknown> | null | undefined
}

type Source = 'manual' | 'csv' | 'api'

const SOURCE_CONFIG: Record<Source, { icon: LucideIcon; className: string }> = {
  manual: { icon: Hand, className: 'text-muted-foreground' },
  csv: { icon: FileText, className: 'text-blue-500' },
  api: { icon: Zap, className: 'text-brand-600' },
}

function isSource(value: unknown): value is Source {
  return value === 'manual' || value === 'csv' || value === 'api'
}

export function ProductSourceIcons({ metadata }: ProductSourceIconsProps): JSX.Element {
  const t = useTranslations('products.source')
  const raw = metadata?.source
  const source: Source = isSource(raw) ? raw : 'manual'
  const config = SOURCE_CONFIG[source]
  const Icon = config.icon

  return (
    <span
      className={cn('inline-flex items-center', config.className)}
      title={t(source)}
      aria-label={t(source)}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}
