import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase, friendlyError } from '@/lib/supabase'
import { localDay } from '@/lib/when'
import type { Tone } from '@/lib/tones'

/** Where a task stands: to do, waiting for the manager's approval, or approved. */
export type TaskStatus = 'open' | 'done' | 'approved'

/** How critical a task is — chosen by the person, changeable by their manager. */
export type Criticality = 'critical' | 'moderate' | 'non_critical'
export const CRIT_ORDER: Criticality[] = ['critical', 'moderate', 'non_critical']

export interface Task {
  id: string
  employee_id: string
  employee_name: string
  employee_ecode: string
  title: string
  details: string | null
  /** "2026-10-07" */
  due_on: string
  criticality: Criticality
  /** The first name of the manager who last changed how critical it is; null while it is the person's own choice. Once set, only the manager changes it (mt_0004). */
  criticality_set_by: string | null
  status: TaskStatus
  /** What they did to complete it — required when they mark it complete. */
  done_note: string | null
  done_at: string | null
  approved_at: string | null
  approved_by_name: string | null
  created_at: string
  updated_at: string
  reminders: number
  last_reminded_at: string | null
  comments: number
  sent_back: number
  /** Steps the other side took that this person has not opened yet. */
  unseen: number
  unseen_kinds: EventKind[] | null
}

export type EventKind = 'created' | 'edited' | 'criticality' | 'comment' | 'reminder' | 'done' | 'sent_back' | 'approved'

export interface TaskEvent {
  id: string
  kind: EventKind
  by_id: string | null
  by_name: string | null
  note: string | null
  at: string
  seen_at: string | null
}

export interface Me {
  manager_id: string | null
  manager_name: string | null
  manager_has_module: boolean
  /** How many people who report to this person keep tasks here. */
  team: number
}

export interface Person {
  id: string
  full_name: string
  ecode: string
  designation: string | null
  avatar: string | null
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

/** Days are "YYYY-MM-DD" throughout, worked out at midnight UTC so no clock shift can move one. */
const atUtc = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const dayOf = (d: Date): string => d.toISOString().slice(0, 10)

export const today = (): string => localDay()

export function addDays(day: string, n: number): string {
  const d = atUtc(day)
  d.setUTCDate(d.getUTCDate() + n)
  return dayOf(d)
}

/** Whole days from a to b: 1 when b is the day after a. */
export const daysBetween = (a: string, b: string): number =>
  Math.round((atUtc(b).getTime() - atUtc(a).getTime()) / 86_400_000)

/** "2026-10" */
export const monthOf = (day: string): string => day.slice(0, 7)

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  return dayOf(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7)
}

/** The month as the calendar shows it: whole weeks, Sunday first, as calendars in India are. */
export function monthGrid(month: string): string[] {
  const first = atUtc(`${month}-01`)
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0))
  const start = addDays(`${month}-01`, -first.getUTCDay())
  const end = addDays(dayOf(last), 6 - last.getUTCDay())
  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

const fmt = (day: string, o: Intl.DateTimeFormatOptions) => atUtc(day).toLocaleDateString(undefined, { ...o, timeZone: 'UTC' })

/** "October 2026" */
export const monthTitle = (month: string): string => fmt(`${month}-01`, { month: 'long', year: 'numeric' })

/** "8 Oct", with the year only when it is not this year's. */
export const shortDay = (day: string): string =>
  fmt(day, { day: 'numeric', month: 'short', ...(day.slice(0, 4) !== today().slice(0, 4) ? { year: 'numeric' } : {}) })

/** "Today", "Tomorrow", "Yesterday", else "Wednesday, 8 Oct". */
export function dayTitle(day: string, now = today()): string {
  const gap = daysBetween(now, day)
  if (gap === 0) return 'Today'
  if (gap === 1) return 'Tomorrow'
  if (gap === -1) return 'Yesterday'
  return `${fmt(day, { weekday: 'long' })}, ${shortDay(day)}`
}

/** "today", "tomorrow", else "Wednesday, 8 Oct" — to sit inside a sentence. */
export function dayInSentence(day: string, now = today()): string {
  const t = dayTitle(day, now)
  return ['Today', 'Tomorrow', 'Yesterday'].includes(t) ? t.toLowerCase() : t
}

