import { useState, type FormEvent } from 'react'
import { BellRing, CalendarPlus } from 'lucide-react'
import TimePicker from '@/components/TimePicker'
import Dialog from '@/components/Dialog'
import IconChip from '@/components/IconChip'
import { CritPicker } from '@/components/Criticality'
import { Alert, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { addDays, clockNow, dayInSentence, daysBetween, timeWords, today, useMe, useTaskAction, type Criticality } from '@/lib/tasks'

/** The colour the add window takes on for each criticality (the user, 18 Nov: "when clicked critical, based on that theme"). */
export const ACCENT: Record<Criticality, string> = { critical: 'rgb(225 29 46)', moderate: 'rgb(245 158 11)', non_critical: 'rgb(100 116 139)' }

export interface Fields { title: string; details: string; due: string }

/** What the database will refuse, said before Save is pressed. */
export function fieldsProblem(f: Fields, now: string, dueUnchanged = false): string | null {
  if (!f.title.trim()) return 'Give the task a name.'
  if (!f.due) return 'Choose the due date.'
  return dueUnchanged ? null : dueProblem(f.due, now)
}

/** What the database will refuse of a new due date. */
export function dueProblem(due: string, now: string): string | null {
  if (!due) return 'Choose the due date.'
  if (due < now) return 'The due date cannot be in the past.'
  if (due > addDays(now, 366)) return 'The due date is more than a year away — check the year.'
  return null
}

/**
 * Task name, task description, due date — for a new task and for changing one.
 *
 * The due date is the day pressed on the calendar, said in words under the
 * box. There were Today and Tomorrow buttons beside it; on a task for the
 * 14th they read as if it were due today (the user, 5 Oct: "when i added a
 * task 14th, why due date is today and tomorrow"), so the date box is the
 * one way to move it. A due date the manager set is shown, not offered.
 */
export function TaskFields({ value, onChange, now, dueSetBy = null, scheduled, time }: {
  value: Fields; onChange: (f: Fields) => void; now: string
  /** A due time beside the due date: blank means any time that day (mt_0016). */
  time?: { value: string; onChange: (t: string) => void; accent?: string | null }
  /** An assigned task's scheduled date: the day it reaches the person at 9 AM (mt_0014). */
  scheduled?: { value: string; onChange: (day: string) => void }
  /** The manager who set the due date: then only they change it (mt_0005). */
  dueSetBy?: string | null
}) {
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
      {scheduled
        ? <div className="grid grid-cols-2 gap-3">
            <DueField label="Scheduled date" id="sched-words" value={scheduled.value} now={now}
              onChange={d => { scheduled.onChange(d); if (d && value.due < d) set('due')(d) }} />
            <DueField value={value.due} onChange={set('due')} now={now} min={scheduled.value || now} />
          </div>
        : time
        ? <div>
            <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3">
              <DueField value={value.due} onChange={set('due')} now={now} words={false} />
              <TimePicker value={time.value} onChange={time.onChange} accent={time.accent} />
            </div>
            {value.due && <p id="due-words" className="mt-1.5 text-xs font-medium text-ink-600">{dueWords(value.due, now)}{time.value ? ` · by ${timeWords(time.value)}` : ''}</p>}
          </div>
        : <DueField value={value.due} onChange={set('due')} now={now} setBy={dueSetBy} />}
    </>
  )
}

/**
 * The due date box, with the day in words under it: a date box writes
 * 08-10-2026, and which day that is should not need working out. Set by
 * the manager, it is shown greyed with who set it.
 */
export function DueField({ value, onChange, now, setBy = null, autoFocus = false, label = 'Due date', id = 'due-words', min = now, words = true }: {
  value: string; onChange: (day: string) => void; now: string; setBy?: string | null; autoFocus?: boolean; label?: string; id?: string; min?: string; words?: boolean
}) {
  return (
    <div>
      <label className="block">
        <span className="label">{label}</span>
        <input
          type="date"
          className={words ? 'input sm:w-64' : 'input'}
          value={value}
          min={min}
          max={addDays(now, 366)}
          onChange={e => onChange(e.target.value)}
          aria-describedby={id}
          disabled={!!setBy}
          required
          data-autofocus={autoFocus || undefined}
        />
      </label>
      {words && value && <p id={id} className="mt-1.5 text-xs font-medium text-ink-600">{dueWords(value, now)}</p>}
      {setBy && <p className="mt-1 text-xs text-ink-500">Set by {setBy}, so only {setBy} can change it</p>}
    </div>
  )
}

