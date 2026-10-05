import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * A line that says a thing was done — "Reminder sent to Amal" — and goes.
 *
 * The dialog that did it has closed by then, so without this a press
 * would leave nothing on screen to say it worked.
 */
type Note = { id: number; text: string }
let current: Note | null = null
const listeners = new Set<() => void>()

export function toast(text: string) {
  current = { id: Date.now(), text }
  listeners.forEach(l => l())
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

export default function Toaster() {
  const note = useSyncExternalStore(subscribe, () => current)
  const [shown, setShown] = useState<Note | null>(null)

  useEffect(() => {
    if (!note) return
    setShown(note)
    const t = setTimeout(() => setShown(s => (s?.id === note.id ? null : s)), 2600)
    return () => clearTimeout(t)
  }, [note])

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-8">
      {shown && (
        <div key={shown.id} className="animate-toast-in rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-onInk shadow-lg">
          {shown.text}
        </div>
      )}
    </div>
  )
}
