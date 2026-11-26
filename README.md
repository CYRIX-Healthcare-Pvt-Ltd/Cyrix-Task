# Cyrix My Task

A person's tasks by the day, followed and approved by their reporting
manager, who can also assign tasks to the people under them.

> Part of **Cyrix One**, the platform at [app.cyrix.in](https://app.cyrix.in).
> System-wide picture: [Cyrix One Platform — System Architecture](https://claude.ai/artifact/HNYWoBqCJ6Xh3XcREuKpTu)
> (ask Adrian for access). Every repository: [REPOSITORIES.md](https://github.com/CYRIX-Healthcare-Pvt-Ltd/cyrix-platform/blob/main/docs/REPOSITORIES.md).

## At a glance

| | |
|---|---|
| Served at | `app.cyrix.in/tasks` (portal rewrite to `cyrix-task.vercel.app`) |
| Stack | React 18, TypeScript, Vite 5, Tailwind 3, react-router, `@supabase/supabase-js`, Vitest |
| Database | Shared Supabase project (the same one as KPI, Revive Lab and Travel); own tables `task_items`, `task_events` |
| Sign-in | The portal's session on app.cyrix.in (`<ecode>@cyrix.local`); the `tasks` module, which every employee holds |
| Hosting | Vercel project `cyrix-task` |
| Maintainers | Kevin |
| Status | Live |

## Run locally

```bash
npm install
cp .env.example .env.local   # the two public Supabase values
npm run dev                  # http://localhost:5179/tasks/
```

## Environment variables

| Name | Where it is set | Secret? | What it is for |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local`, Vercel | no | The shared Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `.env.local`, Vercel | no (publishable key) | Browser access; row-level security does the protecting |
| `VITE_AUTH_EMAIL_DOMAIN` | `.env.local`, Vercel | no | Domain an employee code becomes; defaults to `cyrix.local` |

Never put the service-role key or a database URL in `.env.local` for this app
or in Vercel: every `VITE_` value is readable by anyone who opens the site.
Mail is sent by KPI's `task-mail` edge function, whose settings live in
Supabase, not here.

## Database

Migrations are in `supabase/migrations` (`mt_0001` … `mt_0023` as of 26 Nov 2026), applied by
hand one at a time, in order. They create My Task's own tables and functions
and read shared ones (`employees`, `employee_modules`). Changes this module
needs in shared objects (device notifications, `task_mail_call`) are KPI
migrations (0220–0222).

| Migrations | What they cover |
|---|---|
| mt_0001–mt_0006 | Tasks, history, the dashboard, the `tasks` module for everybody |
| mt_0007–mt_0012 | Assigning, approval, progress, release at 9 AM, mail |
| mt_0013–mt_0015 | The whole line below a manager, a scheduled date, My team is my reportees |
| mt_0016–mt_0017, mt_0019–mt_0022 | A due time; Notify my manager, which the manager can switch off |
| mt_0018 | The history says what changed to what |
| mt_0023 | Every change of stage needs a note |

## Deploy

Vercel builds `main` of `CYRIX-Healthcare-Pvt-Ltd/Cyrix-Task` on every push
(`npm run build` → `dist/tasks`), with the three `VITE_` variables above.
Migrations are not deployed by anything: apply them before merging code that
needs them.

## Checks before merging

```bash
npm run build    # type-check and build into dist/tasks
npm test         # Vitest (src/lib/*.test.ts)
```

## How it works

- **A task** has a name, a description, a due date and how critical it is:
  **Critical**, **Moderate** or **Non-critical** — asked when the task is
  added, never assumed. It sits on the calendar on its due date. The due date
  cannot be in the past, nor more than a year away.
- **Completing a task asks what was done** — that is required. A task the
  person added for themselves is then complete. A task the manager
  **assigned** waits for the manager's approval: the manager approves it
  (which closes it) or sends it back with a reason, and it is to do again
  (mt_0007). The manager can reopen any completed task, with a reason and, if
  more time is needed, a new due date.
- **The manager can assign a task** to anyone below them in the reporting
  line, not only direct reports (mt_0007, mt_0013), optionally for a scheduled
  date (mt_0014) and with a due time (mt_0022). Each gets their own copy, "Assigned by …"; its
  name, description, due date and criticality stay as the manager set them,
  and the person updates its **progress** (0, 25, 50, 75%, then complete).
  A change of progress is news to the manager (mt_0008), and every change of
  stage needs a note of what was done (mt_0023).
- **A due time** is optional; a task with only a date is due all that day
  (mt_0016).
- **Notify my manager** (mt_0016 onward): the person can turn it on for a task,
  so the manager's bell and phone ring when it is added, completed or overdue;
  the manager can switch it off (mt_0017).
- **A task assigned for a later day** shows in the manager's list at once but
  reaches the person only at 9 AM on that day, when it is also mailed to them
  (mt_0009, mt_0010).
- **A task not completed by its due date is overdue**: it comes forward to the
  top of Today, in red, saying for how many days.
- **The manager** sees on **My Team Task** the tasks of their direct
  reportees, plus the ones they assigned to anyone further down (mt_0015),
  each with who entered it (name and E-code), for everyone or one person. On
  each they can comment, send a reminder, change how critical it is and its
  due date, approve or send back a completed one, reopen an approved one, and
  delete one. The person sees their own on **My Task**, and nobody else sees
  either.
- **Who may change what:** the person changes their task (name, description,
  due date, how critical) while it is to do; the manager changes how critical
  it is and its due date until it is approved. Once the manager has changed
  either, only the manager changes it again. The history shows each change as
  was and now (mt_0018). Only the manager deletes, and a
  deletion is written to the audit log with the task's whole history first.
- **Comments:** both comment while the task is to do. Once the person marks
  it complete it is with the manager, and only the manager comments, until
  it comes back to the person (sent back or reopened).
- **Every step is in the task's history**, with who took it: "Henry changed it
  to Non-critical · was Critical", "Henry changed the due date to 9 Oct 2026
  · was 30 Sep 2026". A comment, a reminder, a change of criticality or of the
  due date, a completion, a send-back, an approval or a reopening is marked
  new for the other side until they open the task. An assigned task and a
  reminder are also **mailed**, straight away, by KPI's `task-mail` edge
  function (mt_0011, mt_0012); a reminder's mail says which reminder it is.
- **The dashboard** counts tasks by the month they are due — this month, last
  month or all time: total, pending (and of those overdue), completed, and
  completion TAT (the average time from adding a task to marking it complete,
  with how many were completed by their due date), in all, by criticality,
  and for a manager by person.
- **Everybody has it**, as everybody has KPI. Every active employee was given
  the `tasks` module (mt_0006), and every new employee is given it on the way
  in, by the same trigger that gives KPI. Who may open it is who holds the
  module, or the software administrator, who can take it away from somebody
  in KPI SW Admin → Login administration. A manager needs the module too, to
  see and approve their people's tasks.

| Page | Route | Who |
|---|---|---|
| Dashboard | `/` | everybody (a manager also sees by person) |
| My Task | `/my-task` | everybody |
| My Team Task | `/team` | reporting managers |
| Outlook add-in, Make task | `/tasks/outlook.html` | everybody, inside Outlook |

**The Outlook add-in** (`src/outlook/main.tsx`, `public/outlook/manifest.xml`,
since 26 Nov 2026) shows a panel beside an open mail that fills My Task's form
from the mail's subject. It signs in with the employee code once, inside the
panel, and keeps no copy of the mail. `vercel.json` (here and in the portal)
lets only `/tasks/outlook*` be framed by Outlook.

## Related docs

- [cyrix-platform README](https://github.com/CYRIX-Healthcare-Pvt-Ltd/cyrix-platform#readme): the portal and how a module is added
- [Cyrix-KPI](https://github.com/CYRIX-Healthcare-Pvt-Ltd/Cyrix-KPI#readme): the shared database, SW Admin (where the module is granted) and the `task-mail` function
