import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * A task, or a small question about one, over the page.
 *
 * A sheet from the bottom on a phone, where the thumb is; a card in the
 * middle on a computer. Escape, the cross or a tap outside closes it, and
 * the page behind does not scroll while it is open. Travel Expense's, with
 * one change: the first box to type in takes the cursor, not the cross.
 */
export default function Dialog({
  title, icon, children, onClose, wide = false, label, accent = null, tools,
}: {
  title: ReactNode
  icon?: ReactNode
  children: ReactNode
  onClose: () => void
  wide?: boolean
  /** Said to a screen reader when the title is more than words. */
  label?: string
  /** A colour the window takes on, washing in from the top when it changes (the add window, by how critical). */
  accent?: string | null
  /** Small icon buttons beside the cross, such as the pencil to change a task. */
  tools?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const p = panel.current
    // Only a box marked to take the cursor takes it; otherwise the window itself, at its top. The task window put the
    // cursor in its comment box at the very end and opened scrolled down (the user, 18 Nov: "why opening a task is scrolled down?").
    const first = p?.querySelector<HTMLElement>('[data-autofocus]')
    if (first) first.focus()
    else { p?.focus({ preventScroll: true }); if (p) p.scrollTop = 0 }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', onKey)
    // The phone's back button closes the window rather than leaving the page (the user, 18 Nov: "if typed and click backed").
    const mark = Math.random().toString(36).slice(2)
    history.pushState({ ...(history.state ?? {}), cyrixDialog: mark }, '')
    let popped = false
    let alive = true
    // Back on a step inside the window (Mark complete, Change) returns to the task and the window stays: then its
    // place in the history is taken again, so the next Back closes it.
    const onPop = () => {
      popped = true
      close.current()
      setTimeout(() => { if (alive) { history.pushState({ ...(history.state ?? {}), cyrixDialog: mark }, ''); popped = false } }, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('keydown', onKey)
      alive = false
      window.removeEventListener('popstate', onPop)
      // Deferred: in development React opens every window twice, and the second push must not be undone.
      if (!popped) setTimeout(() => { if (history.state?.cyrixDialog === mark) history.back() }, 0)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-shade/60 sm:items-center sm:p-4"
    >
      <div
        ref={panel}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        data-accent={accent ? '' : undefined}
        style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}
        className={`dialog-panel outline-none animate-pop-in relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        {accent && <div key={accent} aria-hidden className="dialog-accent" />}
        <div className="relative flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2.5 text-base font-semibold text-ink-900">{icon}{title}</h2>
          <span className="-mr-1 -mt-1 flex shrink-0 items-center gap-1">
          {tools}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-press grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-5 w-5" />
          </button>
          </span>
        </div>
        <div className="relative mt-4 space-y-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
