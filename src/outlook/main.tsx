/*
  Outlook → Make task (the user, 26 Nov: "can we try outlook now"). Outlook shows this page beside an open mail; it
  reads only that mail (subject, sender, text) through Microsoft's office.js and fills My Task's form. For starts on
  Me (task_add); anyone below me can be picked instead (task_assign), the same rules as the app. Sign-in is the
  employee code and password, once, inside the panel. No mailbox password and no copy of the mail is kept.
*/
import '../lib/safeStorage'
import React, { useEffect, useMemo, useState, type FormEvent } from 'react'
import ReactDOM from 'react-dom/client'
import { BellRing, Check, ExternalLink, ListChecks, LogIn } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase, ecodeToEmail, friendlyError } from '@/lib/supabase'
import { CritPicker } from '@/components/Criticality'
import { today, type Criticality, type Me, type Person } from '@/lib/tasks'
import { Spinner } from '@/components/ui'
import { startTheme } from '@/lib/theme'
import '../index.css'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Office: any

type Mail = { subject: string; from: string; when: string; text: string }

/** The open mail, or null outside Outlook (a plain browser shows an empty form). */
function readMail(): Promise<Mail | null> {
  return new Promise((resolve) => {
    if (typeof Office === 'undefined') { resolve(null); return }
    const t = setTimeout(() => resolve(null), 4000)
    Office.onReady(() => {
      const item = Office.context?.mailbox?.item
      if (!item) { clearTimeout(t); resolve(null); return }
      const from = item.from ? `${item.from.displayName ?? ''}${item.from.emailAddress ? ` <${item.from.emailAddress}>` : ''}`.trim() : ''
      const when = item.dateTimeCreated ? new Date(item.dateTimeCreated).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : ''
      item.body.getAsync(Office.CoercionType.Text, (r: any) => {
        clearTimeout(t)
        resolve({ subject: item.subject ?? '', from, when, text: r?.status === 'succeeded' ? String(r.value ?? '') : '' })
      })
    })
  })
}

/** The mail's own words, tidied and cut to a size the details box keeps, with who sent it and when. */
function detailsOf(m: Mail): string {
  const body = m.text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  const head = [m.from && `From: ${m.from}`, m.when && `Mail of ${m.when}`].filter(Boolean).join('\n')
  const all = `${head}\n\n${body}`.trim()
  return all.length > 3000 ? `${all.slice(0, 3000)}…` : all
}

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

function MakeTask({ mail }: { mail: Mail | null }) {
  const [people, setPeople] = useState<Person[]>([])
  const [me, setMe] = useState<Me | null>(null)
  const [notify, setNotify] = useState(false)
  const [who, setWho] = useState('me')
  const [title, setTitle] = useState(mail?.subject ?? '')
  const [details, setDetails] = useState(mail ? detailsOf(mail) : '')
  const [due, setDue] = useState(today())
  const [crit, setCrit] = useState<Criticality | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => {
    supabase.rpc('task_people').then(({ data }) => setPeople((data ?? []) as Person[]))
    supabase.rpc('task_me').then(({ data }) => setMe((data ?? null) as Me | null))
  }, [])
  const sorted = useMemo(() => [...people].sort((a, b) => a.full_name.localeCompare(b.full_name)), [people])

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    if (!title.trim()) { setError('Write the task name.'); return }
    if (!crit) { setError('Pick how critical it is.'); return }
    setBusy(true)
    const { error: err } = who === 'me'
      ? await supabase.rpc('task_add', { p_title: title.trim(), p_details: details, p_due_on: due, p_criticality: crit, p_due_at: null, p_notify_manager: notify && !!me?.manager_id })
      : await supabase.rpc('task_assign', { p_people: [who], p_title: title.trim(), p_details: details, p_due_on: due, p_criticality: crit, p_remarks: '', p_release_on: today(), p_due_at: null })
    setBusy(false)
    if (err) { setError(friendlyError(err)); return }
    const p = people.find(x => x.id === who)
    setDone(p ? `Task given to ${p.full_name}.` : 'Task added to your list.')
  }

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <Check className="mx-auto h-8 w-8 text-emerald-600" />
        <p className="text-sm font-semibold text-ink-900">{done}</p>
        <a href="https://app.cyrix.in/tasks/" target="_blank" rel="noreferrer" className="btn-secondary inline-flex"><ExternalLink className="h-4 w-4" /> Open My Task</a>
        <button type="button" className="block w-full text-xs text-ink-500 underline" onClick={() => { setDone(null); setCrit(null); setWho('me'); setNotify(false) }}>Make another</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block"><span className="label">For</span>
        <select className="input mt-1" value={who} onChange={e => setWho(e.target.value)}>
          <option value="me">Me</option>
          {sorted.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.ecode})</option>)}
        </select></label>
      <label className="block"><span className="label">Task name</span>
        <input className="input mt-1" value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing" /></label>
      <label className="block"><span className="label">Details</span>
        <textarea className="input mt-1 min-h-28 text-xs" value={details} onChange={e => setDetails(e.target.value)} /></label>
      <label className="block"><span className="label">Due</span>
        <input className="input mt-1" type="date" value={due} min={today()} onChange={e => setDue(e.target.value)} /></label>
      {who === 'me' && me?.manager_id && (
        <button type="button" role="switch" aria-checked={notify} onClick={() => setNotify(v => !v)}
          className="flex w-full items-center gap-3 rounded-xl border border-ink-200 p-3 text-left hover:bg-ink-50">
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
      <div><span className="label" id="ol-crit">Criticality</span><div className="mt-1"><CritPicker value={crit} onChange={setCrit} labelledBy="ol-crit" /></div></div>
      <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
        {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} {who === 'me' ? 'Add task' : 'Assign'}
      </button>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
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
