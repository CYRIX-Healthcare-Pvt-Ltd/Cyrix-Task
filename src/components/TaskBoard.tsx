import { useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownUp, BellRing, CalendarPlus, ListChecks, Search, UserPlus, X } from 'lucide-react'
import DropPick from '@/components/DropPick'
import PeriodPick from '@/components/PeriodPick'
import TaskRow, { type Opening } from '@/components/TaskRow'
import TaskDialog from '@/components/TaskDialog'
import TaskTable from '@/components/TaskTable'
import IconChip from '@/components/IconChip'
import { AddTask } from '@/components/TaskForm'
import AssignTask from '@/components/AssignTask'
import { CRITICALITY, CritBars } from '@/components/Criticality'
import { Alert, ChartLoader, EmptyState } from '@/components/ui'
import {
  CRIT_ORDER, LOOK_DOT, LOOK_ORDER, addDays, dayInSentence, firstName, isScheduled, lookOf, monthOf, monthTitle,
  shortDay, today, useMe, usePeople, useTasks,
  type Criticality, type Person, type Range, type Task,
} from '@/lib/tasks'

/*
  The filters (the user, 24 Oct: "better pending and completed, and waiting for approval only, inside pending … stage
  wise marker"): Pending, Completed, Waiting for approval; inside Pending, a marker for each stage — overdue, not
  started, started, in progress, almost done — with how many, one press to show only those.
*/
type View = 'all' | 'pending' | 'approved' | 'waiting'
/** The days the board counts, after the search (the user, 24 Oct: "if I select this month so total, pending and rest should be based on that"). */
type Period = 'this' | 'all' | 'range'
/** Given by the manager, or added by the person (the user, 24 Oct: "self assigned will be also there … how to filter it?"). */
type Source = 'any' | 'assigned' | 'self'
const SOURCES: Array<[Source, string]> = [['assigned', 'Assigned'], ['self', 'Self-added'], ['any', 'All']]
/** How the list is ordered (the user, 18 Nov: "sort ie newest or oldest, newest completed"). */
type Sort = 'smart' | 'newest' | 'oldest' | 'due_soon' | 'due_late' | 'done_new' | 'done_old'
const SORT_WORD: Record<Sort, string> = {
  smart: 'Overdue first', newest: 'Newest added', oldest: 'Oldest added',
  due_soon: 'Earliest due', due_late: 'Latest due', done_new: 'Newest completed', done_old: 'Oldest completed',
}
/** The orders that mean something on each tab, the first its own (the user, 18 Nov: "on pending tab how newest completed?"). */
const SORTS_OF: Record<View, Sort[]> = {
  all: ['smart', 'newest', 'oldest', 'due_soon', 'due_late'],
  pending: ['smart', 'newest', 'oldest', 'due_soon', 'due_late'],
  approved: ['done_new', 'done_old', 'newest', 'oldest'],
  waiting: ['done_old', 'done_new', 'newest', 'oldest'],
}
const SORT_BY: Record<Exclude<Sort, 'smart'>, (a: Task, b: Task) => number> = {
  newest: (a, b) => b.created_at.localeCompare(a.created_at),
  oldest: (a, b) => a.created_at.localeCompare(b.created_at),
  due_soon: (a, b) => (a.due_on + (a.due_at ?? '24')).localeCompare(b.due_on + (b.due_at ?? '24')),
  due_late: (a, b) => (b.due_on + (b.due_at ?? '24')).localeCompare(a.due_on + (a.due_at ?? '24')),
  done_new: (a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '') || b.created_at.localeCompare(a.created_at),
  done_old: (a, b) => (a.done_at ?? '').localeCompare(b.done_at ?? '') || a.created_at.localeCompare(b.created_at),
}
type Stage = 'overdue' | 'notstarted' | 'started' | 'inprogress' | 'almost' | 'scheduled'
const STAGES: Array<[Stage, string, string]> = [
  ['overdue', 'Overdue', LOOK_DOT.overdue],
  ['notstarted', 'Not started', 'bg-ink-400'],
  ['started', 'Started', 'bg-sky-300'],
  ['inprogress', 'In progress', LOOK_DOT.todo],
  ['almost', 'Almost done', 'bg-indigo-500'],
  // Assigned for later: shown under Pending, counted in nothing until 9 AM on its day.
  ['scheduled', 'Scheduled', 'bg-violet-500'],
]

/** Whose tasks: mine, or — as their manager — my team's, everyone's or one person's. */
export type Whose = { team: false } | { team: true; person: Person | null }

