'use client'

import { useLocale } from 'next-intl'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { StockMovementRow } from '@/lib/api/use-stock-movements'

interface StockMovementChartProps {
  movements: StockMovementRow[]
  emptyTitle: string
  emptyDescription: string
}

interface ChartPoint {
  timestamp: number
  quantity: number
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS

export function StockMovementChart({
  movements,
  emptyTitle,
  emptyDescription,
}: StockMovementChartProps): JSX.Element {
  const locale = useLocale()

  if (movements.length === 0) {
    return (
      <div className="rounded-md border border-border h-64 flex flex-col items-center justify-center text-center px-6">
        <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground mt-1">{emptyDescription}</p>
      </div>
    )
  }

  // Recharts plots in array order; the API may return desc, so sort asc here
  // to render time-left-to-right regardless of the request's sortDir.
  const points: ChartPoint[] = [...movements]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((m) => ({
      timestamp: new Date(m.createdAt).getTime(),
      quantity: m.quantity,
    }))

  const rangeMs =
    points.length > 1 ? points[points.length - 1].timestamp - points[0].timestamp : 0

  const dayMonth = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' })
  const hourMinute = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const tooltipFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  const formatTick = (value: number): string => {
    const date = new Date(value)
    if (rangeMs <= ONE_DAY_MS) {
      return hourMinute.format(date)
    }
    if (rangeMs <= SEVEN_DAYS_MS) {
      return `${dayMonth.format(date)} ${hourMinute.format(date)}`
    }
    return dayMonth.format(date)
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="stockMovementFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTick}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#e5e7eb"
              minTickGap={32}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#e5e7eb"
              allowDecimals={false}
            />
            <Tooltip
              labelFormatter={(value) => tooltipFormat.format(new Date(Number(value)))}
              contentStyle={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
              }}
            />
            <Area
              type="monotone"
              dataKey="quantity"
              stroke="#0d9488"
              strokeWidth={2}
              fill="url(#stockMovementFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
