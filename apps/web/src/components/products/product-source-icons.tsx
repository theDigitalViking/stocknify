'use client'

import { FileText, Hand, Zap, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

type Source = 'manual' | 'csv' | 'api'

interface ProductSourceIconsProps {
  // One of: an unknown metadata blob (extracts metadata.source), or an
  // already-resolved source string. Variant rows pass `source` directly
  // because variants have no metadata column yet — the fallback for
  // unknown values keeps the icon area from going blank.
  metadata?: Record<string, unknown> | null
  source?: string | null
}

const SOURCE_CONFIG: Record<Source, { icon: LucideIcon; className: string }> = {
  manual: { icon: Hand, className: 'text-muted-foreground' },
  csv: { icon: FileText, className: 'text-blue-500' },
  api: { icon: Zap, className: 'text-brand-600' },
}

function isSource(value: unknown): value is Source {
  return value === 'manual' || value === 'csv' || value === 'api'
}

export function ProductSourceIcons({
  metadata,
  source: explicitSource,
}: ProductSourceIconsProps): JSX.Element {
  const t = useTranslations('products.source')
  const raw = explicitSource ?? metadata?.source
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
