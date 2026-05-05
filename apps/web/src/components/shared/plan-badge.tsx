'use client'

import type { Plan } from '@stocknify/shared'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

interface PlanBadgeProps {
  plan: Plan
  className?: string
}

// Compact pill rendering the tenant's active subscription plan. Trial reads
// as "in evaluation" via muted gray; paid tiers escalate through brand-tinted
// shades so a glance distinguishes a free-trial tenant from a paying one.
export function PlanBadge({ plan, className }: PlanBadgeProps): JSX.Element {
  const t = useTranslations('nav.plans')
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide',
        PLAN_STYLES[plan],
        className,
      )}
    >
      {t(plan)}
    </span>
  )
}

const PLAN_STYLES: Record<Plan, string> = {
  trial: 'bg-muted text-muted-foreground',
  starter: 'bg-brand-50 text-brand-700',
  growth: 'bg-brand-100 text-brand-800',
  enterprise: 'bg-brand-600 text-white',
}
