import { useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { BellRing, CalendarPlus, ListChecks } from 'lucide-react'
import Calendar from '@/components/Calendar'
import TaskRow, { type Opening } from '@/components/TaskRow'
import TaskDialog from '@/components/TaskDialog'
import IconChip from '@/components/IconChip'
import { AddTask } from '@/components/TaskForm'
import { Alert, ChartLoader, EmptyState } from '@/components/ui'
import {
  CRIT_ORDER, LOOK_DOT, LOOK_ORDER, dayInSentence, dayTitle, firstName, lookOf, monthGrid, monthOf, monthTitle, today, useMe, useTasks,
  type Look, type Person, type Task,
} from '@/lib/tasks'

/**
 * The list beside the calendar: every task (the default — the user, 5 Oct:
 * "add total task so default tab should the that"), one day's tasks, or
 * every task of one kind.
 */
type View = 'all' | 'day' | Look

/** Whose tasks: mine, or — as their manager — my team's, everyone's or one person's. */
export type Whose = { team: false } | { team: true; person: Person | null }

const byCrit = (a: Task, b: Task) => CRIT_ORDER.indexOf(a.criticality) - CRIT_ORDER.indexOf(b.criticality)
const byLook = (now: string) => (a: Task, b: Task) =>
  LOOK_ORDER.indexOf(lookOf(a, now)) - LOOK_ORDER.indexOf(lookOf(b, now)) || byCrit(a, b) || a.created_at.localeCompare(b.created_at)
const byDue = (a: Task, b: Task) => a.due_on.localeCompare(b.due_on) || byCrit(a, b) || a.created_at.localeCompare(b.created_at)
/** Overdue first, then to do, waiting and approved; within each, the soonest due and the most critical first. */
const byLookThenDue = (now: string) => (a: Task, b: Task) =>
  LOOK_ORDER.indexOf(lookOf(a, now)) - LOOK_ORDER.indexOf(lookOf(b, now)) || byDue(a, b)

/**
 * A month of tasks beside a list of them.
 *
 * Mine, or my team's seen as their manager: the same board, with each task
 * saying who entered it, the manager's actions on it, and no Add task (a
 * person keeps their own list). It opens on every task, overdue first;
 * pressing a day on the calendar shows that day's.
 */
export default function TaskBoard({ whose, heading }: { whose: Whose; heading: ReactNode }) {
  const manage = whose.team
  const person = whose.team ? whose.person : null
  const now = today()
  const { data: me } = useMe()
  const [month, setMonth] = useState(monthOf(now))
  const [day, setDay] = useState(now)
  const [view, setView] = useState<View>('all')
  const [open, setOpen] = useState<{ id: string; opening: Opening } | null>(null)
  const [adding, setAdding] = useState(false)

  const grid = monthGrid(month)
  const { data, isLoading, error } = useTasks(
    { from: grid[0], to: grid[grid.length - 1] },
    !manage ? {} : person ? { employeeId: person.id } : { team: true },
  )
  const tasks = useMemo(() => data ?? [], [data])
  // Who the other side is, in a word: my manager on my own tasks; the person, or "your team", on theirs.
  const other = !manage ? firstName(me?.manager_name) || 'your manager' : person ? firstName(person.full_name) : 'your team'

  const { looks, counts, tally } = useMemo(() => {
    const looks = new Map<string, Set<Look>>()
    const counts = new Map<string, number>()
    const tally: Record<Exclude<View, 'day'>, number> = { all: 0, overdue: 0, todo: 0, waiting: 0, approved: 0 }
    for (const t of tasks) {
      const l = lookOf(t, now)
      if (l !== 'approved' || monthOf(t.due_on) === month) { tally[l]++; tally.all++ }
      if (!looks.has(t.due_on)) looks.set(t.due_on, new Set())
      looks.get(t.due_on)!.add(l)
      counts.set(t.due_on, (counts.get(t.due_on) ?? 0) + 1)
    }
    return { looks, counts, tally }
  }, [tasks, now, month])

  const overdue = tasks.filter(t => lookOf(t, now) === 'overdue').sort(byDue)
  const list: Task[] = view === 'all'
    ? tasks.filter(t => t.status !== 'approved' || monthOf(t.due_on) === month).sort(byLookThenDue(now))
    : view === 'day'
      ? tasks.filter(t => t.due_on === day).sort(byLook(now))
      : view === 'approved'
        ? tasks.filter(t => t.status === 'approved' && monthOf(t.due_on) === month).sort(byDue)
        : view === 'waiting'
          ? tasks.filter(t => t.status === 'done').sort((a, b) => (a.done_at ?? '').localeCompare(b.done_at ?? ''))
          : tasks.filter(t => lookOf(t, now) === view).sort(byDue)
  const fresh = tasks.filter(t => t.unseen > 0).sort(byDue)
  const openTask = open ? tasks.find(t => t.id === open.id) ?? null : null

  const pick = (d: string) => { setDay(d); setView('day'); if (monthOf(d) !== month) setMonth(monthOf(d)) }
  const onOpen = (t: Task, opening: Opening = 'view') => setOpen({ id: t.id, opening })
  const row = (t: Task, showDue: boolean) => (
    <TaskRow key={t.id} task={t} manage={manage} now={now} showDue={showDue} showOwner={manage} managerName={me?.manager_name} onOpen={onOpen} />
  )

  const monthName = monthTitle(month).split(' ')[0]
  const PILLS: Array<[Exclude<View, 'day'>, string, string]> = [
    ['all', 'Total tasks', 'bg-ink-900'],
    ['overdue', 'Overdue', LOOK_DOT.overdue],
    ['todo', 'To do', LOOK_DOT.todo],
    ['waiting', 'Waiting for approval', LOOK_DOT.waiting],
    ['approved', `Approved in ${monthName}`, LOOK_DOT.approved],
  ]
  const EMPTY: Record<Exclude<View, 'day'>, string> = {
    all: 'No tasks yet.', overdue: 'Nothing overdue.', todo: 'Nothing to do.', waiting: 'Nothing waiting for approval.', approved: `Nothing approved in ${monthName}.`,
  }
  const whom = manage ? (person ? ` for ${firstName(person.full_name)}` : ' for your team') : ''
  const plural = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {heading}
        {!manage && (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            <CalendarPlus className="h-4 w-4" /> Add task
          </button>
        )}
      </div>

      {fresh.length > 0 && (
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-4" aria-label={`New from ${other}`}>
          <div className="flex items-center gap-2.5">
            <IconChip icon={BellRing} tone="violet" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-violet-900">New from {other}</h2>
              <p className="text-xs text-violet-800">Open a task to read it; it is no longer new once opened.</p>
            </div>
          </div>
          <ul className="mt-3 space-y-2">{fresh.map(t => row(t, true))}</ul>
        </section>
      )}

      <div className="nav-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Show tasks that are">
        {PILLS.map(([v, word, dot]) => {
          const on = view === v
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              // Pressing the one already shown goes back to every task.
              onClick={() => setView(on ? 'all' : v)}
              className={clsx(
                'btn-press flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium',
                on ? 'border-ink-900 bg-ink-900 text-onInk' : 'border-ink-200 bg-surface text-ink-700 hover:bg-ink-50',
              )}
            >
              {v === 'all'
                ? <ListChecks className={clsx('h-4 w-4', on ? 'text-onInk' : 'text-ink-500')} aria-hidden />
                : <span className={clsx('h-2 w-2 rounded-full', dot)} aria-hidden />}
              {word}
              <span className={clsx('tabular-nums', on ? 'text-onInk/80' : v === 'overdue' && tally[v] > 0 ? 'font-semibold text-cyrixRed-600' : 'text-ink-400')}>{tally[v]}</span>
            </button>
          )
        })}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-6">
        <div className="lg:sticky lg:top-20">
          <Calendar
            month={month}
            onMonth={setMonth}
            selected={view === 'day' ? day : null}
            onSelect={pick}
            looks={looks}
            counts={counts}
            now={now}
          />
        </div>

        <section className="min-w-0 space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">
              {view === 'day' ? dayTitle(day, now) : PILLS.find(([v]) => v === view)![1]}
            </h2>
            <p className="text-sm text-ink-500">
              {view === 'day'
                ? new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
                : view === 'all'
                  ? `${plural(list.length)}${whom} — everything to do or waiting, and what was approved in ${monthName}`
                  : `${plural(list.length)}${whom}${view === 'approved' ? '' : ', whatever the month'}`}
            </p>
          </div>

          {error && <Alert kind="error">{(error as Error).message}</Alert>}
          {isLoading && !data && <div className="card grid place-items-center p-10"><ChartLoader /></div>}

          {data && view === 'day' && day === now && overdue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-label text-cyrixRed-600">Overdue · {overdue.length}</p>
              <ul className="space-y-2">{overdue.map(t => row(t, true))}</ul>
              <p className="pt-2 text-xs font-semibold uppercase tracking-label text-ink-500">Due today · {list.length}</p>
            </div>
          )}

          {data && list.length > 0 && <ul className="space-y-2">{list.map(t => row(t, view !== 'day'))}</ul>}

          {data && list.length === 0 && (
            <EmptyState
              icon={ListChecks}
              title={view !== 'day'
                ? EMPTY[view]
                : day < now
                  ? `Nothing was due${whom} ${dayInSentence(day, now)}.`
                  : `Nothing due${whom} ${dayInSentence(day, now)}.`}
            >
              {!manage && (view === 'all' || (view === 'day' && day >= now)) && (
                <button type="button" className="btn-secondary mt-1" onClick={() => setAdding(true)}>
                  <CalendarPlus className="h-4 w-4" /> {view === 'all' ? 'Add a task' : `Add a task for ${dayInSentence(day, now)}`}
                </button>
              )}
            </EmptyState>
          )}
        </section>
      </div>

      {adding && (
        <AddTask
          due={view === 'day' ? day : now}
          onClose={() => setAdding(false)}
          // On the day's list, go to the day the task is for; on every task, it simply joins the list.
          onAdded={d => { if (view === 'day') pick(d) }}
        />
      )}
      {open && openTask && (
        <TaskDialog key={open.id} task={openTask} manage={manage} me={me} opening={open.opening} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
