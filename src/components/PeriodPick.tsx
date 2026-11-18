import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { CalendarRange } from 'lucide-react'
import { addDays, shortDay, today } from '@/lib/tasks'

export type Period = 'all' | 'this' | 'range'
const WORDS: Array<[Period, string]> = [['all', 'All time'], ['this', 'This month'], ['range', 'From – To']]

/**
 * All time, This month, or From – To. From – To opens a small window under it with the two days and Done, and then
 * says the days chosen; the boxes no longer sit in the page (the user, 18 Nov: "better pop up on from to").
 * A press outside or Escape closes it. Used on the Dashboard and the task lists alike.
 */
export default function PeriodPick({ period, onPeriod, range, onRange, className }: {
  period: Period
  onPeriod: (p: Period) => void
  range: { from: string; to: string }
  onRange: (r: { from: string; to: string }) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const max = addDays(today(), 366)

  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', out)
    window.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', out); window.removeEventListener('keydown', key, true) }
  }, [open])

  const setEnd = (end: 'from' | 'to', d: string) => {
    if (!d) return
    onRange(end === 'from' ? { from: d, to: range.to < d ? d : range.to } : { from: range.from > d ? d : range.from, to: d })
  }

  return (
    <div ref={box} className={clsx('relative', className)}>
      <div role="radiogroup" aria-label="Which days" className="grid grid-cols-3 rounded-lg border border-ink-200 bg-surface p-0.5 lg:inline-grid">
        {WORDS.map(([p, word]) => (
          <button key={p} type="button" role="radio" aria-checked={period === p}
            aria-expanded={p === 'range' ? open : undefined}
            onClick={() => { onPeriod(p); setOpen(p === 'range' ? !(period === 'range' && open) : false) }}
            className={clsx('btn-press inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium', period === p ? 'bg-ink-900 text-onInk' : 'text-ink-600 hover:bg-ink-50')}>
            {p === 'range' && <CalendarRange className="h-4 w-4 shrink-0" aria-hidden />}
            {p === 'range' && period === 'range' ? (range.from === range.to ? shortDay(range.from) : `${shortDay(range.from)} – ${shortDay(range.to)}`) : word}
          </button>
        ))}
      </div>
      {period === 'range' && open && (
        <div role="dialog" aria-label="Days from one to another"
          className="drop-pop absolute right-0 z-40 mt-1.5 w-full min-w-[18rem] rounded-2xl border border-ink-200 bg-surface p-3 shadow-2xl sm:w-80">
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="label">From</span>
              <input type="date" className="input" value={range.from} max={max} onChange={e => setEnd('from', e.target.value)} />
            </label>
            <label className="block min-w-0">
              <span className="label">To</span>
              <input type="date" className="input" value={range.to} min={range.from} max={max} onChange={e => setEnd('to', e.target.value)} />
            </label>
          </div>
          <button type="button" className="btn-primary mt-3 w-full" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  )
}
