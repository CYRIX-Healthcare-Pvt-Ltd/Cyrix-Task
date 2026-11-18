import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Check, ChevronDown } from 'lucide-react'

export interface DropOption<K extends string> { key: K; word: string; mark?: ReactNode; count?: number }

/**
 * A press-to-open list of choices, one chosen (the user, 18 Nov: "make total task pending etc as drop down
 * beautifully"). The chosen one is on the button with its mark and count; the list drops under it, a tick on the
 * chosen. A press outside or Escape closes it.
 */
export default function DropPick<K extends string>({ label, value, options, onChange, align = 'left', className, icon }: {
  label: string
  value: K
  options: Array<DropOption<K>>
  onChange: (k: K) => void
  align?: 'left' | 'right'
  className?: string
  /** Shown on the button in place of the chosen one's mark. */
  icon?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const cur = options.find(o => o.key === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', out)
    window.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', out); window.removeEventListener('keydown', key, true) }
  }, [open])

  return (
    <div ref={box} className={clsx('relative min-w-0', className)}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`${label}: ${cur.word}`} onClick={() => setOpen(o => !o)}
        className={clsx('btn-press flex w-full items-center gap-2 rounded-xl border bg-surface px-3 py-2.5 text-left text-sm font-semibold text-ink-900 transition-colors',
          open ? 'border-ink-400 ring-2 ring-ink-200' : 'border-ink-200 hover:bg-ink-50')}>
        {icon ?? cur.mark}
        <span className="min-w-0 flex-1 truncate">{cur.word}</span>
        {cur.count != null && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs tabular-nums text-ink-600">{cur.count}</span>}
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-ink-500 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul role="listbox" aria-label={label}
          className={clsx('drop-pop absolute z-40 mt-1.5 min-w-full overflow-hidden rounded-xl border border-ink-200 bg-surface p-1 shadow-2xl', align === 'right' ? 'right-0' : 'left-0')}>
          {options.map((o, i) => {
            const on = o.key === value
            return (
              <li key={o.key} role="option" aria-selected={on} style={{ animationDelay: `${i * 30}ms` }} className="drop-item">
                <button type="button" onClick={() => { onChange(o.key); setOpen(false) }}
                  className={clsx('btn-press flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2.5 text-left text-sm',
                    on ? 'bg-ink-100 font-semibold text-ink-900' : 'text-ink-700 hover:bg-ink-50')}>
                  {o.mark}
                  <span className="flex-1">{o.word}</span>
                  {o.count != null && <span className="tabular-nums text-ink-400">{o.count}</span>}
                  <Check className={clsx('h-4 w-4 shrink-0', on ? 'text-teal-600' : 'invisible')} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