/** A task still to do, by its stage; overdue whatever its progress. */
const stageOf = (t: Task, now: string): Stage => {
  if (isScheduled(t)) return 'scheduled'
  if (lookOf(t, now) === 'overdue') return 'overdue'
  const p = t.progress ?? 0
  return p >= 75 ? 'almost' : p >= 50 ? 'inprogress' : p >= 25 ? 'started' : 'notstarted'
}

const byCrit = (a: Task, b: Task) => CRIT_ORDER.indexOf(a.criticality) - CRIT_ORDER.indexOf(b.criticality)
const byDue = (a: Task, b: Task) => a.due_on.localeCompare(b.due_on) || byCrit(a, b) || a.created_at.localeCompare(b.created_at)
/** Overdue first, then to do, waiting and approved; within each, the soonest due and the most critical first. */
const byLookThenDue = (now: string) => (a: Task, b: Task) =>
  LOOK_ORDER.indexOf(lookOf(a, now)) - LOOK_ORDER.indexOf(lookOf(b, now)) || byDue(a, b)

/** The week the day is in, Sunday to Saturday. */
function weekOf(day: string): Range {
  const from = addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay())
  return { from, to: addDays(from, 6) }
}

/** Every task from the start: the board is not cut to a month. */
const ALL_TIME: Range = { from: '2000-01-01', to: '2999-12-31' }

/**
 * The tasks, the whole width (the user, 24 Oct: "why calendar here?" — the date is chosen where a task is added or
 * assigned). Mine, or my team's seen as their manager: each task saying whose it is, the manager's actions on it,
 * Assign task for the manager and Add task for the person. A search over name, description and person; the filters
 * by where each stands; From – To for the tasks due from one day to another (the user, 6 Oct).
 */
