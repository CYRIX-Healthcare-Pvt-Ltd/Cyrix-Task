import clsx from 'clsx'
import type { Criticality } from '@/lib/tasks'

/**
 * How critical a task is: Critical, Moderate, Non-critical.
 *
 * Drawn as a level meter — three bars, two, one lit — and kept in outline:
 * the filled chips say where a task stands (overdue, waiting, approved), so
 * how critical it is never reads as one of those. Text and edges are the
 * themed 700 and 200 steps, so they hold on a dark page too. (Lucide's
 * signal icons were tried first; at chip size the one-bar "low" drew as a
 * stray dot.)
 */
export const CRITICALITY: Array<{ value: Criticality; word: string; level: 1 | 2 | 3; pill: string; on: string; bars: string }> = [
  {
    value: 'critical', word: 'Critical', level: 3,
    pill: 'border-cyrixRed-200 text-cyrixRed-700',
    on: 'border-cyrixRed-600 bg-cyrixRed-50 text-cyrixRed-800 ring-1 ring-cyrixRed-600',
    bars: 'text-cyrixRed-600',
  },
  {
    value: 'moderate', word: 'Moderate', level: 2,
    pill: 'border-amber-200 text-amber-800',
    on: 'border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500',
    bars: 'text-amber-500',
  },
  {
    value: 'non_critical', word: 'Non-critical', level: 1,
    pill: 'border-slate-200 text-slate-700',
    on: 'border-slate-500 bg-slate-50 text-slate-900 ring-1 ring-slate-500',
    bars: 'text-slate-500',
  },
]

export const critOf = (c: Criticality) => CRITICALITY.find(x => x.value === c) ?? CRITICALITY[1]

/** Three bars rising left to right, lit up to the level. */
export function CritBars({ value, className }: { value: Criticality; className?: string }) {
  const c = critOf(value)
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={clsx('shrink-0', c.bars, className)}>
      {[4, 7, 10].map((h, i) => (
        <rect key={h} x={1 + i * 3.75} y={11 - h} width="2.5" height={h} rx="0.8" className={i < c.level ? 'fill-current' : 'fill-ink-200'} />
      ))}
    </svg>
  )
}

export function CritPill({ value, className }: { value: Criticality; className?: string }) {
  const c = critOf(value)
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-[11px] font-semibold', c.pill, className)}>
      <CritBars value={value} className="h-3 w-3" />
      {c.word}
    </span>
  )
}

/** Three buttons, one chosen. Nothing is chosen for a new task: it is asked, not assumed. */
export function CritPicker({
  value, onChange, disabled = false, labelledBy,
}: {
  value: Criticality | null
  onChange: (c: Criticality) => void
  disabled?: boolean
  labelledBy?: string
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="grid grid-cols-3 gap-2">
      {CRITICALITY.map(c => {
        const on = value === c.value
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => { if (!on) onChange(c.value) }}
            className={clsx(
              // On a phone the bars sit over the word: three words side by side in a third of a phone each, "Non-critical" did not fit.
              'btn-press flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 sm:flex-row sm:gap-1.5 sm:px-2',
              on ? c.on : 'border-ink-200 bg-surface text-ink-700 hover:bg-ink-50',
            )}
          >
            <CritBars value={c.value} className="h-3.5 w-3.5" />
            <span className="max-w-full truncate">{c.word}</span>
          </button>
        )
      })}
    </div>
  )
}
