'use client'

import { useTranslations, useLocale } from 'next-intl'
import { useEffect } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ScheduleType } from '@/lib/api/use-schedules'
import { cn } from '@/lib/utils'

export interface ScheduleBuilderValue {
  scheduleType: ScheduleType
  intervalValue?: number
  timeOfDay?: string
  weekdays?: number[]
  timezone?: string
}

interface ScheduleBuilderProps {
  value: ScheduleBuilderValue
  onChange: (next: ScheduleBuilderValue) => void
}

// ISO weekday numbering: 1=Mon … 7=Sun. The schedule API uses ISO; we render
// labels in locale order (Mon-first).
const WEEKDAY_LABELS_EN: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}
const WEEKDAY_LABELS_DE: Record<number, string> = {
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
  7: 'So',
}

const WEEKDAY_LABELS_LONG_EN: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
}
const WEEKDAY_LABELS_LONG_DE: Record<number, string> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  7: 'Sonntag',
}

const INTERVAL_PRESETS: Array<{ minutes: number; label: string }> = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 120, label: '2 h' },
  { minutes: 240, label: '4 h' },
]

export function ScheduleBuilder({ value, onChange }: ScheduleBuilderProps): JSX.Element {
  const t = useTranslations('integrations.sftp.scheduleBuilder')
  const locale = useLocale()
  const dayShort = locale === 'de' ? WEEKDAY_LABELS_DE : WEEKDAY_LABELS_EN

  // Default missing fields per schedule type so the previewed sentence is
  // never built from undefined intermediate state.
  useEffect(() => {
    if (value.scheduleType === 'interval_minutes' && value.intervalValue === undefined) {
      onChange({ ...value, intervalValue: 30 })
    }
    if (value.scheduleType === 'interval_hours' && value.intervalValue === undefined) {
      onChange({ ...value, intervalValue: 1 })
    }
    if (
      (value.scheduleType === 'daily' || value.scheduleType === 'weekly') &&
      !value.timeOfDay
    ) {
      onChange({ ...value, timeOfDay: '06:00' })
    }
    if (
      value.scheduleType === 'weekly' &&
      (!value.weekdays || value.weekdays.length === 0)
    ) {
      onChange({ ...value, weekdays: [1] })
    }
    // We deliberately depend only on scheduleType — running on every value
    // change would loop because the defaults we set are themselves new values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.scheduleType])

  function setType(next: ScheduleType): void {
    onChange({ ...value, scheduleType: next })
  }

  function setInterval(n: number): void {
    // The backend's `intervalValue` schema caps at 59 (Codex review).
    // Convert preset minutes >= 60 into hours so the request validates.
    if (value.scheduleType === 'interval_minutes' && n >= 60) {
      onChange({
        ...value,
        scheduleType: 'interval_hours',
        intervalValue: Math.floor(n / 60),
      })
      return
    }
    onChange({ ...value, intervalValue: n })
  }

  function toggleWeekday(day: number): void {
    const current = new Set(value.weekdays ?? [])
    if (current.has(day)) {
      current.delete(day)
    } else {
      current.add(day)
    }
    const next = Array.from(current).sort((a, b) => a - b)
    // Prevent zero-day weekly state — backend validation rejects it.
    onChange({ ...value, weekdays: next.length === 0 ? [1] : next })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-2 block">{t('typeLabel')}</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              ['interval_minutes', t('typeIntervalMinutes')],
              ['interval_hours', t('typeIntervalHours')],
              ['daily', t('typeDaily')],
              ['weekly', t('typeWeekly')],
            ] as Array<[ScheduleType, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setType(key)
              }}
              className={cn(
                'rounded-md border px-3 py-2 text-xs font-medium text-left transition-colors',
                value.scheduleType === key
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(value.scheduleType === 'interval_minutes' ||
        value.scheduleType === 'interval_hours') && (
        <div className="space-y-2">
          <Label htmlFor="schedule-interval" className="mb-1 block">
            {value.scheduleType === 'interval_minutes'
              ? t('intervalMinutesLabel')
              : t('intervalHoursLabel')}
          </Label>
          <div className="flex gap-2 items-center">
            <Input
              id="schedule-interval"
              type="number"
              min={1}
              max={value.scheduleType === 'interval_hours' ? 23 : 59}
              value={value.intervalValue ?? ''}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10)
                if (Number.isFinite(n)) onChange({ ...value, intervalValue: n })
              }}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">
              {value.scheduleType === 'interval_minutes' ? t('unitMinutes') : t('unitHours')}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {INTERVAL_PRESETS.map((p) => (
              <button
                key={p.minutes}
                type="button"
                onClick={() => {
                  setInterval(p.minutes)
                }}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(value.scheduleType === 'daily' || value.scheduleType === 'weekly') && (
        <div className="space-y-2">
          <Label htmlFor="schedule-time" className="mb-1 block">
            {t('timeOfDayLabel')}
          </Label>
          <Input
            id="schedule-time"
            type="time"
            value={value.timeOfDay ?? ''}
            onChange={(e) => {
              onChange({ ...value, timeOfDay: e.target.value })
            }}
            className="w-32"
          />
        </div>
      )}

      {value.scheduleType === 'weekly' && (
        <div className="space-y-2">
          <Label className="mb-1 block">{t('weekdaysLabel')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const active = (value.weekdays ?? []).includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    toggleWeekday(day)
                  }}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {dayShort[day]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-md bg-muted/40 px-3 py-2">
        <p className="text-xs text-muted-foreground">{t('previewLabel')}</p>
        <p className="text-sm font-medium text-foreground mt-0.5">
          {previewSentence(value, locale, t)}
        </p>
      </div>
    </div>
  )
}

function previewSentence(
  value: ScheduleBuilderValue,
  locale: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const longDay = locale === 'de' ? WEEKDAY_LABELS_LONG_DE : WEEKDAY_LABELS_LONG_EN
  switch (value.scheduleType) {
    case 'interval_minutes':
      if (!value.intervalValue) return t('previewIncomplete')
      return t('previewIntervalMinutes', { n: value.intervalValue })
    case 'interval_hours':
      if (!value.intervalValue) return t('previewIncomplete')
      return t('previewIntervalHours', { n: value.intervalValue })
    case 'daily':
      if (!value.timeOfDay) return t('previewIncomplete')
      return t('previewDaily', { time: value.timeOfDay })
    case 'weekly': {
      if (!value.timeOfDay || !value.weekdays || value.weekdays.length === 0) {
        return t('previewIncomplete')
      }
      const days = value.weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => longDay[d])
        .join(', ')
      return t('previewWeekly', { days, time: value.timeOfDay })
    }
    default:
      return t('previewIncomplete')
  }
}
