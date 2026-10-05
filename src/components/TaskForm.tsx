import { useState, type FormEvent } from 'react'
import { CalendarPlus } from 'lucide-react'
import Dialog from '@/components/Dialog'
import IconChip from '@/components/IconChip'
import { CritPicker } from '@/components/Criticality'
import { Alert, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { addDays, dayInSentence, daysBetween, today, useTaskAction, type Criticality } from '@/lib/tasks'

export interface Fields { title: string; details: string; due: string }

/** What the database will refuse, said before Save is pressed. */
export function fieldsProblem(f: Fields, now: string, dueUnchanged = false): string | null {
  if (!f.title.trim()) return 'Give the task a name.'
  if (!f.due) return 'Choose the due date.'
  if (!dueUnchanged && f.due < now) return 'The due date cannot be in the past.'
  if (!dueUnchanged && f.due > addDays(now, 366)) return 'The due date is more than a year away — check the year.'
  return null
}

/**
 * Task name, task description, due date — for a new task and for changing one.
 *
 * The due date is the day pressed on the calendar, said in words under the
 * box. There were Today and Tomorrow buttons beside it; on a task for the
 * 14th they read as if it were due today (the user, 5 Oct: "when i added a
 * task 14th, why due date is today and tomorrow"), so the date box is the
 * one way to move it.
 */
export function TaskFields({ value, onChange, now }: { value: Fields; onChange: (f: Fields) => void; now: string }) {
  const set = (k: keyof Fields) => (v: string) => onChange({ ...value, [k]: v })
  return (
    <>
      <label className="block">
        <span className="label">Task name</span>
        <input
          className="input"
          value={value.title}
          onChange={e => set('title')(e.target.value)}
          maxLength={200}
          placeholder="What is to be done"
          data-autofocus
          required
        />
      </label>
      <label className="block">
        <span className="label">Task description</span>
        <textarea
          className="input min-h-[84px] resize-y"
          value={value.details}
          onChange={e => set('details')(e.target.value)}
          maxLength={4000}
          rows={3}
          placeholder="Anything that helps — where, for whom, what is needed"
        />
      </label>
      <div>
        <label className="block">
          <span className="label">Due date</span>
          <input
            type="date"
            className="input sm:w-64"
            value={value.due}
            min={now}
            max={addDays(now, 366)}
            onChange={e => set('due')(e.target.value)}
            aria-describedby="due-words"
            required
          />
        </label>
        {/* The day in words: a date box writes 08-10-2026, and which day that is should not need working out. */}
        {value.due && <p id="due-words" className="mt-1.5 text-xs font-medium text-ink-600">{dueWords(value.due, now)}</p>}
      </div>
    </>
  )
}

/** "Thursday, 8 October 2026 · in 3 days" */
function dueWords(day: string, now: string): string {
  const gap = daysBetween(now, day)
  const long = new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const when = gap === 0 ? 'today' : gap === 1 ? 'tomorrow' : gap > 1 ? `in ${gap} days` : gap === -1 ? 'yesterday' : `${-gap} days ago`
  return `${long} · ${when}`
}

/** A new task, due on the day chosen on the calendar unless that day has passed. */
export function AddTask({ due, onClose, onAdded }: { due: string; onClose: () => void; onAdded: (due: string) => void }) {
  const now = today()
  const [f, setF] = useState<Fields>({ title: '', details: '', due: due < now ? now : due })
  const [crit, setCrit] = useState<Criticality | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = useTaskAction()
  const problem = fieldsProblem(f, now) ?? (crit ? null : 'Choose how critical the task is.')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem || !crit) { setError(problem); return }
    setError(null)
    try {
      await act.mutateAsync({ fn: 'task_add', args: { p_title: f.title, p_details: f.details, p_due_on: f.due, p_criticality: crit } })
      toast(`Task added for ${dayInSentence(f.due, now)}`)
      onAdded(f.due)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog
      title={f.due ? `Add a task for ${dayInSentence(f.due, now)}` : 'Add a task'}
      icon={<IconChip icon={CalendarPlus} tone="sky" />}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <TaskFields value={f} onChange={setF} now={now} />
        <div>
          <span className="label" id="crit-label">How critical</span>
          <CritPicker value={crit} onChange={setCrit} labelledBy="crit-label" />
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={act.isPending || !!problem}>
            {act.isPending ? <Spinner className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />} Add task
          </button>
        </div>
      </form>
    </Dialog>
  )
}
