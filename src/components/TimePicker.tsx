import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Clock3, Moon, Sun, X } from 'lucide-react'
import { timeWords } from '@/lib/tasks'

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The due time, picked from our own panel instead of the browser's list (the user, 18 Nov: "make this time select
 * beautiful"). Hours, minutes in fives, AM or PM; blank means any time that day. A tap outside closes the panel only,
 * never the window it is in; Escape too.
 */
export default function TimePicker({ value, onChange, accent = null, label = 'Due time' }: {
  /** "17:30", or '' for none */
  value: string
  onChange: (t: string) => void
  accent?: string | null
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<CSSProperties>({})
  const [h24, m] = value ? value.split(':').map(Number) : [NaN, NaN]
  const [pm, setPm] = useState(() => (value ? h24 >= 12 : new Date().getHours() >= 12))
  const h12 = Number.isNaN(h24) ? null : h24 % 12 || 12
  const tone = accent ?? 'rgb(13 148 136)'

  const set = (h: number | null, min: number | null, isPm = pm) => {
    const hh = h ?? h12 ?? 9
    const mm = min ?? (Number.isNaN(m) ? 0 : m)
    onChange(`${pad((hh % 12) + (isPm ? 12 : 0))}:${pad(mm)}`)
  }

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const place = () => {
      const r = btn.current!.getBoundingClientRect()
      if (window.innerWidth < 640) { setAt({ left: 8, right: 8, bottom: 8 }); return }
      const w = 300, h = 380
      const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8)
      const top = r.bottom + 8 + h > window.innerHeight ? Math.max(8, r.top - 8 - h) : r.bottom + 8
      setAt({ left, top, width: w })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false); btn.current?.focus() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  const cell = (on: boolean) => clsx(
    'btn-press grid h-10 place-items-center rounded-xl text-sm font-semibold tabular-nums transition-colors',
    on ? 'text-white shadow-sm' : 'text-ink-800 hover:bg-ink-100',
  )
  const onStyle = (on: boolean): CSSProperties | undefined => (on ? { background: tone } : undefined)

  return (
    <div>
      <span className="label">{label}</span>
      <span className="relative block">
        <button ref={btn} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
          className={clsx('input flex items-center justify-between gap-2 pr-9 text-left', !value && 'text-ink-400')}>
          <span className="truncate">{value ? timeWords(value) : 'Any time'}</span>
          {!value && <Clock3 className="h-4 w-4 shrink-0 text-ink-500" aria-hidden />}
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setOpen(false) }} aria-label="Clear the due time"
            className="btn-press absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900">
            <X className="h-4 w-4" />
          </button>
        )}
      </span>
      {open && createPortal(
        // Portalled, but inside the window in React's tree: a press here never reaches the window's backdrop.
        <div className="fixed inset-0 z-[60]" onClick={e => { e.stopPropagation(); setOpen(false) }}>
          <div role="dialog" aria-label={label} onClick={e => e.stopPropagation()} style={at}
            className="time-pop fixed rounded-2xl border border-ink-200 bg-surface p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-1 pb-2">
              <span className="text-2xl font-semibold tabular-nums" style={{ color: value ? tone : undefined }}>
                {value ? timeWords(value).replace(/ (am|pm)$/, '') : '--:--'}
              </span>
              <span className="flex rounded-full bg-ink-100 p-0.5 text-xs font-bold">
                {(['AM', 'PM'] as const).map(x => {
                  // A sun for the morning, a moon for the evening (the user, 18 Nov: "am pm sun moon").
                  const on = (x === 'PM') === pm
                  const Icon = x === 'AM' ? Sun : Moon
                  return (
                    <button key={x} type="button" onClick={() => { setPm(x === 'PM'); if (value) set(null, null, x === 'PM') }}
                      className={clsx('btn-press inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 transition-colors duration-300', on ? (x === 'AM' ? 'text-amber-950' : 'text-white') : 'text-ink-500')}
                      style={on ? { background: x === 'AM' ? 'rgb(251 191 36)' : 'rgb(79 70 229)' } : undefined}>
                      <Icon key={String(on)} className={clsx('h-3.5 w-3.5', on && 'ampm-in')} aria-hidden />
                      {x}
                    </button>
                  )
                })}
              </span>
            </div>
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-label text-ink-500">Hour</p>
            <div className="grid grid-cols-6 gap-1">
              {HOURS.map(h => <button key={h} type="button" className={cell(h === h12)} style={onStyle(h === h12)} onClick={() => set(h, null)}>{h}</button>)}
            </div>
            <p className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-label text-ink-500">Minute</p>
            <div className="grid grid-cols-6 gap-1">
              {MINUTES.map(x => <button key={x} type="button" className={cell(x === m)} style={onStyle(x === m)} onClick={() => set(null, x)}>{pad(x)}</button>)}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => { onChange(''); setOpen(false) }}>Any time</button>
              <button type="button" className="btn-primary flex-1" style={{ background: tone, borderColor: tone, color: '#fff' }} onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
