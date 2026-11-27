/*
  Outlook → Make task (the user, 26 Nov: "can we try outlook now"). Outlook shows this page beside an open mail; it
  reads only that mail's subject through Microsoft's office.js for the task name; Details is left for the user
  to type (26 Nov). For starts on
  Me (task_add); anyone below me can be picked instead (task_assign), the same rules as the app. Sign-in is the
  employee code and password, once, inside the panel. No mailbox password and no copy of the mail is kept.
*/
import '../lib/safeStorage'
import React, { useEffect, useMemo, useState, type FormEvent } from 'react'
import ReactDOM from 'react-dom/client'
import { BellRing, CalendarPlus, Check, ExternalLink, ListChecks, LogIn, UserPlus } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase, ecodeToEmail, friendlyError } from '@/lib/supabase'
import { CritPicker } from '@/components/Criticality'
import { clockNow, dayInSentence, firstName, timeWords, today, type Criticality, type Me, type Person } from '@/lib/tasks'
import { ACCENT, TaskFields, fieldsProblem, type Fields } from '@/components/TaskForm'
import { Spinner } from '@/components/ui'
import { startTheme } from '@/lib/theme'
import '../index.css'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Office: any

type Mail = { subject: string }

/** The open mail's subject, or null outside Outlook (a plain browser shows an empty form). */
function readMail(): Promise<Mail | null> {
  return new Promise((resolve) => {
    if (typeof Office === 'undefined') { resolve(null); return }
    const t = setTimeout(() => resolve(null), 4000)
    Office.onReady(() => {
      clearTimeout(t)
      const item = Office.context?.mailbox?.item
      resolve(item ? { subject: String(item.subject ?? '') } : null)
    })
  })
}

/** The mail's subject without the Re: / Fwd: in front. */
const titleOf = (s: string) => s.replace(/^\s*((re|fw|fwd|aw|wg)\s*:\s*)+/i, '').trim()

function SignIn() {
  const [ecode, setEcode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: ecodeToEmail(ecode), password })
    setBusy(false)
    if (err) setError(friendlyError(err))
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block"><span className="label">Employee code</span>
        <input className="input mt-1" value={ecode} onChange={e => setEcode(e.target.value)} autoComplete="username" placeholder="E1234" required /></label>
      <label className="block"><span className="label">Password</span>
        <input className="input mt-1" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
        {busy ? <Spinner className="h-4 w-4" /> : <LogIn className="h-4 w-4" />} Sign in
      </button>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </form>
  )
}

/**
 * The app's own add / assign form in the panel (the user, 27 Nov: "Due time also. Same form as in our app"):
 * task name, description, due date and time (and the scheduled date when it is for someone else), Notify my
 * manager, how critical, remarks — with the app's own checks.
 */
