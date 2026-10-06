import clsx from 'clsx'
import { BellRing, Check, CheckCircle2, Circle, Clock3, MessageSquare, RotateCcw, Undo2 } from 'lucide-react'
import Avatar from '@/components/Avatar'
import { CritPill } from '@/components/Criticality'
import { TONE_CLASS } from '@/lib/tones'
import { daysLate, firstName, lookOf, shortDay, type EventKind, type Task } from '@/lib/tasks'

/** What a press on the row starts: the task itself, or straight into one of its actions. */
export type Opening = 'view' | 'complete' | 'remind' | 'approve'

/** The newest thing the other side did, said in a word or two. */
const NEW_WORD: Array<[EventKind, string]> = [
  ['reminder', 'New reminder'], ['sent_back', 'Sent back to you'], ['reopened', 'Reopened'], ['done', 'Just completed'],
  ['criticality', 'Criticality changed'], ['due', 'Due date changed'], ['comment', 'New comment'], ['approved', 'Just approved'],
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * One task in a list.
 *
 * The whole row opens the task. Two things on it act on their own: for the
 * person, the circle that marks it complete (it asks what they did); for
 * the manager, the bell that sends a reminder, or Approve once it is done.
 * On the team's list each task says first who entered it, name and E-code.
 */
export default function TaskRow({
  task: t, manage, now, showDue = false, showOwner = false, managerName, onOpen,
}: {
  task: Task
  /** Seen by the manager, not by the person whose task it is. */
  manage: boolean
  now: string
  showDue?: boolean
  showOwner?: boolean
  /** Whose approval the person's completed tasks wait for. */
  managerName?: string | null
  onOpen: (task: Task, opening?: Opening) => void
}) {
  const look = lookOf(t, now)
  const late = daysLate(t, now)
  const newWord = t.unseen > 0 ? NEW_WORD.find(([k]) => t.unseen_kinds?.includes(k))?.[1] ?? 'New' : null
  const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium'

  return (
    <li className={clsx(
      'group relative flex items-start gap-3 rounded-xl border bg-surface p-3.5 transition-colors hover:border-ink-300',
      look === 'overdue' ? 'border-cyrixRed-200' : 'border-ink-200/70',
    )}>
      {/* The circle: the person's way to mark it complete. Otherwise, where the task stands. */}
      {!manage && t.status === 'open' ? (
        <button
          type="button"
          onClick={() => onOpen(t, 'complete')}
          aria-label={`Mark “${t.title}” complete`}
          title="Mark complete"
          className={clsx(
            'btn-press relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-transparent transition-colors hover:border-green-600 hover:text-green-600',
            look === 'overdue' ? 'border-cyrixRed-600' : 'border-ink-300',
          )}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      ) : (
        <span className="mt-0.5 shrink-0" aria-hidden>
          {t.status === 'approved' ? <CheckCircle2 className="h-6 w-6 text-green-600" />
            : t.status === 'done' ? <Clock3 className="h-6 w-6 text-amber-500" />
            : <Circle className={clsx('h-6 w-6', look === 'overdue' ? 'text-cyrixRed-600' : 'text-sky-500')} />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {showOwner && (
          <p className="mb-1 flex min-w-0 items-center gap-1.5 text-xs">
            <Avatar name={t.employee_name} src={null} className="!h-5 !w-5 !text-[9px]" />
            <span className="truncate font-semibold text-ink-800">{t.employee_name}</span>
            <span className="shrink-0 tabular-nums text-ink-500">{t.employee_ecode}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => onOpen(t)}
          className={clsx(
            'block w-full text-left text-sm font-semibold text-ink-900 after:absolute after:inset-0 after:rounded-xl focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ink-400',
            t.status === 'approved' && 'text-ink-600',
          )}
        >
          <span className="line-clamp-2 break-words">{t.title}</span>
        </button>
        {t.details && <p className="mt-0.5 line-clamp-1 break-words text-sm text-ink-500">{t.details}</p>}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {newWord && (
            <span className={clsx(chip, TONE_CLASS.violet)}>
              <span className="unseen-dot h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden />
              {newWord}
            </span>
          )}
          <CritPill value={t.criticality} />
          {showDue && <span className={clsx(chip, TONE_CLASS.slate)}>Due {shortDay(t.due_on)}</span>}
          {look === 'overdue' && <span className={clsx(chip, TONE_CLASS.red)}>Overdue · {plural(late, 'day')}</span>}
          {look === 'waiting' && (
            <span className={clsx(chip, TONE_CLASS.amber)}>
              {manage ? 'Waiting for your approval' : managerName ? `Waiting for ${firstName(managerName)}’s approval` : 'Waiting for approval'}
            </span>
          )}
          {look === 'approved' && <span className={clsx(chip, TONE_CLASS.green)}>Approved</span>}
          {t.status !== 'open' && late > 0 && <span className={clsx(chip, TONE_CLASS.orange)}>Done {plural(late, 'day')} late</span>}
          {t.status === 'open' && t.sent_back > 0 && !newWord?.startsWith('Sent back') && (
            <span className={clsx(chip, TONE_CLASS.rose)}><Undo2 className="h-3 w-3" aria-hidden />Sent back</span>
          )}
          {t.status === 'open' && t.reopened > 0 && newWord !== 'Reopened' && (
            <span className={clsx(chip, TONE_CLASS.orange)}><RotateCcw className="h-3 w-3" aria-hidden />Reopened</span>
          )}
          {t.status === 'open' && t.reminders > 0 && (
            <span className={clsx(chip, TONE_CLASS.violet)} title={`Reminded ${plural(t.reminders, 'time')}`}>
              <BellRing className="h-3 w-3" aria-hidden />{t.reminders}<span className="sr-only"> {t.reminders === 1 ? 'reminder' : 'reminders'}</span>
            </span>
          )}
          {t.comments > 0 && (
            <span className={clsx(chip, TONE_CLASS.slate)} title={plural(t.comments, 'comment')}>
              <MessageSquare className="h-3 w-3" aria-hidden />{t.comments}<span className="sr-only"> {t.comments === 1 ? 'comment' : 'comments'}</span>
            </span>
          )}
        </div>
      </div>

      {manage && t.status === 'open' && (
        <button
          type="button"
          onClick={() => onOpen(t, 'remind')}
          className="btn-icon relative z-10 -mr-1 shrink-0"
          aria-label={`Send ${firstName(t.employee_name)} a reminder about “${t.title}”`}
          title="Send a reminder"
        >
          <BellRing className="h-[18px] w-[18px] text-violet-500" />
        </button>
      )}
      {manage && t.status === 'done' && (
        <button
          type="button"
          onClick={() => onOpen(t, 'approve')}
          className="btn-press relative z-10 shrink-0 self-center rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#15803d]"
        >
          Approve
        </button>
      )}
    </li>
  )
}
