import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { CheckCircle2, Hourglass, ListChecks, Timer, Users, type LucideIcon } from 'lucide-react'
import IconChip from '@/components/IconChip'
import { CritPill } from '@/components/Criticality'
import PersonSelect, { usePersonChoice } from '@/components/PersonSelect'
import { Alert, ChartLoader } from '@/components/ui'
import { TONE_TEXT, type Tone } from '@/lib/tones'
import { monthOf, monthTitle, addMonths, today, useMe, useTasks } from '@/lib/tasks'
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
 * on time is completed by the due date.
 */
export default function Dashboard() {
  const now = today()
  const { data: me } = useMe()
  const manages = (me?.team ?? 0) > 0
  const [period, setPeriod] = useState<Period>('this')
  const [scope, setScope] = useState<'mine' | 'team' | null>(null)
  const team = (scope ?? (manages ? 'team' : 'mine')) === 'team' && manages
  const { people, person, setPerson } = usePersonChoice()

  const { from, to } = periodRange(period, now)
  const mine = useTasks({ from, to }, {}, !team)
  const theirs = useTasks({ from, to }, person ? { employeeId: person.id } : { team: true }, team)
  const q = team ? theirs : mine
  const tasks = useMemo(() => (q.data ?? []).filter(t => inPeriod(t, { from, to })), [q.data, from, to])
  const all = figures(tasks, now)
  const crit = byCriticality(tasks, now)
  const persons = team && !person ? byPerson(tasks, now) : []
  const share = onTimeShare(all)

  const when = period === 'all' ? 'at any time' : `in ${monthTitle(period === 'this' ? monthOf(now) : addMonths(monthOf(now), -1))}`
  const whose = !team ? 'Your tasks' : person ? `${person.full_name}’s tasks` : 'Your team’s tasks'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-ink-500">{whose} due {when}, as they stand now.</p>
        </div>
        <Segmented
          label="Period"
          value={period}
          onChange={v => setPeriod(v as Period)}
          options={(['this', 'last', 'all'] as Period[]).map(p => [p, PERIOD_WORD[p]])}
        />
      </div>

      {manages && (
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="Team or mine"
            value={team ? 'team' : 'mine'}
            onChange={v => setScope(v as 'mine' | 'team')}
            options={[['team', 'My team'], ['mine', 'Mine']]}
          />
          {team && people && people.length > 0 && <PersonSelect people={people} person={person} onChange={setPerson} />}
        </div>
      )}

      {q.error && <Alert kind="error">{(q.error as Error).message}</Alert>}
      {q.isLoading && !q.data && <div className="card grid place-items-center p-10"><ChartLoader /></div>}

      {q.data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={ListChecks} tone="sky" label="Total tasks" value={all.total} sub={`due ${when}`} />
            <Tile
              icon={Hourglass} tone="amber" label="Pending" value={all.pending}
              sub={all.overdue > 0 ? `${all.overdue} overdue` : 'none overdue'} subTone={all.overdue > 0 ? 'red' : undefined}
            />
            <Tile icon={CheckCircle2} tone="green" label="Completed" value={all.completed} sub={`${all.approved} approved · ${all.waiting} waiting`} />
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-label text-ink-500">
                    <th className="sticky left-0 bg-surface px-4 py-2.5 font-semibold">Criticality</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Pending</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Completed</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Completion TAT</th>
                    <th className="px-4 py-2.5 text-right font-semibold">On time</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {crit.map(([c, f]) => (
                    <tr key={c} className="border-t border-ink-100">
                      <td className="sticky left-0 bg-surface px-4 py-3"><CritPill value={c} /></td>
                      <td className="px-3 py-3 text-right font-semibold text-ink-900">{f.total}</td>
                      <td className="px-3 py-3 text-right text-ink-800">
                        {f.pending}
                        {f.overdue > 0 && <span className="block text-[11px] font-medium text-cyrixRed-600">{f.overdue} overdue</span>}
                      </td>
                      <td className="px-3 py-3 text-right text-ink-800">{f.completed}</td>
                      <td className="px-3 py-3 text-right text-ink-800">{tatWords(f.avgHours)}</td>
                      <td className="px-4 py-3 text-right"><OnTime f={f} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {team && !person && (
            <section className="card overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-ink-100 px-4 py-3">
                <IconChip icon={Users} tone="teal" />
                <h2 className="text-base font-semibold text-ink-900">By person</h2>
              </div>
              {persons.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-500">Nobody in your team has a task due {when}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-label text-ink-500">
                        <th className="sticky left-0 bg-surface px-4 py-2.5 font-semibold">Person</th>
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
                            <Link to={`/team?person=${p.id}`} className="link-accent block min-w-0">
                              <span className="block truncate font-semibold text-ink-900">{p.name}</span>
                              <span className="block text-xs text-ink-500">{p.ecode}</span>
                            </Link>
                          </td>
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

          <p className="text-xs leading-relaxed text-ink-500">
            A task counts in the month it is due. Pending is not yet marked complete; overdue is pending past its due date.
            Completion TAT is the average time from adding a task to marking it complete; on time is completed by the due date.
          </p>
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

function Tile({ icon, tone, label, value, sub, subTone }: {
  icon: LucideIcon; tone: Tone; label: string; value: ReactNode; sub: string; subTone?: Tone | 'slate'
}) {
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-center gap-2">
        <IconChip icon={icon} tone={tone} />
        <p className="text-xs font-semibold uppercase tracking-label text-ink-500">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-ink-900">{value}</p>
      <p className={clsx('mt-1 text-xs font-medium', subTone ? TONE_TEXT[subTone] : 'text-ink-500')}>{sub}</p>
    </div>
  )
}

/** Where every task stands, as one bar: approved, waiting, to do, overdue. */
function StandBar({ f }: { f: Figures }) {
  if (f.total === 0) return null
  const todo = f.pending - f.overdue
  const parts: Array<[number, string, string]> = [
    [f.approved, 'bg-green-600', 'approved'],
    [f.waiting, 'bg-amber-500', 'waiting for approval'],
    [todo, 'bg-sky-500', 'to do'],
    [f.overdue, 'bg-cyrixRed-600', 'overdue'],
  ]
  const pct = Math.round((f.completed / f.total) * 100)
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-ink-900">{f.completed} of {f.total} completed</p>
        <p className="text-sm font-semibold tabular-nums text-ink-900">{pct}%</p>
      </div>
      <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-ink-100" role="img" aria-label={parts.filter(([n]) => n > 0).map(([n, , w]) => `${n} ${w}`).join(', ')}>
        {parts.map(([n, cls, w]) => n > 0 && <span key={w} className={cls} style={{ width: `${(n / f.total) * 100}%` }} />)}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
        {parts.map(([n, cls, w]) => (
          <li key={w} className="flex items-center gap-1.5">
            <span className={clsx('h-2 w-2 rounded-full', cls)} aria-hidden />
            <span className="tabular-nums font-medium text-ink-800">{n}</span> {w}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OnTime({ f }: { f: Figures }) {
  const s = onTimeShare(f)
  if (s.pct === null) return <span className="text-ink-400">—</span>
  return (
    <span className={clsx('font-semibold', TONE_TEXT[s.tone])}>
      {f.onTime} of {f.completed} · {s.pct}%
    </span>
  )
}
