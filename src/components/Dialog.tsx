import { useEffect, useRef, type ReactNode } from 'react'
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
  title, icon, children, onClose, wide = false, label,
}: {
  title: ReactNode
  icon?: ReactNode
  children: ReactNode
  onClose: () => void
  wide?: boolean
  /** Said to a screen reader when the title is more than words. */
  label?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const p = panel.current
    ;(p?.querySelector<HTMLElement>('[data-autofocus]') ?? p?.querySelector<HTMLElement>('input, select, textarea') ?? p?.querySelector<HTMLElement>('button'))?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
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
        onClick={e => e.stopPropagation()}
        className={`animate-pop-in max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2.5 text-base font-semibold text-ink-900">{icon}{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn-press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4 space-y-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
