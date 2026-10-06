import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  LOOK_DOT, LOOK_ORDER, addMonths, monthGrid, monthOf, monthTitle, type Look,
} from '@/lib/tasks'

const WEEKDAYS = [
  ['S', 'Sunday'], ['M', 'Monday'], ['T', 'Tuesday'], ['W', 'Wednesday'], ['T', 'Thursday'], ['F', 'Friday'], ['S', 'Saturday'],
] as const

const LOOK_WORD: Record<Look, string> = { todo: 'to do', overdue: 'overdue', waiting: 'waiting for approval', approved: 'approved' }

/**
 * A month, a week to a row, Sunday first.
 *
 * Each day carries a dot for each kind of task due on it — red overdue,
 * blue to do, amber waiting for approval, green approved — so a glance at
 * the month says where the work is. Pressing a day shows its tasks; while
 * days from one to another are being chosen, they are shaded, the first
 * and the last dark.
 */
export default function Calendar({
  month, onMonth, selected, onSelect, looks, counts, now, range = null,
}: {
  /** "2026-10" */
  month: string
  onMonth: (month: string) => void
  selected: string | null
  onSelect: (day: string) => void
  /** The kinds of task due on each day. */
  looks: Map<string, Set<Look>>
  counts: Map<string, number>
  now: string
  /** The days chosen, from one to another, when that is what the list shows. */
  range?: { from: string; to: string } | null
}) {
  const days = monthGrid(month)
  const onThisMonth = monthOf(now) === month

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-ink-900" aria-live="polite">{monthTitle(month)}</h2>
        {!onThisMonth && (
          <button type="button" className="btn-press rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-100" onClick={() => { onMonth(monthOf(now)); if (!range) onSelect(now) }}>
            Today
          </button>
        )}
        <button type="button" className="btn-icon" aria-label="Previous month" onClick={() => onMonth(addMonths(month, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" className="btn-icon" aria-label="Next month" onClick={() => onMonth(addMonths(month, 1))}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center" role="group" aria-label={monthTitle(month)}>
        {WEEKDAYS.map(([short, long], i) => (
          <abbr key={i} title={long} className="pb-1 text-[11px] font-semibold uppercase tracking-label text-ink-400 no-underline">
            {short}
          </abbr>
        ))}
        {days.map(day => {
          const inMonth = monthOf(day) === month
          const isToday = day === now
          const inRange = !!range && day >= range.from && day <= range.to
          // The first and last of the days chosen look as a day pressed does; the days between are shaded.
          const isSelected = day === selected || (inRange && (day === range.from || day === range.to))
          const between = inRange && !isSelected
          const here = LOOK_ORDER.filter(l => looks.get(day)?.has(l))
          const n = counts.get(day) ?? 0
          const said = `${new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${isToday ? ', today' : ''}${n ? `, ${n} task${n === 1 ? '' : 's'}${here.length ? ` (${here.map(l => LOOK_WORD[l]).join(', ')})` : ''}` : ''}`
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={isSelected || between}
              aria-label={said}
              className={clsx(
                'cal-day flex h-12 flex-col items-center justify-start gap-1 rounded-lg pt-1.5 text-sm tabular-nums sm:h-14 sm:pt-2',
                isSelected ? 'bg-ink-900 font-semibold text-onInk'
                  : isToday ? 'font-bold text-cyrixRed-600'
                  : inMonth ? 'text-ink-800' : 'text-ink-300',
                between && 'bg-ink-100',
              )}
            >
              <span className={clsx('grid h-6 min-w-6 place-items-center rounded-full leading-none', isToday && !isSelected && 'ring-1 ring-cyrixRed-600/40')}>
                {Number(day.slice(8))}
              </span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {here.map(l => (
                  <span key={l} className={clsx('h-1.5 w-1.5 rounded-full', LOOK_DOT[l], !inMonth && !isSelected && 'opacity-50', isSelected && 'ring-1 ring-surface')} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-ink-100 pt-3 text-[11px] text-ink-500" aria-label="What the dots mean">
        {LOOK_ORDER.map(l => (
          <li key={l} className="flex items-center gap-1.5">
            <span className={clsx('h-1.5 w-1.5 rounded-full', LOOK_DOT[l])} aria-hidden />
            {LOOK_WORD[l][0].toUpperCase() + LOOK_WORD[l].slice(1)}
          </li>
        ))}
      </ul>
    </div>
  )
}
