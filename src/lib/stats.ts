import { localDay } from '@/lib/when'
import { CRIT_ORDER, addMonths, lookOf, monthOf, type Criticality, type Task } from '@/lib/tasks'

/**
 * The dashboard's figures, worked out from the tasks themselves.
 *
 * A task belongs to the month it is due in, as it sits on the calendar, so
 * a month's total is its pending and its completed together. The period is
 * a calendar month — this one, the last — or all time, never a rolling
 * window.
 */

export type Period = 'this' | 'last' | 'all'

export const PERIOD_WORD: Record<Period, string> = { this: 'This month', last: 'Last month', all: 'All time' }

/** The first and last day of the period: "2026-10-01" to "2026-10-31". */
export function periodRange(p: Period, now: string): { from: string; to: string } {
  if (p === 'all') return { from: '2000-01-01', to: '2999-12-31' }
  const month = p === 'this' ? monthOf(now) : addMonths(monthOf(now), -1)
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export const inPeriod = (t: Task, r: { from: string; to: string }) => t.due_on >= r.from && t.due_on <= r.to

export interface Figures {
  total: number
  /** Not marked complete yet. */
  pending: number
  /** Pending, and past the due date. */
  overdue: number
  /** Marked complete: waiting for approval, or approved. */
  completed: number
  waiting: number
  approved: number
  /**
   * On average, from being added to being marked complete; null with nothing completed. Approval adds
   * nothing; a send-back or a reopening clears done_at, so the time runs on until it is completed again.
   */
  avgHours: number | null
  /** Completed on or before the due date. */
  onTime: number
}

export function figures(tasks: Task[], now: string): Figures {
  const f: Figures = { total: 0, pending: 0, overdue: 0, completed: 0, waiting: 0, approved: 0, avgHours: null, onTime: 0 }
  let hours = 0
  for (const t of tasks) {
    f.total++
    if (t.status === 'open') {
      f.pending++
      if (lookOf(t, now) === 'overdue') f.overdue++
      continue
    }
    f.completed++
    if (t.status === 'done') f.waiting++; else f.approved++
    if (t.done_at) {
      hours += Math.max(0, Date.parse(t.done_at) - Date.parse(t.created_at)) / 3_600_000
      if (localDay(t.done_at) <= t.due_on) f.onTime++
    }
  }
  if (f.completed > 0) f.avgHours = hours / f.completed
  return f
}

export function byCriticality(tasks: Task[], now: string): Array<[Criticality, Figures]> {
  return CRIT_ORDER.map(c => [c, figures(tasks.filter(t => t.criticality === c), now)])
}

export interface PersonFigures { id: string; name: string; ecode: string; f: Figures }

/** One row per person who has a task in the period, most pending first. */
export function byPerson(tasks: Task[], now: string): PersonFigures[] {
  const groups = new Map<string, Task[]>()
  for (const t of tasks) groups.set(t.employee_id, [...(groups.get(t.employee_id) ?? []), t])
  return [...groups.values()]
    .map(ts => ({ id: ts[0].employee_id, name: ts[0].employee_name, ecode: ts[0].employee_ecode, f: figures(ts, now) }))
    .sort((a, b) => b.f.pending - a.f.pending || b.f.overdue - a.f.overdue || a.name.localeCompare(b.name))
}

/** "45 min", "5 h", "1.5 days". */
export function tatWords(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 24) return `${Math.round(hours)} h`
  const days = hours / 24
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`
}

/** On time as a share of completed: green from 90%, amber from 70%, red below — as Revive Lab's TAT met. */
export function onTimeShare(f: Figures): { pct: number | null; tone: 'green' | 'amber' | 'red' | 'slate' } {
  if (f.completed === 0) return { pct: null, tone: 'slate' }
  const pct = Math.round((f.onTime / f.completed) * 100)
  return { pct, tone: pct >= 90 ? 'green' : pct >= 70 ? 'amber' : 'red' }
}
