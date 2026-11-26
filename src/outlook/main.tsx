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
      const from = item.from ? String(item.from.displayName || item.from.emailAddress || '').trim() : ''
      const when = item.dateTimeCreated ? new Date(item.dateTimeCreated).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : ''
      item.body.getAsync(Office.CoercionType.Text, (r: any) => {
        clearTimeout(t)
        resolve({ subject: item.subject ?? '', from, when, text: r?.status === 'succeeded' ? String(r.value ?? '') : '' })
      })
    })
  })
}

/* The user, 26 Nov ("why details like this?"): only the latest message — no earlier mails of the thread, no
   "Dear …," greeting, no "Regards …" signature — under one short line of who sent it and when. */
const QUOTED = [/^\s*(From|Sent|De|Von)\s*:/i, /^\s*-{2,}\s*(Original|Forwarded) Message/i, /^\s*On .+wrote:\s*$/i, /^\s*_{8,}\s*$/]
const GREETING = /^\s*(dear|hi|hello|hai|hey|respected|good (morning|afternoon|evening))\b[^\n]{0,50}$/i
const SIGN_OFF = /^\s*(thanks\s*(and|&|n)\s*regards|thanks\s*[,.!]?\s*$|thank you\s*[,!]?\s*$|regards|best regards|warm regards|kind regards|with regards|best wishes|sincerely|yours (truly|faithfully|sincerely))/i
/* Company notices at the foot of a mail (26 Nov: "still same" — a confidentiality notice filled Details). */
const NOTICE = /(disclaimer|intended recipient|confidential(ity)? notice|confidential or privileged|privileged (and confidential|information)|strictly prohibited|virus(es)? (free|scan)|think before you print|consider the environment)/i
/* An "external sender" warning some mail servers put on top. */
const BANNER = /^\s*(\[?external\]?|caution\s*:|warning\s*:)/i

/** One mail of the thread, cleaned: greeting, sign-off and footer notices taken off. */
function cleanPart(lines: string[]): string {
  lines = [...lines]
  while (lines.length && (!lines[0].trim() || BANNER.test(lines[0]))) lines.shift()
  if (lines.length && GREETING.test(lines[0])) lines.shift()
  // a short "Thanks" line is the message itself when nothing comes before it
  const sign = lines.findIndex((l, i) => SIGN_OFF.test(l) && lines.slice(0, i).some(x => x.trim()))
  if (sign >= 0) lines = lines.slice(0, sign)
  const notice = lines.findIndex(l => NOTICE.test(l))
  if (notice >= 0) lines = lines.slice(0, notice)
  return lines.map(l => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** The newest words of the mail; a forward with nothing typed above it gives the forwarded mail instead. */
function latestMessage(text: string): string {
  const lines = text.replace(/\r/g, '').replace(/ /g, ' ').split('\n')
  // a quoted mail opens with a marker and its From/Sent/To/Subject lines; those lines stay with it
  const HEAD = /^\s*(From|Sent|To|Cc|Subject|Date|De|Von|An|Betreff)\s*:/i
  const parts: { head: boolean; lines: string[] }[] = [{ head: false, lines: [] }]
  lines.forEach((l, i) => {
    const cur = parts[parts.length - 1]
    if (i > 0 && QUOTED.some(r => r.test(l))) {
      if (!cur.head || cur.lines.some(x => x.trim() && !HEAD.test(x) && !QUOTED.some(r => r.test(x)))) parts.push({ head: true, lines: [] })
      return
    }
    if (cur.head && (HEAD.test(l) || (!l.trim() && !cur.lines.some(x => x.trim())))) return
    cur.lines.push(l)
  })
  for (const p of parts) {
    const c = cleanPart(p.lines)
    if (c) return c
  }
  return ''
}

/** The mail's subject without the Re: / Fwd: in front. */
const titleOf = (s: string) => s.replace(/^\s*((re|fw|fwd|aw|wg)\s*:\s*)+/i, '').trim()

function detailsOf(m: Mail): string {
  // the user, 26 Nov: "i need mail body only" — no From / date line
  const all = latestMessage(m.text)
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
  const [title, setTitle] = useState(titleOf(mail?.subject ?? ''))
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
