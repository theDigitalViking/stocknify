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
      // Retained for backwards-compatibility with prior callers; the chart
      // now derives tick granularity from same-day duplicates in the data,
      // so this value is no longer consulted. Will be removed in a future
      // cleanup once no caller passes it.
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

// Faded series stay rendered (so the operator still sees the trend) but at
// low opacity, both on the line and in the tooltip swatch/text.
const FADED_OPACITY = 0.2
const FADED_TOOLTIP_OPACITY = 0.45

function pickStyle(idx: number): { stroke: string; dasharray: string } {
  return {
    stroke: PALETTE[idx % PALETTE.length],
    dasharray: DASH_PATTERNS[idx % DASH_PATTERNS.length],
  }
}

const SINGLE_SERIES_COLOR = '#0d9488' // teal-600 — preserves the original look

export function StockMovementChart(props: StockMovementChartProps): JSX.Element {
  const locale = useLocale()
  const [faded, setFaded] = useState<Set<string>>(() => new Set())

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

  // X-axis always shows the date. We additionally show HH:mm only when the
  // visible data has multiple entries on the same calendar day — otherwise
  // the time component carries no useful signal and just crowds the axis.
  // The decision is global to the chart, not per-tick, so the format pattern
  // stays consistent whether we're looking at a 7d preset with one daily
  // sync or a custom 24h window with hourly corrections.
  const hasMultipleSameDay = (() => {
    const seen = new Set<string>()
    for (const p of mergedPoints) {
      const d = new Date(p.timestamp)
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (seen.has(dayKey)) return true
      seen.add(dayKey)
    }
    return false
  })()

  const dayMonth = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' })
  const hourMinute = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
  const tooltipFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  const formatTick = (value: number): string => {
    const date = new Date(value)
    if (hasMultipleSameDay) {
      return `${dayMonth.format(date)} ${hourMinute.format(date)}`
    }
    return dayMonth.format(date)
  }
  // Wider gap when ticks carry both date and time so the longer labels don't
  // overlap on dense ranges; tighter gap with date-only ticks keeps the axis
  // readable on long preset windows.
  const tickMinGap = hasMultipleSameDay ? 64 : 32

  const handleLegendClick = (data: { dataKey?: unknown }): void => {
    const key = typeof data.dataKey === 'string' ? data.dataKey : undefined
    if (!key) return
    setFaded((prev) => {
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
              minTickGap={tickMinGap}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#e5e7eb"
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                return (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.375rem',
                      padding: '0.375rem 0.625rem',
                      fontSize: '0.75rem',
                      lineHeight: 1.4,
                      color: '#374151',
                    }}
                  >
                    <div style={{ marginBottom: 4, color: '#6b7280' }}>
                      {tooltipFormat.format(new Date(Number(label)))}
                    </div>
                    {payload.map((entry) => {
                      const key = String(entry.dataKey)
                      const meta = seriesMeta.find((s) => s.key === key)
                      const isFaded = isMulti && faded.has(key)
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            opacity: isFaded ? FADED_TOOLTIP_OPACITY : 1,
                          }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '999px',
                              background: meta?.stroke ?? entry.color ?? '#9ca3af',
                            }}
                          />
                          <span style={{ color: isFaded ? '#9ca3af' : '#374151' }}>
                            {meta?.name ?? key}:
                          </span>
                          <span style={{ fontWeight: 500 }}>{String(entry.value)}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              }}
            />
            {isMulti && (
              <Legend
                onClick={handleLegendClick}
                wrapperStyle={{ fontSize: '0.75rem', cursor: 'pointer' }}
                formatter={(value) => {
                  const meta = seriesMeta.find((s) => s.key === value)
                  const label = meta?.name ?? value
                  const isFaded = faded.has(String(value))
                  return (
                    <span
                      style={{
                        color: isFaded ? '#9ca3af' : '#374151',
                        opacity: isFaded ? 0.6 : 1,
                      }}
                    >
                      {label}
                    </span>
                  )
                }}
              />
            )}
            {seriesMeta.map((s) => {
              const isFaded = isMulti && faded.has(s.key)
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.key}
                  stroke={s.stroke}
                  strokeWidth={2}
                  strokeDasharray={s.dasharray}
                  strokeOpacity={isFaded ? FADED_OPACITY : 1}
                  fill={isMulti ? 'transparent' : 'url(#stockMovementFill)'}
                  connectNulls
                  isAnimationActive={false}
                  dot={
                    isMulti
                      ? {
                          r: 2,
                          stroke: s.stroke,
                          fill: s.stroke,
                          fillOpacity: isFaded ? FADED_OPACITY : 1,
                          strokeOpacity: isFaded ? FADED_OPACITY : 1,
                        }
                      : false
                  }
                  activeDot={{ r: 4, opacity: isFaded ? FADED_TOOLTIP_OPACITY : 1 }}
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