function MakeTask({ mail }: { mail: Mail | null }) {
  const now = today()
  const [people, setPeople] = useState<Person[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [notify, setNotify] = useState(false)
  const [who, setWho] = useState('me')
  const [f, setF] = useState<Fields>({ title: titleOf(mail?.subject ?? ''), details: '', due: now })  // details left for the user (26 Nov)
  const [time, setTime] = useState('')
  const [sched, setSched] = useState(now)
  const [remarks, setRemarks] = useState('')
  const [crit, setCrit] = useState<Criticality | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => {
    supabase.rpc('task_people').then(({ data }) => setPeople((data ?? []) as Person[]))
    supabase.rpc('task_me').then(({ data }) => setMe((data ?? null) as Me | null))
  }, [])
  const sorted = useMemo(() => [...people].sort((a, b) => a.full_name.localeCompare(b.full_name)), [people])
  const mine = who === 'me'
  const person = people.find(x => x.id === who)
  const accent = crit ? ACCENT[crit] : null

  const problem = mine
    ? fieldsProblem(f, now) ?? (time && f.due === now && time <= clockNow() ? 'That due time has passed.' : null)
      ?? (f.details.trim() ? null : 'Add a task description.') ?? (crit ? null : 'Choose how critical the task is.')
    : (!sched ? 'Choose the scheduled date.' : sched < now ? 'The scheduled date cannot be before today.' : null) ?? fieldsProblem(f, now)
      ?? (f.details.trim() ? null : 'Add a task description.') ?? (f.due < sched ? 'The due date cannot be before the scheduled date.' : null)
      ?? (crit ? null : 'Choose how critical the task is.') ?? (time && f.due === now && time <= clockNow() ? 'That due time has passed.' : null)
      ?? (time && f.due === sched && time <= '09:00' ? 'The task reaches them at 9 AM, so the due time must be after 9 AM.' : null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (problem || !crit) { setError(problem); return }
    setError(null); setBusy(true)
    const { error: err } = mine
      ? await supabase.rpc('task_add', { p_title: f.title.trim(), p_details: f.details, p_due_on: f.due, p_criticality: crit, p_due_at: time || null, p_notify_manager: notify && !!me?.manager_id })
      : await supabase.rpc('task_assign', { p_people: [who], p_title: f.title.trim(), p_details: f.details, p_due_on: f.due, p_criticality: crit, p_remarks: remarks, p_release_on: sched, p_due_at: time || null })
    setBusy(false)
    if (err) { setError(friendlyError(err)); return }
    const by = time ? ` by ${timeWords(time)}` : ''
    setDone(person ? `Assigned to ${firstName(person.full_name)}, due ${dayInSentence(f.due, now)}${by}.` : `Task added for ${dayInSentence(f.due, now)}${by}.`)
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <Check className="mx-auto h-8 w-8 text-emerald-600" />
        <p className="text-sm font-semibold text-ink-900">{done}</p>
        <a href="https://app.cyrix.in/tasks/" target="_blank" rel="noreferrer" className="btn-secondary inline-flex"><ExternalLink className="h-4 w-4" /> Open My Task</a>
        <button type="button" className="block w-full text-xs text-ink-500 underline" onClick={() => { setDone(null); setCrit(null); setWho('me'); setNotify(false); setTime(''); setRemarks(''); setSched(now); setF({ title: '', details: '', due: now }) }}>Make another</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="label">For</span>
        <select className="input" value={who} onChange={e => setWho(e.target.value)}>
          <option value="me">Me</option>
          {sorted.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.ecode})</option>)}
        </select></label>
      <TaskFields value={f} onChange={setF} now={now} time={{ value: time, onChange: setTime, accent }}
        scheduled={mine ? undefined : { value: sched, onChange: setSched }} />
      {mine && me?.manager_id && (
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
        <span className="label" id="ol-crit">How critical</span>
        <CritPicker value={crit} onChange={setCrit} labelledBy="ol-crit" />
      </div>
      {!mine && (
        <label className="block">
          <span className="label">Remarks</span>
          <textarea className="input min-h-[72px] resize-y" value={remarks} onChange={e => setRemarks(e.target.value)} maxLength={2000} rows={2} placeholder="Anything they should keep in mind" />
        </label>
      )}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      <button type="submit" className="btn-primary w-full justify-center transition-colors duration-300" disabled={busy || !!problem}
        style={mine && accent && !problem ? { background: accent, color: crit === 'moderate' ? 'rgb(40 24 0)' : '#fff', borderColor: accent } : undefined}>
        {busy ? <Spinner className="h-4 w-4" /> : mine ? <CalendarPlus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
        {mine ? 'Add task' : person ? `Assign to ${firstName(person.full_name)}` : 'Assign'}
      </button>
    </form>
  )
}

function Panel() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [mail, setMail] = useState<Mail | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    readMail().then(setMail)
    return () => data.subscription.unsubscribe()
  }, [])
  return (
    <div className="mx-auto max-w-md p-4">
      <div className="mb-4 flex items-center gap-2"><ListChecks className="h-5 w-5 text-ink-500" /><h1 className="text-base font-semibold text-ink-900">My Task</h1></div>
      {session === undefined || mail === undefined ? <Spinner /> : !session ? <SignIn /> : <MakeTask mail={mail} />}
    </div>
  )
}

startTheme()
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Panel /></React.StrictMode>)
