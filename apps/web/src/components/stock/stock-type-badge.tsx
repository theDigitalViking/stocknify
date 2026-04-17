// Displays a stock type as a colored dot + label badge.
// Stock-type KEYS are tenant-extensible backend data, so we use the
// human-readable `label` from `stock_type_definitions` (passed in by the
// caller) rather than translating static keys through i18n.
// Color comes from stock_type_definitions.color if available, otherwise
// falls back to a default per known system types.

const SYSTEM_TYPE_COLORS: Record<string, string> = {
  available: '#16a34a',
  physical: '#2563eb',
  reserved: '#d97706',
  blocked: '#dc2626',
  in_transit: '#7c3aed',
  damaged: '#9f1239',
  expired: '#374151',
  pre_transit: '#0891b2',
}

interface StockTypeBadgeProps {
  stockType: string
  color?: string | null
  /** Prefer this label (from stock_type_definitions.label) when available. */
  label?: string | null
}

export function StockTypeBadge({ stockType, color, label }: StockTypeBadgeProps): JSX.Element {
  const dotColor = color ?? SYSTEM_TYPE_COLORS[stockType] ?? '#6b7280'
  const display = label ?? stockType.replace(/_/g, ' ')
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <span className="text-xs font-medium capitalize">{display}</span>
    </span>
  )
}