/** "Thursday, 8 October 2026 · in 3 days" */
export function dueWords(day: string, now: string): string {
  const gap = daysBetween(now, day)
  const long = new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const when = gap === 0 ? 'today' : gap === 1 ? 'tomorrow' : gap > 1 ? `in ${gap} days` : gap === -1 ? 'yesterday' : `${-gap} days ago`
  return `${long} · ${when}`
}

/**
 * What was typed in the add window when it was closed by the cross, a tap outside or the back button: it opens
 * again as it was left. Cancel and Add task start it afresh (the user, 18 Nov: "it should save as draft ... on
 * cancel it can from start"). Kept for the browser tab, so a reload keeps it too.
 */
interface Draft { f: Fields; crit: Criticality | null; time: string; notify: boolean }
const DRAFT_KEY = 'task-add-draft'
function readDraft(): Draft | null {
  try { const s = sessionStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) as Draft : null } catch { return null }
}
function writeDraft(d: Draft | null) {
  try { if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else sessionStorage.removeItem(DRAFT_KEY) } catch { /* kept only while open */ }
}

/** A new task, due on the day chosen on the calendar unless that day has passed. */
export function AddTask({ due, onClose, onAdded }: { due: string; onClose: () => void; onAdded: (due: string) => void }) {
  const now = today()
  const [draft] = useState(readDraft)
  const [f, setF] = useState<Fields>(() => draft ? { ...draft.f, due: !draft.f.due || draft.f.due < now ? now : draft.f.due } : { title: '', details: '', due: due < now ? now : due })
  const [crit, setCrit] = useState<Criticality | null>(draft?.crit ?? null)
  const [time, setTime] = useState(draft?.time ?? '')
  const [notify, setNotify] = useState(draft?.notify ?? false)
  const typed = !!(f.title.trim() || f.details.trim() || time || crit || notify)
  const keepAndClose = () => { writeDraft(typed ? { f, crit, time, notify } : null); onClose() }
  const cancel = () => { writeDraft(null); onClose() }
  const [error, setError] = useState<string | null>(null)
  const act = useTaskAction()
  const { data: me } = useMe()
  const problem = fieldsProblem(f, now) ?? (time && f.due === now && time <= clockNow() ? 'That due time has passed.' : null)
    ?? (f.details.trim() ? null : 'Add a task description.') ?? (crit ? null : 'Choose how critical the task is.')
  const accent = crit ? ACCENT[crit] : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem || !crit) { setError(problem); return }
    setError(null)
    try {
      await act.mutateAsync({ fn: 'task_add', args: { p_title: f.title, p_details: f.details, p_due_on: f.due, p_criticality: crit, p_due_at: time || null, p_notify_manager: notify && !!me?.manager_id } })
      writeDraft(null)
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
      icon={accent
        ? <span key={crit} aria-hidden className="crit-icon grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ color: accent, background: `color-mix(in srgb, ${accent} 16%, transparent)` }}><CalendarPlus className="h-4 w-4" /></span>
        : <IconChip icon={CalendarPlus} tone="sky" />}
      accent={accent}
      onClose={keepAndClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <TaskFields value={f} onChange={setF} now={now} time={{ value: time, onChange: setTime, accent }} />
        {me?.manager_id && (
          <button type="button" role="switch" aria-checked={notify} onClick={() => setNotify(v => !v)}
            className="btn-press flex w-full items-center gap-3 rounded-xl border border-ink-200 p-3 text-left hover:bg-ink-50">
            <BellRing className={notify ? 'h-5 w-5 shrink-0 text-teal-600' : 'h-5 w-5 shrink-0 text-ink-400'} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">Notify my manager</span>
              {me.manager_name && <span className="block truncate text-xs text-ink-500">{me.manager_name}</span>}
            </span>
            <span aria-hidden className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${notify ? 'bg-teal-600' : 'bg-ink-300'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-200 ${notify ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>
        )}
        <div>
          <span className="label" id="crit-label">How critical</span>
          <CritPicker value={crit} onChange={setCrit} labelledBy="crit-label" />
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={cancel}>Cancel</button>
          <button type="submit" className="btn-primary transition-colors duration-300" disabled={act.isPending || !!problem}
            style={accent && !problem ? { background: accent, color: crit === 'moderate' ? 'rgb(40 24 0)' : '#fff', borderColor: accent } : undefined}>
            {act.isPending ? <Spinner className="h-4 w-4" /> : <CalendarPlus className="h-4 w-4" />} Add task
          </button>
        </div>
      </form>
    </Dialog>
  )
}