export default function TaskBoard({ whose, heading, picker }: { whose: Whose; heading: ReactNode; picker?: ReactNode }) {
  const manage = whose.team
  const person = whose.team ? whose.person : null
  const now = today()
  const { data: me } = useMe()
  // Opened from a dashboard tile (the user, 29 Oct): that tile's tab and the dashboard's period, from the address.
  const [params] = useSearchParams()
  const asked = params.get('view'), askedPeriod = params.get('period'), askedFrom = params.get('from'), askedTo = params.get('to')
  const [sort, setSort] = useState<Sort>('smart')
  const [view, setView] = useState<View>(() => (['all', 'pending', 'approved', 'waiting'].includes(asked ?? '') ? asked as View : 'all'))
  const [stage, setStage] = useState<Stage | null>(null)
  // All time first, so nothing overdue from an earlier month is out of sight.
  const [period, setPeriod] = useState<Period>(() => (['this', 'all', 'range'].includes(askedPeriod ?? '') ? askedPeriod as Period : 'all'))
  // A manager opens on the tasks given out, My Task on all (the user, 29 Oct); a dashboard tile opens on what it counted.
  const [source, setSource] = useState<Source>(() => {
    const s = params.get('source')
    return s === 'assigned' || s === 'self' || s === 'any' ? s : manage ? 'assigned' : 'any'
  })
  const [range, setRange] = useState<Range>(() => (askedFrom && askedTo ? { from: askedFrom, to: askedTo } : weekOf(now)))
  // How critical (the user, 20 Nov: "user needs criticality filter also"): every count follows it, like the search.
  const [crit, setCrit] = useState<Criticality | 'any'>('any')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<{ id: string; opening: Opening } | null>(null)
  const [adding, setAdding] = useState(false)
  // The manager gives a task to their people (mt_0007).
  const [assigning, setAssigning] = useState(false)
  const { data: people } = usePeople(manage)

  const who = !manage ? {} : person ? { employeeId: person.id } : { team: true }
  // Every task, whatever its month (the user, 24 Oct: "why month wise? not needed").
  const { data, isLoading, error } = useTasks(ALL_TIME, who)
  const tasks = useMemo(() => data ?? [], [data])
  // Who the other side is, in a word: my manager on my own tasks; the person, or "your team", on theirs.
  const other = !manage ? firstName(me?.manager_name) || 'your manager' : person ? firstName(person.full_name) : 'your team'

  // The days chosen, then the search over everything the task says and whose it is: what every count is of.
  const days: Range = period === 'all' ? ALL_TIME : period === 'range' ? range : { from: `${monthOf(now)}-01`, to: addDays(`${monthOf(addDays(`${monthOf(now)}-01`, 32))}-01`, -1) }
  const found = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tasks.filter(t => t.due_on >= days.from && t.due_on <= days.to
      && (source === 'any' || (source === 'assigned') === !!t.assigned_by_name)
      && (crit === 'any' || t.criticality === crit)
      && (!needle || [t.title, t.details, t.remarks, t.employee_name, t.employee_ecode, t.assigned_by_name, t.done_note]
        .some(v => (v ?? '').toLowerCase().includes(needle))))
  }, [tasks, q, days.from, days.to, source, crit])

  const { tally, stages } = useMemo(() => {
    const tally: Record<View, number> = { all: 0, pending: 0, approved: 0, waiting: 0 }
    const stages: Record<Stage, number> = { overdue: 0, notstarted: 0, started: 0, inprogress: 0, almost: 0, scheduled: 0 }
    for (const t of found) {
      if (isScheduled(t)) { stages.scheduled++; continue }
      tally.all++
      if (t.status === 'open') { tally.pending++; stages[stageOf(t, now)]++ } else if (t.status === 'done') tally.waiting++; else tally.approved++
    }
    return { tally, stages }
  }, [found, now])

  // Every criticality with how many of the days, source and search have (not narrowed by itself).
  const critOptions = useMemo(() => {
    const base = tasks.filter(t => t.due_on >= days.from && t.due_on <= days.to && !isScheduled(t)
      && (source === 'any' || (source === 'assigned') === !!t.assigned_by_name))
    return [
      { key: 'any' as const, word: 'All levels', count: base.length, mark: <CritBars value="critical" className="h-3.5 w-3.5 !text-ink-400" /> },
      ...CRITICALITY.map(c => ({ key: c.value, word: c.word, count: base.filter(t => t.criticality === c.value).length, mark: <CritBars value={c.value} className="h-3.5 w-3.5" /> })),
    ]
  }, [tasks, days.from, days.to, source])

  const listed: Task[] = view === 'all'
      ? found.filter(t => !isScheduled(t)).sort(byLookThenDue(now))
      : view === 'approved'
        ? found.filter(t => t.status === 'approved').sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
        : view === 'waiting'
          ? found.filter(t => t.status === 'done').sort((a, b) => (a.done_at ?? '').localeCompare(b.done_at ?? ''))
          // Pending, with the scheduled ones at the end.
          : found.filter(t => t.status === 'open' && (!stage || stageOf(t, now) === stage))
            .sort((a, b) => Number(isScheduled(a)) - Number(isScheduled(b)) || byLookThenDue(now)(a, b))
  // A tab's own order is the list as it comes; an order not offered on this tab falls back to it.
  const sortNow: Sort = SORTS_OF[view].includes(sort) ? sort : SORTS_OF[view][0]
  const list = sortNow === 'smart' ? listed : [...listed].sort(SORT_BY[sortNow])
  const fresh = tasks.filter(t => t.unseen > 0).sort(byDue)
  const openTask = open ? tasks.find(t => t.id === open.id) ?? null : null

  const onOpen = (t: Task, opening: Opening = 'view') => setOpen({ id: t.id, opening })
  const row = (t: Task, showDue: boolean) => (
    <TaskRow key={t.id} task={t} manage={manage} now={now} showDue={showDue} showOwner={manage} managerName={me?.manager_name} onOpen={onOpen} />
  )

  // In the order a task goes, waiting for approval last (the user, 24 Oct).
  const PILLS: Array<[View, string, string]> = [
    ['all', 'Total tasks', 'bg-ink-900'],
    ['pending', 'Pending', LOOK_DOT.todo],
    ['approved', 'Completed', LOOK_DOT.approved],
    ['waiting', 'Waiting for approval', LOOK_DOT.waiting],
  ]
  const stageWord = stage ? STAGES.find(([k]) => k === stage)![1] : ''
  const EMPTY: Record<View, string> = {
    all: 'No tasks yet.', pending: stage ? `Nothing ${stageWord.toLowerCase()}.` : 'Nothing pending.',
    waiting: 'Nothing waiting for approval.', approved: 'Nothing completed yet.',
  }
  const whom = manage ? (person ? ` for ${firstName(person.full_name)}` : ' for your team') : ''
  const plural = (n: number) => `${n} ${n === 1 ? 'task' : 'tasks'}`
  const when = period === 'all' ? '' : period === 'this' ? ` due in ${monthTitle(monthOf(now))}` : range.from === range.to ? ` due ${dayInSentence(range.from, now)}` : ` due from ${shortDay(range.from)} to ${shortDay(range.to)}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        {/* Whose tasks and Assign task side by side, on a phone too (the user, 20 Nov: "make it same row"). */}
        <div className={picker ? 'flex w-full items-center gap-2 sm:w-auto' : 'contents'}>
          {picker && <div className="min-w-0 flex-1 sm:w-72 sm:flex-none">{picker}</div>}
          {!manage && (
            <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
              <CalendarPlus className="h-4 w-4" /> Add task
            </button>
          )}
          {manage && (people?.length ?? 0) > 0 && (
            <button type="button" className="btn-primary shrink-0" onClick={() => setAssigning(true)}>
              <UserPlus className="h-4 w-4" /> Assign task
            </button>
          )}
        </div>
      </div>

      {/* Only on my own tasks: a manager of a hundred would get a wall of them (the user, 24 Oct); the table marks new ones with a dot. */}
      {!manage && fresh.length > 0 && (
        <section className="rounded-xl border border-violet-200 bg-violet-50 p-4" aria-label={`New from ${other}`}>
          <div className="flex items-center gap-2.5">
            <IconChip icon={BellRing} tone="violet" />
            <h2 className="text-sm font-semibold text-violet-900">New from {other}</h2>
          </div>
          <ul className="mt-3 space-y-2">{fresh.map(t => row(t, true))}</ul>
        </section>
      )}

      <div className="space-y-3">
        {/* One toolbar row on a computer: the search, the days, Assigned or self-added, and the order, all one height
            (the user, 18 Nov: "is there any better idea"); on a phone each the full width, then the drop-downs. */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative block min-w-0 lg:min-w-[8rem] lg:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input className="input !pl-9 !pr-9" value={q} onChange={e => setQ(e.target.value)} placeholder={manage ? 'Task, person or E-code' : 'Search your tasks'} aria-label="Search tasks" />
          {q && (
            <button type="button" onClick={() => setQ('')} className="btn-icon absolute right-1 top-1/2 -translate-y-1/2" aria-label="Clear the search"><X className="h-4 w-4" /></button>
          )}
        </label>
        <PeriodPick className="lg:shrink-0" period={period} onPeriod={setPeriod} range={range} onRange={setRange} />
        <div role="radiogroup" aria-label="Assigned or self-added" className="grid grid-cols-3 rounded-lg border border-ink-200 bg-surface p-0.5 lg:inline-grid lg:shrink-0">
          {SOURCES.map(([k, word]) => (
            <button key={k} type="button" role="radio" aria-checked={source === k} onClick={() => setSource(k)}
              className={clsx('btn-press whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium', source === k ? 'bg-ink-900 text-onInk' : 'text-ink-600 hover:bg-ink-50')}>
              {word}
            </button>
          ))}
        </div>
        <DropPick label="How critical" value={crit} onChange={setCrit} className="max-sm:hidden lg:w-36 lg:shrink-0" options={critOptions} />
        <DropPick label="Sort" value={sortNow} onChange={setSort} align="right" className="max-sm:hidden lg:w-40 lg:shrink-0"
          icon={<ArrowDownUp className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />}
          options={SORTS_OF[view].map(k => ({ key: k, word: SORT_WORD[k] }))} />
        </div>

        {/* On a phone the pills become a drop-down, with the order beside it (the user, 18 Nov); on a computer the order sits at the end of the pills. */}
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-2 sm:hidden">
          <DropPick label="Which tasks" value={view} onChange={v => { setView(v); setStage(null); setSort(SORTS_OF[v][0]) }}
            options={PILLS.map(([v, word, dot]) => ({
              key: v, word, count: tally[v],
              mark: v === 'all' ? <ListChecks className="h-4 w-4 shrink-0 text-ink-500" aria-hidden /> : <span className={clsx('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden />,
            }))} />
          <DropPick label="How critical" value={crit} onChange={setCrit} align="right" options={critOptions} />
          <DropPick label="Sort" value={sortNow} onChange={setSort} align="right" compact
            icon={<ArrowDownUp className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />}
            options={SORTS_OF[view].map(k => ({ key: k, word: SORT_WORD[k] }))} />
        </div>

        {/* On a computer, which tasks as tabs with their counts; a tab with none is greyed. */}
        <div role="tablist" aria-label="Which tasks to show" className="flex flex-wrap gap-x-6 border-b border-ink-100 max-sm:hidden">
          {PILLS.map(([v, word, dot]) => {
            const on = view === v
            return (
              <button key={v} type="button" role="tab" aria-selected={on} onClick={() => { setView(v); setStage(null); setSort(SORTS_OF[v][0]) }}
                className={clsx('btn-press -mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-sm transition-colors',
                  on ? 'border-ink-900 font-semibold text-ink-900' : 'border-transparent font-medium text-ink-500 hover:text-ink-800',
                  !on && tally[v] === 0 && 'opacity-55')}>
                {v === 'all' ? <ListChecks className="h-4 w-4" aria-hidden /> : <span className={clsx('h-2 w-2 rounded-full', dot)} aria-hidden />}
                {word}
                <span className="rounded-full bg-ink-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-ink-700">{tally[v]}</span>
              </button>
            )
          })}
        </div>

        {/* Inside Pending: the stages with a task in them, and the one chosen; a press shows only those. */}
        {view === 'pending' && (
          <DropPick label="Stage" className="sm:hidden" value={stage ?? 'any'} onChange={k => setStage(k === 'any' ? null : k)}
            options={[
              { key: 'any' as const, word: 'All pending', count: tally.pending, mark: <span className={clsx('h-2 w-2 shrink-0 rounded-full', LOOK_DOT.todo)} aria-hidden /> },
              // Only the stages with a task in them, and the one chosen (the user, 18 Nov: "show only with more than 0").
              ...STAGES.filter(([k]) => stages[k] > 0 || stage === k).map(([k, word, dot]) => ({ key: k, word, count: stages[k], mark: <span className={clsx('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden /> })),
            ]} />
        )}
        {view === 'pending' && (
          <div className="flex flex-wrap items-center gap-1.5 max-sm:hidden" role="group" aria-label="Pending by stage">
            {([['any', 'All pending', LOOK_DOT.todo, tally.pending], ...STAGES.filter(([k]) => stages[k] > 0 || stage === k).map(([k, w, d]) => [k, w, d, stages[k]])] as Array<[Stage | 'any', string, string, number]>).map(([k, word, dot, n]) => {
              const on = (stage ?? 'any') === k
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => setStage(k === 'any' ? null : k)}
                  className={clsx('btn-press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                    on ? 'border-ink-900 text-ink-900' : 'border-ink-200 text-ink-600 hover:bg-ink-50',
                    !on && k === 'overdue' && 'text-cyrixRed-700')}>
                  <span className={clsx('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />{word}
                  <span className="tabular-nums text-ink-400">{n}</span>
                </button>
              )
            })}
          </div>
        )}

      </div>

      <section className="min-w-0 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{view === 'pending' && stage ? `Pending · ${stageWord}` : PILLS.find(([v]) => v === view)![1]}</h2>
          <p className="text-sm text-ink-500">
            {`${plural(list.length)}${whom}${when}${view === 'approved' && sort === 'smart' ? ', latest first' : ''}${q.trim() ? ` matching “${q.trim()}”` : ''}`}
          </p>
        </div>

        {error && <Alert kind="error">{(error as Error).message}</Alert>}
        {isLoading && !data && <div className="card grid place-items-center p-10"><ChartLoader /></div>}

        {/* A table on a computer, a column for each thing (the user, 24 Oct); the cards on a phone. */}
        {data && list.length > 0 && (
          <>
            <ul className="space-y-2 md:hidden">{list.map(t => row(t, true))}</ul>
            <div className="hidden md:block"><TaskTable tasks={list} manage={manage} now={now} managerName={me?.manager_name} onOpen={onOpen} /></div>
          </>
        )}

        {data && list.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title={q.trim() ? `No task matches “${q.trim()}”.` : period !== 'all' && view === 'all' ? `Nothing${when}.` : EMPTY[view]}
          >
            {!manage && view === 'all' && period === 'all' && !q.trim() && (
              <button type="button" className="btn-secondary mt-1" onClick={() => setAdding(true)}>
                <CalendarPlus className="h-4 w-4" /> Add a task
              </button>
            )}
          </EmptyState>
        )}
      </section>

      {adding && <AddTask due={now} onClose={() => setAdding(false)} onAdded={() => undefined} />}
      {assigning && people && <AssignTask people={people} preselect={person?.id ?? null} onClose={() => setAssigning(false)} />}
      {open && openTask && (
        <TaskDialog key={open.id} task={openTask} manage={manage} me={me} opening={open.opening} onClose={() => setOpen(null)} />
      )}
    </div>
  )
}
