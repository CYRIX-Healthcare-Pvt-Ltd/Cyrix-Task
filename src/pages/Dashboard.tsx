import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { CheckCircle2, Hourglass, ListChecks, Search, Timer, Users, type LucideIcon } from 'lucide-react'
import IconChip from '@/components/IconChip'
import { CritPill } from '@/components/Criticality'
import { ACCENT } from '@/components/TaskForm'
import PersonSelect, { usePersonChoice } from '@/components/PersonSelect'
import { Alert, ChartLoader } from '@/components/ui'
import { TONE_TEXT, type Tone } from '@/lib/tones'
import { monthOf, monthTitle, addDays, isScheduled, shortDay, today, useMe, useTasks } from '@/lib/tasks'
import {
  PERIOD_WORD, byCriticality, byPerson, figures, inPeriod, onTimeShare, periodRange, tatWords, type Figures, type Period,
} from '@/lib/stats'

/**
 * How the tasks stand: how many, how many pending, how many completed and
 * how long completing them takes — in all, by criticality, and for a
 * manager by person.
 *
 * A task counts in the month it is due. Pending and completed are as the
 * task stands now, so a month's total is always the two together.
 * Completion TAT is the time from adding a task to marking it complete;
 * on time is completed by the due date. The manager's approval adds
 * nothing to it; a task sent back or reopened counts on until it is
 * marked complete again (the user, 6 Oct).
 */
