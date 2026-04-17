import { cn } from '@/lib/utils'

type StatusVariant = 'success' | 'warning' | 'critical' | 'info' | 'neutral'

interface StatusBadgeProps {
  label: string
  color?: string
  variant?: StatusVariant
  className?: string
}

const VARIANT_COLORS: Record<StatusVariant, string> = {
  success: '#16a34a',
  warning: '#d97706',
  critical: '#dc2626',
  info: '#2563eb',
  neutral: '#6b7280',
}

export function StatusBadge({ label, color, variant, className }: StatusBadgeProps): JSX.Element {
  const dotColor = color ?? (variant ? VARIANT_COLORS[variant] : VARIANT_COLORS.neutral)
  return (
    <span className={cn('flex items-center gap-1.5 text-sm', className)}>
      <span
        className="h-2 w-2 rounded-full inline-block flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      {label}
    </span>
  )
}
