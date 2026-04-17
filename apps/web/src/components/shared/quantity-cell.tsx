import { cn } from '@/lib/utils'

interface QuantityCellProps {
  quantity: number
  threshold?: number
  className?: string
}

export function QuantityCell({ quantity, threshold, className }: QuantityCellProps): JSX.Element {
  const isCritical = quantity <= 0
  const isWarning = !isCritical && threshold !== undefined && quantity <= threshold

  return (
    <span
      className={cn(
        'tabular-nums text-right text-sm block',
        isCritical && 'text-red-600 font-medium',
        isWarning && 'text-amber-600 font-medium',
        !isCritical && !isWarning && 'text-foreground',
        className,
      )}
    >
      {quantity.toLocaleString('de-DE')}
    </span>
  )
}
