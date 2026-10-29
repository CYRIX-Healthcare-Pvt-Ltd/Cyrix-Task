import { useMemo, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import { Check, ChevronDown, Search, UserPlus, Users } from 'lucide-react'
import Dialog from '@/components/Dialog'
import IconChip from '@/components/IconChip'
import Avatar from '@/components/Avatar'
import { CritPicker } from '@/components/Criticality'
import { Alert, Spinner } from '@/components/ui'
import { toast } from '@/components/Toast'
import { TaskFields, fieldsProblem, type Fields } from '@/components/TaskForm'
import { dayInSentence, firstName, today, useTaskAction, type Criticality, type Person } from '@/lib/tasks'

/**
 * A task the manager gives to one, several or all of the people who report to them (mt_0007; the user,
 * 24 Oct): its name, description, due date, how critical it is and remarks. Each person gets their own task,
 * "Assigned by" the manager; its due date and the rest stay as the manager set them, and once the person
 * marks it complete it waits for the manager's approval. Built for a hundred people: a search, and Select all.
 * Everyone below the manager can be given a task (mt_0013; the user, 29 Oct): their own reportees first, and a
 * team button on anyone with people under them opens that list beneath; the search finds anyone in the line.
 */
export default function AssignTask({ people, preselect, onClose }: {
  people: Person[]
  /** The person chosen on the board, already ticked. */
  preselect?: string | null
  onClose: () => void
}) {
  const now = today()
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(preselect ? [preselect] : []))
  const [q, setQ] = useState('')
  const [f, setF] = useState<Fields>({ title: '', details: '', due: now })
  const [sched, setSched] = useState(now)
  const [crit, setCrit] = useState<Criticality | null>(null)
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string | null>(null)
  const act = useTaskAction()

  const [opened, setOpened] = useState<Set<string>>(() => new Set())
  const under = useMemo(() => {
    const m = new Map<string, Person[]>()
    for (const p of people) if (p.manager_id) m.set(p.manager_id, [...(m.get(p.manager_id) ?? []), p])
    return m
  }, [people])
  // Each person with how deep they sit: my own reportees, then the teams opened under them; a search finds anyone.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle) return people.filter(p => `${p.full_name} ${p.ecode} ${p.designation ?? ''}`.toLowerCase().includes(needle)).map(p => ({ p, depth: 0 }))
    const ids = new Set(people.map(p => p.id))
    const out: Array<{ p: Person; depth: number }> = []
    const walk = (list: Person[], depth: number) => {
      for (const p of list) { out.push({ p, depth }); if (opened.has(p.id)) walk(under.get(p.id) ?? [], depth + 1) }
    }
    walk(people.filter(p => !p.manager_id || !ids.has(p.manager_id)), 0)
    return out
  }, [people, q, opened, under])
  const flipOpen = (id: string) => setOpened(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allShown = shown.length > 0 && shown.every(({ p }) => chosen.has(p.id))
  const flip = (id: string) => setChosen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const flipShown = () => setChosen(s => { const n = new Set(s); for (const { p } of shown) { if (allShown) n.delete(p.id); else n.add(p.id) } return n })

  const problem = chosen.size === 0 ? 'Choose who the task is for.' : (!sched ? 'Choose the scheduled date.' : sched < now ? 'The scheduled date cannot be before today.' : null) ?? fieldsProblem(f, now) ?? (f.details.trim() ? null : 'Add a task description.') ?? (f.due < sched ? 'The due date cannot be before the scheduled date.' : null) ?? (crit ? null : 'Choose how critical the task is.')
  const one = chosen.size === 1 ? people.find(p => chosen.has(p.id)) : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem || !crit) { setError(problem); return }
    setError(null)
    try {
      const n = await act.mutateAsync({ fn: 'task_assign', args: {
        p_people: [...chosen], p_title: f.title, p_details: f.details, p_due_on: f.due, p_criticality: crit, p_remarks: remarks, p_release_on: sched,
      } }) as number
      const who = n === 1 && one ? firstName(one.full_name) : `${n} people`
      toast(`Assigned to ${who}${sched > now ? `, from ${dayInSentence(sched, now)} 9 AM` : ''}, due ${dayInSentence(f.due, now)}`)
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Dialog title="Assign a task" icon={<IconChip icon={UserPlus} tone="teal" />} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="label !mb-0">Assign to</span>
            <span className="text-xs font-medium text-ink-500">{chosen.size} of {people.length} chosen</span>
          </div>
          <div className="mt-1.5 overflow-hidden rounded-xl border border-ink-200">
            <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400" placeholder="Name or E-code" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a person" />
              <button type="button" onClick={flipShown} disabled={!shown.length} className="btn-press shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50">
                {allShown ? 'Clear' : `Select ${q.trim() || opened.size ? 'these' : 'all'} ${shown.length}`}
              </button>
            </div>
            <ul className="max-h-56 divide-y divide-ink-100 overflow-y-auto">
              {shown.map(({ p, depth }) => {
                const on = chosen.has(p.id)
                const team = under.get(p.id)?.length ?? 0
                return (
                  <li key={p.id} className="flex items-stretch">
                    <button type="button" onClick={() => flip(p.id)} aria-pressed={on} style={{ paddingLeft: 12 + depth * 20 }}
                      className={clsx('flex min-w-0 flex-1 items-center gap-3 py-2 pr-3 text-left transition-colors', on ? 'bg-teal-50' : 'hover:bg-ink-50')}>
                      <span className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-md border-2', on ? 'border-teal-600 bg-teal-600 text-white' : 'border-ink-300')}>
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <Avatar name={p.full_name} src={p.avatar} className="!h-7 !w-7 !text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-900">{p.full_name}</span>
                        <span className="block truncate text-xs text-ink-500">{p.ecode}{p.designation ? ` · ${p.designation}` : ''}{q.trim() && p.manager_name ? ` · under ${firstName(p.manager_name)}` : ''}</span>
                      </span>
                    </button>
                    {team > 0 && !q.trim() && (
                      <button type="button" onClick={() => flipOpen(p.id)} aria-expanded={opened.has(p.id)} aria-label={`${firstName(p.full_name)}’s team, ${team}`}
                        className={clsx('btn-press flex shrink-0 items-center gap-1 px-3 text-xs font-semibold', opened.has(p.id) ? 'bg-teal-50 text-teal-700' : 'text-ink-500 hover:bg-ink-50')}>
                        <Users className="h-4 w-4" aria-hidden />{team}
                        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', opened.has(p.id) && 'rotate-180')} aria-hidden />
                      </button>
                    )}
                  </li>
                )
              })}
              {!shown.length && <li className="px-3 py-4 text-center text-sm text-ink-500">Nobody by that name</li>}
            </ul>
          </div>
        </div>

        <TaskFields value={f} onChange={setF} now={now} scheduled={{ value: sched, onChange: setSched }} />
        <div>
          <span className="label" id="assign-crit">How critical</span>
          <CritPicker value={crit} onChange={setCrit} labelledBy="assign-crit" />
        </div>
        <label className="block">
          <span className="label">Remarks</span>
          <textarea className="input min-h-[72px] resize-y" value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={2000} rows={2} placeholder="Anything they should keep in mind" />
        </label>

        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={act.isPending || !!problem}>
            {act.isPending ? <Spinner className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {chosen.size <= 1 ? (one ? `Assign to ${firstName(one.full_name)}` : 'Assign') : `Assign to ${chosen.size} people`}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
