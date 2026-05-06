/**
 * Cycle 3-D — cron helpers for the schedule engine.
 *
 * The user never sees or types a cron expression. The schedule UI collects
 * structured fields (`scheduleType`, `intervalValue`, `timeOfDay`,
 * `weekdays`); the server compiles those into a 5-field cron string for
 * BullMQ's repeatable job runner. The reverse operation (cron → human
 * sentence) is what `describeCron` does for the UI.
 *
 * ISO weekday convention (matching `IntegrationSchedule.weekdays`):
 *   1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
 * Cron weekday convention:
 *   0=Sun, 1=Mon, ..., 6=Sat
 *
 * The mapping below converts ISO 7 → cron 0 explicitly.
 */

import { CronExpressionParser } from 'cron-parser'

export type ScheduleType =
  | 'interval_minutes'
  | 'interval_hours'
  | 'daily'
  | 'weekly'

export interface ScheduleInput {
  scheduleType: ScheduleType
  intervalValue?: number
  timeOfDay?: string // "HH:MM"
  weekdays?: number[] // ISO: 1=Mon, 7=Sun
}

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function parseTimeOfDay(value: string): { hour: number; minute: number } {
  const match = TIME_OF_DAY_RE.exec(value)
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid timeOfDay "${value}" — expected "HH:MM"`)
  }
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

// ISO 7 (Sun) → cron 0; everything else stays as-is.
function isoWeekdayToCron(iso: number): number {
  if (iso < 1 || iso > 7 || !Number.isInteger(iso)) {
    throw new Error(`Invalid weekday ${String(iso)} — expected 1..7 (ISO)`)
  }
  return iso === 7 ? 0 : iso
}

export function buildCronExpression(schedule: ScheduleInput): string {
  switch (schedule.scheduleType) {
    case 'interval_minutes': {
      const n = schedule.intervalValue
      if (!n || n < 1 || n > 59 || !Number.isInteger(n)) {
        throw new Error(
          `interval_minutes requires intervalValue in 1..59, got ${String(n)}`,
        )
      }
      return `*/${String(n)} * * * *`
    }
    case 'interval_hours': {
      const n = schedule.intervalValue
      if (!n || n < 1 || n > 23 || !Number.isInteger(n)) {
        throw new Error(
          `interval_hours requires intervalValue in 1..23, got ${String(n)}`,
        )
      }
      return `0 */${String(n)} * * *`
    }
    case 'daily': {
      if (!schedule.timeOfDay) {
        throw new Error('daily schedules require timeOfDay')
      }
      const { hour, minute } = parseTimeOfDay(schedule.timeOfDay)
      return `${String(minute)} ${String(hour)} * * *`
    }
    case 'weekly': {
      if (!schedule.timeOfDay) {
        throw new Error('weekly schedules require timeOfDay')
      }
      if (!schedule.weekdays || schedule.weekdays.length === 0) {
        throw new Error('weekly schedules require at least one weekday')
      }
      const { hour, minute } = parseTimeOfDay(schedule.timeOfDay)
      const cronDays = [...new Set(schedule.weekdays.map(isoWeekdayToCron))].sort(
        (a, b) => a - b,
      )
      return `${String(minute)} ${String(hour)} * * ${cronDays.join(',')}`
    }
  }
}

// ---------------------------------------------------------------------------
// describeCron — human-readable rendering for the schedule UI
// ---------------------------------------------------------------------------

const DAY_NAMES_EN: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}
const DAY_NAMES_DE: Record<number, string> = {
  0: 'Sonntag',
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

interface Parts {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

function splitCron(cron: string): Parts | null {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ]
  return { minute, hour, dayOfMonth, month, dayOfWeek }
}

export function describeCron(cron: string, locale: 'en' | 'de' = 'en'): string {
  const parts = splitCron(cron)
  if (!parts) return cron

  // Interval-minutes: "*/N * * * *"
  const minMatch = /^\*\/(\d+)$/.exec(parts.minute)
  if (
    minMatch &&
    parts.hour === '*' &&
    parts.dayOfMonth === '*' &&
    parts.month === '*' &&
    parts.dayOfWeek === '*'
  ) {
    const n = Number(minMatch[1])
    return locale === 'de' ? `Alle ${String(n)} Minuten` : `Every ${String(n)} minutes`
  }

  // Interval-hours: "0 */N * * *"
  const hourMatch = /^\*\/(\d+)$/.exec(parts.hour)
  if (
    parts.minute === '0' &&
    hourMatch &&
    parts.dayOfMonth === '*' &&
    parts.month === '*' &&
    parts.dayOfWeek === '*'
  ) {
    const n = Number(hourMatch[1])
    return locale === 'de' ? `Alle ${String(n)} Stunden` : `Every ${String(n)} hours`
  }

  // Daily: "MM HH * * *"
  const dailyMin = Number(parts.minute)
  const dailyHour = Number(parts.hour)
  if (
    Number.isFinite(dailyMin) &&
    Number.isFinite(dailyHour) &&
    /^\d+$/.test(parts.minute) &&
    /^\d+$/.test(parts.hour) &&
    parts.dayOfMonth === '*' &&
    parts.month === '*' &&
    parts.dayOfWeek === '*'
  ) {
    const time = `${pad2(dailyHour)}:${pad2(dailyMin)}`
    return locale === 'de' ? `Täglich um ${time}` : `Daily at ${time}`
  }

  // Weekly: "MM HH * * D1,D2,..."
  if (
    /^\d+$/.test(parts.minute) &&
    /^\d+$/.test(parts.hour) &&
    parts.dayOfMonth === '*' &&
    parts.month === '*' &&
    /^\d+(,\d+)*$/.test(parts.dayOfWeek)
  ) {
    const min = Number(parts.minute)
    const hour = Number(parts.hour)
    const days = parts.dayOfWeek.split(',').map(Number)
    days.sort((a, b) => a - b)
    const names = (locale === 'de' ? DAY_NAMES_DE : DAY_NAMES_EN)
    const dayLabels = days.map((d) => names[d]).filter((s): s is string => Boolean(s))
    const time = `${pad2(hour)}:${pad2(min)}`
    if (locale === 'de') {
      return `${dayLabels.join(', ')} um ${time}`
    }
    return `${dayLabels.join(', ')} at ${time}`
  }

  // Fall through — return the raw cron rather than fabricate text.
  return cron
}

// ---------------------------------------------------------------------------
// nextRunTimes — used to populate `nextRunAt` on the schedule row and to
// preview upcoming runs in the API response.
// ---------------------------------------------------------------------------

export function nextRunTimes(
  cron: string,
  count = 1,
  timezone = 'Europe/Berlin',
): Date[] {
  const expression = CronExpressionParser.parse(cron, { tz: timezone })
  const out: Date[] = []
  for (let i = 0; i < count; i++) {
    out.push(expression.next().toDate())
  }
  return out
}
