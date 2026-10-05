import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import clsx from 'clsx'
import {
  ArrowLeft, BadgeCheck, BellRing, CheckCircle2, Circle, Clock3, MessageSquare, Gauge, Pencil, Plus, Send, Trash2, Undo2,
  type LucideIcon,
} from 'lucide-react'
import Dialog from '@/components/Dialog'
import { CritPicker, CritPill, critOf } from '@/components/Criticality'
import IconChip from '@/components/IconChip'
import { Alert, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { TaskFields, fieldsProblem, type Fields } from '@/components/TaskForm'
import type { Opening } from '@/components/TaskRow'
import { useAuth } from '@/contexts/AuthContext'
import { TONE_CLASS, type Tone } from '@/lib/tones'
import { dateTime } from '@/lib/when'
import {
  dayInSentence, dayTitle, daysLate, firstName, lookOf, today, useHistory, useTaskAction,
  type Action, type Criticality, type EventKind, type Look, type Me, type Task, type TaskEvent,
} from '@/lib/tasks'

type Step = 'view' | 'complete' | 'edit' | 'remind' | 'approve' | 'sendback' | 'delete'

const STEP_TITLE: Record<Exclude<Step, 'view'>, string> = {
  complete: 'Mark complete', edit: 'Change the task', remind: 'Send a reminder',
  approve: 'Approve', sendback: 'Send back', delete: 'Delete the task',
}

const LOOK_ICON: Record<Look, [LucideIcon, Tone, string]> = {
  todo: [Circle, 'sky', 'To do'],
  overdue: [Circle, 'red', 'Overdue'],
  waiting: [Clock3, 'amber', 'Waiting for approval'],
  approved: [CheckCircle2, 'green', 'Approved'],
}

const EVENT: Record<EventKind, [LucideIcon, Tone, string]> = {
  created: [Plus, 'slate', 'added the task'],
  edited: [Pencil, 'slate', 'changed the task'],
  criticality: [Gauge, 'orange', 'changed how critical it is'],
  comment: [MessageSquare, 'indigo', 'commented'],
  reminder: [BellRing, 'violet', 'sent a reminder'],
  done: [CheckCircle2, 'amber', 'marked it complete'],
  sent_back: [Undo2, 'rose', 'sent it back'],
  approved: [BadgeCheck, 'green', 'approved it'],
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * A task: what it is, where it stands, its history and comments, and what
 * the reader may do with it.
 *
 * The person whose task it is marks it complete (saying what they did) or
 * changes it while it is to do. Their reporting manager sends a reminder,
 * approves it or sends it back, and may delete it. Either writes a comment.
 * Each action is a step inside the same window, with Back to the task.
 */
export default function TaskDialog({
  task: t, manage, me, opening = 'view', onClose,
}: {
  task: Task
  /** The reporting manager is reading, not the person whose task it is. */
  manage: boolean
  me: Me | null | undefined
  opening?: Opening
  onClose: () => void
}) {
  const { employee } = useAuth()
  const [step, setStep] = useState<Step>(opening)
  const [error, setError] = useState<string | null>(null)
  const act = useTaskAction()
  const seen = useTaskAction()
  const now = today()
  const look = lookOf(t, now)
  const late = daysLate(t, now)
  const owner = firstName(t.employee_name)
  const manager = firstName(me?.manager_name)

  // Opening it is seeing it: what the other side did is no longer new.
  const markedSeen = useRef(false)
  useEffect(() => {
    if (markedSeen.current || t.unseen === 0) return
    markedSeen.current = true
    seen.mutate({ fn: 'task_seen', args: { p_task_id: t.id } })
  }, [t.id, t.unseen, seen])

  const go = (s: Step) => { setError(null); setStep(s) }

  /** Runs one action; true when it went through, the database's reason on screen when not. */
  const run = async (a: Action, said: string) => {
    setError(null)
    try {
      await act.mutateAsync(a)
      toast(said)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  const [LookIcon, lookTone, lookWord] = LOOK_ICON[look]
  const title = step === 'view' ? t.title : STEP_TITLE[step]

  return (
    <Dialog
      title={<span className="break-words">{title}</span>}
      label={step === 'view' ? `Task: ${t.title}` : `${title}: ${t.title}`}
      icon={<IconChip icon={step === 'view' ? LookIcon : STEP_ICON[step]} tone={step === 'view' ? lookTone : STEP_TONE[step]} />}
      onClose={onClose}
      wide={step === 'view'}
    >
      {step !== 'view' && (
        <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm">
          <p className="break-words font-medium text-ink-900">{t.title}</p>
          <p className="text-xs text-ink-500">{manage ? `${t.employee_name} · ` : ''}Due {dayInSentence(t.due_on, now)}</p>
        </div>
      )}

      {step === 'view' && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={lookTone}>{look === 'waiting' ? (manage ? 'Waiting for your approval' : manager ? `Waiting for ${manager}’s approval` : lookWord) : lookWord}</Chip>
            <Chip tone={look === 'overdue' ? 'red' : 'slate'}>Due {dayTitle(t.due_on, now)}</Chip>
            {look === 'overdue' && <Chip tone="red">{plural(late, 'day')} overdue</Chip>}
            {t.status !== 'open' && late > 0 && <Chip tone="orange">Done {plural(late, 'day')} late</Chip>}
            {t.status === 'open' && t.reminders > 0 && <Chip tone="violet"><BellRing className="h-3 w-3" aria-hidden /> Reminded {plural(t.reminders, 'time')}</Chip>}
          </div>

          {manage && <p className="text-sm text-ink-600">Entered by <span className="font-semibold text-ink-900">{t.employee_name}</span> · {t.employee_ecode}</p>}

          <CriticalityRow task={t} manage={manage} owner={owner} />

          {t.details
            ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-800">{t.details}</p>
            : <p className="text-sm text-ink-400">No description.</p>}

          {t.status !== 'open' && t.done_note && (
            <div className={clsx('rounded-xl border p-3.5', t.status === 'approved' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50')}>
              <p className="label !mb-1">{manage ? `What ${owner} did` : 'What you did'}</p>
              <p className="whitespace-pre-wrap break-words text-sm text-ink-900">{t.done_note}</p>
              <p className="mt-2 text-xs text-ink-500">
                Marked complete {t.done_at ? dateTime(t.done_at) : ''}
                {t.status === 'approved' && t.approved_at ? ` · approved by ${firstName(t.approved_by_name) || 'the manager'}, ${dateTime(t.approved_at)}` : ''}
              </p>
            </div>
          )}

          {error && <Alert kind="error">{error}</Alert>}

          <div className="flex flex-wrap gap-2">
            {!manage && t.status === 'open' && (
              <>
                <button type="button" className="btn-primary" onClick={() => go('complete')}>
                  <CheckCircle2 className="h-4 w-4" /> Mark complete
                </button>
                <button type="button" className="btn-secondary" onClick={() => go('edit')}>
                  <Pencil className="h-4 w-4" /> Change
                </button>
              </>
            )}
            {!manage && t.status === 'done' && (
              <p className="text-sm text-ink-600">
                {manager ? `${manager} approves it, or sends it back to you with a reason.` : 'It waits for your reporting manager’s approval.'}
              </p>
            )}
            {manage && t.status === 'open' && (
              <button type="button" className="btn-secondary" onClick={() => go('remind')}>
                <BellRing className="h-4 w-4 text-violet-500" /> Send reminder
              </button>
            )}
            {manage && t.status === 'done' && (
              <>
                <button type="button" className="btn-primary" onClick={() => go('approve')}>
                  <BadgeCheck className="h-4 w-4" /> Approve
                </button>
                <button type="button" className="btn-secondary" onClick={() => go('sendback')}>
                  <Undo2 className="h-4 w-4 text-rose-600" /> Send back
                </button>
              </>
            )}
          </div>

          <History task={t} manage={manage} myId={employee?.id ?? null} owner={owner} manager={manager} />

          {manage && (
            <div className="border-t border-ink-100 pt-3">
              <button type="button" onClick={() => go('delete')} className="btn-press inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-cyrixRed-600 hover:bg-cyrixRed-50">
                <Trash2 className="h-4 w-4" /> Delete task
              </button>
            </div>
          )}
        </>
      )}

      {step === 'complete' && (
        <NoteForm
          label="What did you do to complete it?"
          placeholder="For example: checked the 14 PM dates with the hospital and sent the list"
          required minLength={3}
          help={!me?.manager_name
            ? 'Nobody is set as your reporting manager, so nobody can approve it. Tell HR.'
            : me.manager_has_module
              ? `It then waits for ${manager}’s approval.`
              : `${manager} does not have My Task yet, so it waits for approval until the software administrator gives it to ${manager}.`}
          button={<><CheckCircle2 className="h-4 w-4" /> Mark complete</>}
          busy={act.isPending} error={error} onBack={() => go('view')}
          onSubmit={async note => { if (await run({ fn: 'task_done', args: { p_task_id: t.id, p_note: note } }, 'Marked complete')) onClose() }}
        />
      )}

      {step === 'edit' && (
        <EditForm task={t} now={now} busy={act.isPending} error={error} onBack={() => go('view')}
          onSubmit={async f => { if (await run({ fn: 'task_edit', args: { p_task_id: t.id, p_title: f.title, p_details: f.details, p_due_on: f.due } }, 'Task changed')) go('view') }}
        />
      )}

      {step === 'remind' && (
        <NoteForm
          label="Add a line"
          placeholder="For example: needed by 3 PM today"
          help={`${owner} sees it on this task, marked new, the next time ${owner} opens My Task.${t.reminders > 0 && t.last_reminded_at ? ` Reminded ${plural(t.reminders, 'time')} so far, last ${dateTime(t.last_reminded_at)}.` : ''}`}
          button={<><BellRing className="h-4 w-4" /> Send reminder</>}
          busy={act.isPending} error={error} onBack={() => go('view')}
          onSubmit={async note => { if (await run({ fn: 'task_remind', args: { p_task_id: t.id, p_note: note || null } }, `Reminder sent to ${owner}`)) onClose() }}
        />
      )}

      {step === 'approve' && (
        <>
          {t.done_note && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
              <p className="label !mb-1">What {owner} did</p>
              <p className="whitespace-pre-wrap break-words text-sm text-ink-900">{t.done_note}</p>
            </div>
          )}
          <NoteForm
            label={`A word for ${owner}`}
            placeholder="For example: well done"
            help="Approving closes the task."
            button={<><BadgeCheck className="h-4 w-4" /> Approve</>}
            busy={act.isPending} error={error} onBack={() => go('view')}
            onSubmit={async note => { if (await run({ fn: 'task_approve', args: { p_task_id: t.id, p_note: note || null } }, `Approved — ${owner}’s task is closed`)) onClose() }}
          />
        </>
      )}

      {step === 'sendback' && (
        <NoteForm
          label="Why is it going back?"
          placeholder="For example: attach the hospital’s reply too"
          required minLength={1}
          help={`${owner} sees the reason, and the task is to do again.`}
          button={<><Undo2 className="h-4 w-4" /> Send back</>}
          busy={act.isPending} error={error} onBack={() => go('view')}
          onSubmit={async note => { if (await run({ fn: 'task_send_back', args: { p_task_id: t.id, p_note: note } }, `Sent back to ${owner}`)) onClose() }}
        />
      )}

      {step === 'delete' && (
        <>
          <Alert kind="warning" title="It goes for good">
            The task, its history and its comments are removed for you and for {owner}. A copy is kept in the audit log.
          </Alert>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => go('view')}><ArrowLeft className="h-4 w-4" /> Back</button>
            <button
              type="button" className="btn-danger" disabled={act.isPending} data-autofocus
              onClick={async () => { if (await run({ fn: 'task_delete', args: { p_task_id: t.id } }, 'Task deleted')) onClose() }}
            >
              {act.isPending ? <Spinner className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />} Delete task
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}

const STEP_ICON: Record<Exclude<Step, 'view'>, LucideIcon> = {
  complete: CheckCircle2, edit: Pencil, remind: BellRing, approve: BadgeCheck, sendback: Undo2, delete: Trash2,
}
const STEP_TONE: Record<Exclude<Step, 'view'>, Tone> = {
  complete: 'green', edit: 'slate', remind: 'violet', approve: 'green', sendback: 'rose', delete: 'red',
}

/**
 * How critical the task is. The person changes it while it is to do; their
 * manager until it is approved. Each change is a step in the history.
 */
function CriticalityRow({ task: t, manage, owner }: { task: Task; manage: boolean; owner: string }) {
  const act = useTaskAction()
  const [error, setError] = useState<string | null>(null)
  // Once the manager has set it, it is the manager's to change (mt_0004; the user, 5 Oct).
  const setByManager = !manage && !!t.criticality_set_by
  const canChange = manage ? t.status !== 'approved' : t.status === 'open' && !setByManager
  if (!canChange) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="label !mb-0">How critical</span>
        <CritPill value={t.criticality} />
        {setByManager && t.status === 'open' && (
          <span className="text-xs text-ink-500">Set by {t.criticality_set_by}, so only {t.criticality_set_by} can change it</span>
        )}
      </div>
    )
  }
  const change = async (c: Criticality) => {
    setError(null)
    try {
      await act.mutateAsync({ fn: 'task_set_criticality', args: { p_task_id: t.id, p_criticality: c } })
      toast(manage ? `Now ${critOf(c).word} — ${owner} sees the change` : `Now ${critOf(c).word}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="space-y-2">
      <span className="label !mb-0" id={`crit-${t.id}`}>How critical</span>
      <CritPicker value={t.criticality} onChange={c => { void change(c) }} disabled={act.isPending} labelledBy={`crit-${t.id}`} />
      {error && <Alert kind="error">{error}</Alert>}
    </div>
  )
}

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_CLASS[tone])}>{children}</span>
}

/** One box to write in and the button that sends it — every action that carries words. */
function NoteForm({
  label, placeholder, help, button, required = false, minLength = 0, busy, error, onBack, onSubmit,
}: {
  label: string
  placeholder: string
  help?: string
  button: ReactNode
  required?: boolean
  minLength?: number
  busy: boolean
  error: string | null
  onBack: () => void
  onSubmit: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const short = required && note.trim().length < minLength
  const submit = (e: FormEvent) => { e.preventDefault(); if (!short) onSubmit(note.trim()) }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="label">{label}</span>
        <textarea
          className="input min-h-[96px] resize-y"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={placeholder}
          maxLength={2000}
          rows={4}
          required={required}
          data-autofocus
        />
      </label>
      {help && <p className="text-xs leading-relaxed text-ink-500">{help}</p>}
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</button>
        <button type="submit" className="btn-primary" disabled={busy || short}>
          {busy ? <Spinner className="h-4 w-4" /> : null}{button}
        </button>
      </div>
    </form>
  )
}

function EditForm({ task: t, now, busy, error, onBack, onSubmit }: {
  task: Task; now: string; busy: boolean; error: string | null; onBack: () => void; onSubmit: (f: Fields) => void
}) {
  const [f, setF] = useState<Fields>({ title: t.title, details: t.details ?? '', due: t.due_on })
  const problem = fieldsProblem(f, now, f.due === t.due_on)
  return (
    <form onSubmit={e => { e.preventDefault(); if (!problem) onSubmit(f) }} className="space-y-4">
      <TaskFields value={f} onChange={setF} now={now} />
      <p className="text-xs text-ink-500">What you change is kept in the task’s history.</p>
      {(error || (problem && f.title.trim())) && <Alert kind="error">{error ?? problem}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn-secondary" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Back</button>
        <button type="submit" className="btn-primary" disabled={busy || !!problem}>
          {busy ? <Spinner className="h-4 w-4" /> : <Pencil className="h-4 w-4" />} Save changes
        </button>
      </div>
    </form>
  )
}

/** Every step, oldest first, with who took it; and a box to comment at the end. */
function History({ task: t, manage, myId, owner, manager }: {
  task: Task; manage: boolean; myId: string | null; owner: string; manager: string
}) {
  const { data, isLoading, error } = useHistory(t.id)
  const act = useTaskAction()
  const [note, setNote] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const listEnd = useRef<HTMLLIElement>(null)

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    setFailed(null)
    try {
      await act.mutateAsync({ fn: 'task_comment', args: { p_task_id: t.id, p_note: note.trim() } })
      setNote('')
      requestAnimationFrame(() => listEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    } catch (err) {
      setFailed((err as Error).message)
    }
  }

  const to = manage ? owner : manager || 'your manager'
  return (
    <section className="space-y-3 border-t border-ink-100 pt-4" aria-label="History and comments">
      <h3 className="label !mb-0">History and comments</h3>
      {isLoading && <Spinner className="h-4 w-4 text-ink-400" />}
      {error && <Alert kind="error">{(error as Error).message}</Alert>}
      {data && (
        <ol className="space-y-3">
          {data.map(e => <EventLine key={e.id} e={e} mine={e.by_id === myId} />)}
          <li ref={listEnd} aria-hidden />
        </ol>
      )}
      <form onSubmit={send} className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Comment to {to}</span>
          <textarea
            className="input min-h-[44px] resize-y"
            rows={1}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={`Write to ${to}`}
            maxLength={2000}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send(e) }}
          />
        </label>
        <button type="submit" className="btn-secondary h-[44px] shrink-0" disabled={act.isPending || !note.trim()} aria-label="Send the comment">
          {act.isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
      {failed && <Alert kind="error">{failed}</Alert>}
    </section>
  )
}

function EventLine({ e, mine }: { e: TaskEvent; mine: boolean }) {
  const [Icon, tone, verb] = EVENT[e.kind]
  const who = mine ? 'You' : firstName(e.by_name) || 'Someone'
  if (e.kind === 'criticality' && e.note?.includes(' → ')) {
    const [from, to] = e.note.split(' → ')
    return (
      <li className="flex gap-3">
        <IconChip icon={Icon} tone={tone} className="mt-0.5" />
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <span className="font-semibold text-ink-900">{who}</span>{' '}
          <span className="text-ink-600">changed it to</span>{' '}
          <span className="font-semibold text-ink-900">{to}</span>
          <span className="text-ink-500"> · was {from}</span>
          <span className="whitespace-nowrap text-xs text-ink-400"> · {dateTime(e.at)}</span>
        </p>
      </li>
    )
  }
  return (
    <li className="flex gap-3">
      <IconChip icon={Icon} tone={tone} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          <span className="font-semibold text-ink-900">{who}</span>{' '}
          <span className="text-ink-600">{verb}</span>
          <span className="whitespace-nowrap text-xs text-ink-400"> · {dateTime(e.at)}</span>
        </p>
        {e.note && (
          <p className={clsx(
            'mt-1 whitespace-pre-wrap break-words text-sm',
            e.kind === 'comment' || e.kind === 'reminder' || e.kind === 'sent_back' || e.kind === 'approved'
              ? 'rounded-lg bg-ink-50 px-3 py-2 text-ink-800'
              : 'text-ink-700',
          )}>
            {e.note}
          </p>
        )}
      </div>
    </li>
  )
}