/* ------------------------------------------------------------------ */
/* How a task looks                                                    */
/* ------------------------------------------------------------------ */

/** What the person sees a task as: to do, overdue, waiting for approval, or approved. */
export type Look = 'todo' | 'overdue' | 'waiting' | 'approved'

export function lookOf(t: Pick<Task, 'status' | 'due_on'>, now = today()): Look {
  if (t.status === 'approved') return 'approved'
  if (t.status === 'done') return 'waiting'
  return t.due_on < now ? 'overdue' : 'todo'
}

export const LOOK_TONE: Record<Look, Tone> = { todo: 'sky', overdue: 'red', waiting: 'amber', approved: 'green' }
export const LOOK_ORDER: Look[] = ['overdue', 'todo', 'waiting', 'approved']

/** The calendar's dot for each look: literal classes, so Tailwind keeps them. */
export const LOOK_DOT: Record<Look, string> = {
  todo: 'bg-sky-500',
  overdue: 'bg-cyrixRed-600',
  waiting: 'bg-amber-500',
  approved: 'bg-green-600',
}

/** Days a task is past its due date: still to do today, or when it was marked complete. */
export function daysLate(t: Pick<Task, 'status' | 'due_on' | 'done_at'>, now = today()): number {
  const until = t.status === 'open' ? now : t.done_at ? localDay(t.done_at) : now
  return Math.max(0, daysBetween(t.due_on, until))
}

/** "Kevin" from "Kevin R" — how a one-person screen names somebody. */
export const firstName = (full: string | null | undefined): string => (full ?? '').trim().split(/\s+/)[0] ?? ''

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(friendlyError(error))
  return data as T
}

export function useMe() {
  return useQuery({
    queryKey: ['tasks', 'me'],
    queryFn: () => call<Me | null>('task_me'),
  })
}

export interface Range { from: string; to: string }

/**
 * Tasks: mine, one person's, or (team) everyone's who reports to me. Every
 * task still to do or waiting is there whatever its date; approved ones only
 * when due in the range — the weeks the calendar shows.
 */
export function useTasks(range: Range, who: { employeeId?: string; team?: boolean } = {}, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['tasks', 'list', range.from, range.to, who.employeeId ?? null, !!who.team],
    queryFn: () => call<Task[]>('task_list', {
      p_from: range.from, p_to: range.to, p_employee_id: who.employeeId ?? null, p_team: !!who.team,
    }),
    // Turning a month keeps the last one on screen until the next arrives.
    placeholderData: keepPreviousData,
  })
}

export function usePeople(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['tasks', 'people'],
    queryFn: () => call<Person[]>('task_people'),
  })
}

export function useHistory(taskId: string | null) {
  return useQuery({
    enabled: !!taskId,
    queryKey: ['tasks', 'history', taskId],
    queryFn: () => call<TaskEvent[]>('task_history', { p_task_id: taskId }),
  })
}

/* ------------------------------------------------------------------ */
/* Doing                                                               */
/* ------------------------------------------------------------------ */

export type Action =
  | { fn: 'task_add'; args: { p_title: string; p_details: string; p_due_on: string; p_criticality: Criticality } }
  | { fn: 'task_edit'; args: { p_task_id: string; p_title: string; p_details: string; p_due_on: string } }
  | { fn: 'task_set_criticality'; args: { p_task_id: string; p_criticality: Criticality } }
  | { fn: 'task_done'; args: { p_task_id: string; p_note: string } }
  | { fn: 'task_comment'; args: { p_task_id: string; p_note: string } }
  | { fn: 'task_remind'; args: { p_task_id: string; p_note: string | null } }
  | { fn: 'task_approve'; args: { p_task_id: string; p_note: string | null } }
  | { fn: 'task_send_back'; args: { p_task_id: string; p_note: string } }
  | { fn: 'task_delete'; args: { p_task_id: string } }
  | { fn: 'task_seen'; args: { p_task_id: string } }

/** Every change goes through one of the database's task functions, and then everything shown is read again. */
export function useTaskAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Action) => call<unknown>(a.fn, a.args),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