export default function Dashboard() {
  const now = today()
  const { data: me } = useMe()
  const manages = (me?.team ?? 0) > 0
  const [period, setPeriod] = useState<Period>('all')
  const [chosen, setChosen] = useState(() => ({ from: `${monthOf(now)}-01`, to: now }))
  // The people's list, searched (built for a hundred).
  const [find, setFind] = useState('')
  const [scope, setScope] = useState<'mine' | 'team' | null>(null)
  const team = scope === 'team' && manages
  const { people, person, setPerson } = usePersonChoice()
  // My team opens on the tasks given out, as the board does (the user, 29 Oct).
  const [source, setSource] = useState<'assigned' | 'self' | 'any'>('assigned')

  const { from, to } = periodRange(period, now, chosen)
  const mine = useTasks({ from, to }, {}, !team)
  const theirs = useTasks({ from, to }, person ? { employeeId: person.id } : { team: true }, team)
  const q = team ? theirs : mine
  // A task assigned for later counts once it reaches the person (9 AM on its day).
  const tasks = useMemo(() => (q.data ?? []).filter(t => inPeriod(t, { from, to }) && !isScheduled(t)
    && (!team || source === 'any' || (source === 'assigned') === !!t.assigned_by_name)), [q.data, from, to, team, source])
  const all = figures(tasks, now)
  const crit = byCriticality(tasks, now)
  const persons = team && !person ? byPerson(tasks, now).filter(p => !find.trim() || `${p.name} ${p.ecode}`.toLowerCase().includes(find.trim().toLowerCase())) : []
  const share = onTimeShare(all)

  const when = period === 'all' ? 'at any time' : period === 'range' ? `from ${shortDay(from)} to ${shortDay(to)}` : `in ${monthTitle(monthOf(now))}`
  // A tile opens the board on its own tab, for the same people and period (the user, 29 Oct).
  const board = (view: string, who = team ? person?.id : undefined) => {
    const q = new URLSearchParams({ view, period, source: team ? source : 'any' })
    if (period === 'range') { q.set('from', from); q.set('to', to) }
    if (who) q.set('person', who)
    return `${team ? '/team' : '/my-task'}?${q}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Dashboard</h1>
        </div>
        <Segmented
          label="Period"
          value={period}
          onChange={v => setPeriod(v as Period)}
          options={(['all', 'this', 'range'] as Period[]).map(p => [p, PERIOD_WORD[p]])}
        />
      </div>
      {period === 'range' && (
        <div className="card grid grid-cols-2 gap-3 p-3 sm:max-w-md sm:p-4" role="group" aria-label="Days from one to another">
          <label className="block min-w-0"><span className="label">From</span>
            <input type="date" className="input" value={chosen.from} max={addDays(now, 366)}
              onChange={e => { const d = e.target.value; if (d) setChosen(c => ({ from: d, to: c.to < d ? d : c.to })) }} /></label>
          <label className="block min-w-0"><span className="label">To</span>
            <input type="date" className="input" value={chosen.to} max={addDays(now, 366)}
              onChange={e => { const d = e.target.value; if (d) setChosen(c => ({ from: c.from > d ? d : c.from, to: d })) }} /></label>
        </div>
      )}

      {manages && (
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Team or mine"
            value={team ? 'team' : 'mine'}
            onChange={v => setScope(v as 'mine' | 'team')}
            options={[['mine', 'Mine'], ['team', 'My team']]}
          />
          {team && (
            <Segmented
              label="Assigned or self-added"
              value={source}
              onChange={v => setSource(v as 'assigned' | 'self' | 'any')}
              options={[['assigned', 'Assigned'], ['self', 'Self-added'], ['any', 'All']]}
            />
          )}
          {team && people && people.length > 0 && <PersonSelect people={people} person={person} onChange={setPerson} />}
        </div>
      )}

      {q.error && <Alert kind="error">{(q.error as Error).message}</Alert>}
      {q.isLoading && !q.data && <div className="card grid place-items-center p-10"><ChartLoader /></div>}

      {q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile to={board('all')} icon={ListChecks} tone="sky" label="Total tasks" value={all.total} sub={`due ${when}`} />
            <Tile
              to={board('pending')} icon={Hourglass} tone="amber" label="Pending" value={all.pending}
              sub={`${all.inProgress} in progress · ${all.overdue} overdue`} subTone={all.overdue > 0 ? 'red' : undefined}
            />
            <Tile to={board('approved')} icon={CheckCircle2} tone="green" label="Completed" value={all.completed} sub={all.waiting > 0 ? `${all.waiting} waiting for approval` : `${all.total ? Math.round((all.completed / all.total) * 100) : 0}% of all`} />
            <Tile
              icon={Timer} tone="violet" label="Completion TAT" value={tatWords(all.avgHours)}
              sub={share.pct === null ? 'nothing completed yet' : `${all.onTime} of ${all.completed} on time · ${share.pct}%`}
              subTone={share.pct === null ? undefined : share.tone}
            />
          </div>

          <StandBar f={all} />

          <section className="card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-3">
              <h2 className="text-base font-semibold text-ink-900">By criticality</h2>
            </div>
            {/* One box per criticality with its figures side by side, three across on a computer (the user, 18 Nov: "looks odd", "make like this desktop also"). */}
            <ul className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4">
              {crit.map(([c, f], i) => (
                <li key={c} className="crit-card rounded-xl border p-3" style={{ '--accent': ACCENT[c], '--d': `${i * 110}ms` } as CSSProperties}>
                  <div className="relative flex items-center justify-between gap-2">
                    <CritPill value={c} rise className="whitespace-nowrap" />
                    <span className="text-sm text-ink-600"><b className="font-semibold tabular-nums text-ink-900">{f.total}</b> total</span>
                  </div>
                  <dl className="relative mt-2.5 grid grid-cols-4 gap-2 text-center tabular-nums">
                    {([
                      ['Pending', <>{f.pending}{f.overdue > 0 && <span className="block text-[10px] font-medium text-cyrixRed-600">{f.overdue} overdue</span>}</>],
                      ['Done', f.completed],
                      ['TAT', tatWords(f.avgHours)],
                      ['On time', <OnTime f={f} short />],
                    ] as const).map(([k, v]) => (
                      <div key={k} className="min-w-0 rounded-lg bg-ink-50 px-1 py-1.5">
                        <dt className="text-[10px] font-semibold uppercase tracking-label text-ink-500">{k}</dt>
                        <dd className="mt-0.5 truncate text-sm font-semibold text-ink-900">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </section>

          {team && !person && (
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center gap-2.5 border-b border-ink-100 px-4 py-3">
                <IconChip icon={Users} tone="teal" />
                <h2 className="text-base font-semibold text-ink-900">By team members</h2>
                <label className="relative ml-auto w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
                  <input className="input !py-1.5 !pl-8" value={find} onChange={e => setFind(e.target.value)} placeholder="Name or E-code" aria-label="Find a person" />
                </label>
              </div>
              {persons.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-500">{find.trim() ? `Nobody matches “${find.trim()}”.` : `Nobody in your team has a task due ${when}.`}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-label text-ink-500">
                        <th className="sticky left-0 bg-surface px-4 py-2.5 font-semibold">Person</th>
                        <th className="w-[22%] px-3 py-2.5 font-semibold">Where they stand</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Pending</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Overdue</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Completed</th>
                        <th className="px-3 py-2.5 text-right font-semibold">Completion TAT</th>
                        <th className="px-4 py-2.5 text-right font-semibold">On time</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {persons.map(p => (
                        <tr key={p.id} className="border-t border-ink-100 hover:bg-ink-50">
                          <td className="sticky left-0 bg-surface px-4 py-3">
                            <Link to={board('all', p.id)} className="link-accent block min-w-0">
                              <span className="block truncate font-semibold text-ink-900">{p.name}</span>
                              <span className="block text-xs text-ink-500">{p.ecode}</span>
                            </Link>
                          </td>
                          <td className="px-3 py-3"><MiniBar f={p.f} /></td>
                          <td className="px-3 py-3 text-right font-semibold text-ink-900">{p.f.total}</td>
                          <td className="px-3 py-3 text-right text-ink-800">{p.f.pending}</td>
                          <td className={clsx('px-3 py-3 text-right', p.f.overdue > 0 ? 'font-semibold text-cyrixRed-600' : 'text-ink-400')}>{p.f.overdue}</td>
                          <td className="px-3 py-3 text-right text-ink-800">{p.f.completed}</td>
                          <td className="px-3 py-3 text-right text-ink-800">{tatWords(p.f.avgHours)}</td>
                          <td className="px-4 py-3 text-right"><OnTime f={p.f} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

        </>
      )}
    </div>
  )
}

function Segmented({ label, value, options, onChange }: {
  label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-ink-200 bg-surface p-0.5">
      {options.map(([v, word]) => {
        const on = v === value
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={clsx(
              'btn-press rounded-md px-3 py-1.5 text-sm font-medium',
              on ? 'bg-ink-900 text-onInk' : 'text-ink-600 hover:bg-ink-50',
            )}
          >
            {word}
          </button>
        )
      })}
    </div>
  )
}

// A tile lights in its own icon's colour under the pointer (the user, 29 Oct).
const HOVER: Partial<Record<Tone, string>> = {
  sky: 'hover:border-sky-500 hover:bg-sky-500/5', amber: 'hover:border-amber-500 hover:bg-amber-500/5',
  green: 'hover:border-green-500 hover:bg-green-500/5', violet: 'hover:border-violet-500 hover:bg-violet-500/5',
}

function Tile({ icon, tone, label, value, sub, subTone, to }: {
  icon: LucideIcon; tone: Tone; label: string; value: ReactNode; sub: string; subTone?: Tone | 'slate'; to?: string
}) {
  const Box = ({ children }: { children: ReactNode }) => to
    ? <Link to={to} className={clsx('card btn-press flex flex-col p-4 transition-colors', HOVER[tone])}>{children}</Link>
    : <div className="card flex flex-col p-4">{children}</div>
  return (
    <Box>
      <div className="flex items-center gap-2">
        <IconChip icon={icon} tone={tone} />
        <p className="text-xs font-semibold uppercase tracking-label text-ink-500">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-ink-900">{value}</p>
      <p className={clsx('mt-1 text-xs font-medium', subTone ? TONE_TEXT[subTone] : 'text-ink-500')}>{sub}</p>
    </Box>
  )
}

/** Where every task stands, as one bar: approved, waiting, to do, overdue. */
function StandBar({ f }: { f: Figures }) {
  if (f.total === 0) return null
  const parts = standParts(f)
  const pct = Math.round((f.completed / f.total) * 100)
  return (
    // The criticality boxes' glow (the user, 18 Nov: "give the same neon feel"): a green wash for what is done, each
    // part of the bar lit in its own colour and drawn in from the left.
    <div className="crit-card card p-4" style={{ '--accent': GLOW.completed } as CSSProperties}>
      <div className="relative flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink-900">{f.completed} of {f.total} completed</p>
        <p className="text-base font-bold tabular-nums" style={{ color: GLOW.completed, textShadow: `0 0 8px color-mix(in srgb, ${GLOW.completed} 40%, transparent)` }}>{pct}%</p>
      </div>
      <div className="relative mt-3 flex h-2.5 gap-1 rounded-full bg-ink-100/60" role="img" aria-label={parts.filter(([n]) => n > 0).map(([n, , w]) => `${n} ${w}`).join(', ')}>
        {parts.map(([n, , w], i) => n > 0 && (
          <span key={w} className="stand-seg rounded-full" style={{ width: `${(n / f.total) * 100}%`, background: GLOW[w], boxShadow: `0 0 5px color-mix(in srgb, ${GLOW[w]} 45%, transparent)`, animationDelay: `${150 + i * 120}ms` }} />
        ))}
      </div>
      <ul className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
        {parts.map(([n, , w]) => (
          <li key={w} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: GLOW[w], boxShadow: n > 0 ? `0 0 4px color-mix(in srgb, ${GLOW[w]} 50%, transparent)` : undefined }} aria-hidden />
            <span className="tabular-nums font-medium text-ink-800">{n}</span> {w}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The lit colour of each part of the bar. */
const GLOW: Record<string, string> = {
  completed: 'rgb(34 197 94)', 'waiting for approval': 'rgb(245 158 11)', 'in progress': 'rgb(56 189 248)',
  'not started': 'rgb(148 163 184)', overdue: 'rgb(239 68 68)',
}

/** Where a set of tasks stands, in the order the bars draw it. */
function standParts(f: Figures): Array<[number, string, string]> {
  return [
    [f.approved, 'bg-green-600', 'completed'],
    [f.waiting, 'bg-amber-500', 'waiting for approval'],
    [f.inProgress, 'bg-sky-500', 'in progress'],
    [f.notStarted, 'bg-ink-300', 'not started'],
    [f.overdue, 'bg-cyrixRed-600', 'overdue'],
  ]
}

/** One person's tasks as a thin bar, the same colours as the big one; the numbers on hover. */
function MiniBar({ f }: { f: Figures }) {
  if (f.total === 0) return <span className="text-ink-400">—</span>
  const parts = standParts(f)
  return (
    <div className="flex h-2 min-w-[96px] overflow-hidden rounded-full bg-ink-100" role="img" title={parts.filter(([n]) => n > 0).map(([n, , w]) => `${n} ${w}`).join(' · ')}
      aria-label={parts.filter(([n]) => n > 0).map(([n, , w]) => `${n} ${w}`).join(', ')}>
      {parts.map(([n, cls, w]) => n > 0 && <span key={w} className={cls} style={{ width: `${(n / f.total) * 100}%` }} />)}
    </div>
  )
}

function OnTime({ f, short = false }: { f: Figures; short?: boolean }) {
  const s = onTimeShare(f)
  if (s.pct === null) return <span className="text-ink-400">—</span>
  return (
    <span className={clsx('font-semibold', TONE_TEXT[s.tone])}>
      {short ? `${s.pct}%` : `${f.onTime} of ${f.completed} · ${s.pct}%`}
    </span>
  )
}
