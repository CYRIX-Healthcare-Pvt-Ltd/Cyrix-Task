import { Mail } from 'lucide-react'
import type { Task } from '@/lib/tasks'

/**
 * A task made from a mail (mt_0025): an envelope beside its name. For the task's maker it opens the mail in Outlook
 * in one press (the user, 27 Nov); for anyone else it only says which mail.
 */
export function MailMark({ task }: { task: Pick<Task, 'mail_subject' | 'mail_link'> }) {
  if (!task.mail_subject && !task.mail_link) return null
  const title = `Mail: ${task.mail_subject || '(no subject)'}`
  if (!task.mail_link) return <Mail className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-label={title}><title>{title}</title></Mail>
  return (
    <a href={task.mail_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={`Open mail · ${task.mail_subject ?? ''}`}
      aria-label={`Open the mail: ${task.mail_subject ?? ''}`}
      className="btn-press inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sky-600 hover:bg-sky-100 dark:hover:bg-sky-950">
      <Mail className="h-3.5 w-3.5" aria-hidden />
    </a>
  )
}
