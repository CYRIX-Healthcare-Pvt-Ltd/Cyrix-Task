import clsx from 'clsx'
import { BellRing, Check, UserPlus } from 'lucide-react'
import { CritPill } from '@/components/Criticality'
import type { Opening } from '@/components/TaskRow'
import { TONE_CLASS } from '@/lib/tones'
import { tatWords } from '@/lib/stats'
import { localDay } from '@/lib/when'
import { closedWord, daysLate, tatHours, firstName, isScheduled, lookOf, progressColor, progressWord, releaseWords, shortDay, timeWords, type Task } from '@/lib/tasks'
import { ACCENT } from '@/components/TaskForm'

/**
 * The tasks as a table, on a computer (the user, 24 Oct: "need this column wise, name with ecode, task, description,
 * completion date, completion TAT, overdue days — make it easy"). A row opens the task; the action at its end does the
 * one thing that is next — Approve or Remind for the manager, Complete for the person. A phone keeps the cards.
 */
export default function TaskTable({ tasks, manage, now, managerName, onOpen }: {
  tasks: Task[]
  manage: boolean
  now: string
  managerName?: string | null
  onOpen: (task: Task, opening?: Opening) => void
}) {
  // Headers may take two lines, so the table fits the page and does not scroll sideways (the user, 18 Nov: "why scroll bar here?").
  const th = 'px-3 py-2.5 text-left align-middle text-[11px] font-semibold uppercase leading-tight tracking-label text-ink-500'
  const chip = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold'
  return (
    <div className="card overflow-hidden">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-ink-100 bg-ink-50">
            <tr>
              {manage && <th className={clsx(th, 'sticky left-0 bg-ink-50 pl-4')}>Person</th>}
              <th className={clsx(th, !manage && 'pl-4')}>Task</th>
              <th className={th}>Description</th>
              <th className={clsx(th, '!text-center')}>Criticality</th>
              <th className={clsx(th, '!text-center')}>Status</th>
              <th className={clsx(th, '!text-center')}>Assigned by</th>
              <th className={clsx(th, '!text-center')}>Task date</th>
              <th className={clsx(th, '!text-center')}>Completed on</th>
              <th className={clsx(th, '!text-center')}>Completion TAT</th>
              <th className={clsx(th, '!text-center')}>Overdue</th>
              <th className={clsx(th, 'pr-4 text-right')}><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {tasks.map(t => {
              const look = lookOf(t, now)
              const late = daysLate(t, now)
              const tat = tatHours(t)
              const status = isScheduled(t)
                ? <span className={clsx(chip, TONE_CLASS.violet)}>Scheduled · {releaseWords(t.release_on ?? t.due_on)}</span>
                : look === 'approved'
                ? <span className={clsx(chip, TONE_CLASS.green)}>{closedWord(t)}</span>
                : look === 'waiting'
                  ? <span className={clsx(chip, TONE_CLASS.amber)}>{manage ? 'Waiting for your approval' : `Waiting for ${firstName(t.assigned_by_name) || firstName(managerName) || 'approval'}`}</span>
                  : (
                    <span className="mx-auto flex w-[118px] flex-col items-stretch gap-1">
                      <span className={clsx(chip, 'self-center', look === 'overdue' ? TONE_CLASS.red : t.progress > 0 ? TONE_CLASS.sky : TONE_CLASS.slate)}>
                        {look === 'overdue' ? 'Overdue · ' : ''}{progressWord(t.progress)}{t.progress > 0 ? ` · ${t.progress}%` : ''}
                      </span>
                      {t.progress > 0 && <span className="h-1 overflow-hidden rounded-full bg-ink-100"><span className="block h-full rounded-full" style={{ width: `${t.progress}%`, background: progressColor(t.progress, look === 'overdue') }} /></span>}
                    </span>
                  )
              return (
                <tr key={t.id} onClick={() => onOpen(t)} className="group h-[68px] cursor-pointer align-middle transition-colors hover:bg-ink-50">
                  {manage && (
                    <td className="sticky left-0 bg-surface px-3 py-3 pl-4 transition-colors group-hover:bg-ink-50" style={{ boxShadow: `inset 3px 0 0 ${ACCENT[t.criticality]}` }}>
                      <span className="block max-w-[11rem] truncate font-semibold text-ink-900">{t.employee_name}</span>
                      <span className="block text-xs tabular-nums text-ink-500">{t.employee_ecode}</span>
                    </td>
                  )}
                  <td className={clsx('px-3 py-3', !manage && 'pl-4')} style={manage ? undefined : { boxShadow: `inset 3px 0 0 ${ACCENT[t.criticality]}` }}>
                    <span className="flex max-w-[12rem] items-center gap-1.5">
                      {t.unseen > 0 && <span className="unseen-dot h-2 w-2 shrink-0 rounded-full bg-violet-500" aria-label="New" />}
                      <span className={clsx('min-w-0 truncate font-semibold', t.status === 'approved' ? 'text-ink-600' : 'text-ink-900')}>{t.title}</span>
                    </span>
                  </td>
                  {/* The description takes what room is left and ends in … : the table fits the page (the user, 18 Nov). */}
                  <td className="w-full max-w-0 px-3 py-3"><span className="block min-w-[6rem] truncate text-ink-600">{t.details || <span className="text-ink-300">—</span>}</span></td>
                  <td className="px-3 py-3 text-center"><CritPill value={t.criticality} /></td>
                  <td className="px-3 py-3 text-center">{status}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-center">{t.assigned_by_name
                    ? <span className={clsx(chip, TONE_CLASS.teal)}><UserPlus className="h-3 w-3" aria-hidden />{firstName(t.assigned_by_name)}</span>
                    : <span className="text-xs font-medium text-ink-400">Self</span>}</td>
                  <td className={clsx('whitespace-nowrap px-3 py-3 text-center tabular-nums', look === 'overdue' ? 'font-semibold text-cyrixRed-700' : 'text-ink-800')}>{shortDay(t.due_on)}{t.due_at && <span className="block text-xs font-normal text-ink-500">{timeWords(t.due_at)}</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums text-ink-800">{t.done_at ? shortDay(localDay(t.done_at)) : <span className="text-ink-300">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-center tabular-nums text-ink-800">{tat === null ? <span className="text-ink-300">—</span> : tatWords(tat)}</td>
                  <td className={clsx('whitespace-nowrap px-3 py-3 text-center tabular-nums', late > 0 ? 'font-semibold text-cyrixRed-700' : 'text-ink-300')}>{late > 0 ? `${late} ${late === 1 ? 'day' : 'days'}` : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 pr-4 text-right" onClick={e => e.stopPropagation()}>
                    {manage && t.status === 'done' && (
                      <button type="button" onClick={() => onOpen(t, 'approve')} className="btn-press rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803d]">Approve</button>
                    )}
                    {manage && t.status === 'open' && !isScheduled(t) && (
                      <button type="button" onClick={() => onOpen(t, 'remind')} className="btn-press inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                        <BellRing className="h-3.5 w-3.5 text-violet-500" aria-hidden /> Remind
                      </button>
                    )}
                    {!manage && t.status === 'open' && (
                      <button type="button" onClick={() => onOpen(t, 'complete')} className="btn-press inline-flex items-center gap-1 rounded-lg bg-[#217346] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1a5c38]">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Complete
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
