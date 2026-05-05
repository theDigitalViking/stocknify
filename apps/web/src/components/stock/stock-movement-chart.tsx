'use client'

import { useLocale } from 'next-intl'
import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { StockMovementRow } from '@/lib/api/use-stock-movements'

export interface StockMovementSeries {
  key: string
  name: string
  rows: StockMovementRow[]
}

type StockMovementChartProps =
  | {
      movements: StockMovementRow[]
      emptyTitle: string
      emptyDescription: string
      // Total span of the user-selected date range in ms. Drives tick
      // granularity so a 30d preset that happens to contain only same-day
      // data still shows DD.MM. on the X-axis instead of collapsing to HH:mm.
      selectedRangeMs?: number
      series?: never
    }
  | {
      series: StockMovementSeries[]
      emptyTitle: string
      emptyDescription: string
      selectedRangeMs?: number
      movements?: never
    }

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS

// 8 distinct hues from Tailwind's 500 ramp. Cycle if we get more series than
// colors — pairing each with its own dasharray below keeps the legend usable
// for colorblind operators.
const PALETTE = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#64748b', // slate-500
] as const

const DASH_PATTERNS = [
  '0',
  '6 3',
  '2 3',
  '8 2 2 2',
  '10 4',
  '1 3',
  '4 2 1 2',
  '5 5',
] as const

function pickStyle(idx: number): { stroke: string; dasharray: string } {
  return {
    stroke: PALETTE[idx % PALETTE.length],
    dasharray: DASH_PATTERNS[idx % DASH_PATTERNS.length],
  }
}

const SINGLE_SERIES_COLOR = '#0d9488' // teal-600 — preserves the original look

export function StockMovementChart(props: StockMovementChartProps): JSX.Element {
  const locale = useLocale()
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  const isMulti = 'series' in props && props.series !== undefined

  const { mergedPoints, seriesMeta, hasAnyData } = useMemo(() => {
    if (isMulti) {
      const allRows: { row: StockMovementRow; seriesKey: string }[] = []
      const meta = props.series.map((s, idx) => {
        for (const row of s.rows) allRows.push({ row, seriesKey: s.key })
        const style = pickStyle(idx)
        return { key: s.key, name: s.name, ...style }
      })
      const points = allRows
        .sort(
          (a, b) =>
            new Date(a.row.createdAt).getTime() - new Date(b.row.createdAt).getTime(),
        )
        .map(({ row, seriesKey }) => ({
          timestamp: new Date(row.createdAt).getTime(),
          [seriesKey]: row.quantity,
        }))
      return {
        mergedPoints: points,
        seriesMeta: meta,
        hasAnyData: allRows.length > 0,
      }
    }

    const points = [...props.movements]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((m) => ({
        timestamp: new Date(m.createdAt).getTime(),
        quantity: m.quantity,
      }))
    return {
      mergedPoints: points,
      seriesMeta: [
        {
          key: 'quantity',
          name: 'quantity',
          stroke: SINGLE_SERIES_COLOR,
          dasharray: '0',
        },
      ],
      hasAnyData: points.length > 0,
    }
  }, [isMulti, props])

  if (!hasAnyData) {
    return (
      <div className="rounded-md border border-border h-64 flex flex-col items-center justify-center text-center px-6">
        <p className="text-sm font-medium text-foreground">{props.emptyTitle}</p>
        <p className="text-xs text-muted-foreground mt-1">{props.emptyDescription}</p>
      </div>
    )
  }

  // Prefer the user-selected range when available — same-day data within a
  // 30d preset still belongs in DD.MM. territory. Fall back to the data
  // spread for callers that don't know their window upfront.
  const dataRangeMs =
    mergedPoints.length > 1
      ? mergedPoints[mergedPoints.length - 1].timestamp - mergedPoints[0].timestamp
      : 0
  const rangeMs = props.selectedRangeMs ?? dataRangeMs

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

  const handleLegendClick = (data: { dataKey?: unknown }): void => {
    const key = typeof data.dataKey === 'string' ? data.dataKey : undefined
    if (!key) return
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="rounded-md border border-border p-4">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mergedPoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            {!isMulti && (
              <defs>
                <linearGradient id="stockMovementFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SINGLE_SERIES_COLOR} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={SINGLE_SERIES_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
            )}
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
              formatter={(value, name) => {
                const meta = seriesMeta.find((s) => s.key === name)
                return [value, meta?.name ?? name]
              }}
              contentStyle={{
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
              }}
            />
            {isMulti && (
              <Legend
                onClick={handleLegendClick}
                wrapperStyle={{ fontSize: '0.75rem', cursor: 'pointer' }}
                formatter={(value) => {
                  const meta = seriesMeta.find((s) => s.key === value)
                  const label = meta?.name ?? value
                  const isHidden = hidden.has(String(value))
                  return (
                    <span
                      style={{
                        color: isHidden ? '#9ca3af' : '#374151',
                        textDecoration: isHidden ? 'line-through' : 'none',
                      }}
                    >
                      {label}
                    </span>
                  )
                }}
              />
            )}
            {seriesMeta.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.key}
                stroke={s.stroke}
                strokeWidth={2}
                strokeDasharray={s.dasharray}
                fill={isMulti ? 'transparent' : 'url(#stockMovementFill)'}
                hide={hidden.has(s.key)}
                connectNulls
                isAnimationActive={false}
                dot={isMulti ? { r: 2 } : false}
                activeDot={{ r: 4 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
