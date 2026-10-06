# Cyrix My Task

A person's tasks by the day, followed and approved by their reporting
manager. Served at `app.cyrix.in/tasks`, behind the portal's rewrite, on the
same Supabase project and sign-in as KPI, Revive Lab and Travel Expense.

## Rules it carries

- **A task** has a name, a description, a due date and how critical it is:
  **Critical**, **Moderate** or **Non-critical** — asked when the task is
  added, never assumed. It sits on the calendar on its due date. The due date
  cannot be in the past, nor more than a year away.
- **Completing a task asks what was done** — that is required — and the task
  then waits for the reporting manager's approval. The manager approves it
  (which closes it) or sends it back with a reason, and it is to do again.
  The manager can reopen an approved task too, with a reason and, if more
  time is needed, a new due date.
- **A task not completed by its due date is overdue**: it comes forward to the
  top of Today, in red, saying for how many days.
- **The reporting manager** — the direct one, as `employees.reporting_manager_id`
  says — sees the tasks of the people who report to them on **My Team Task**,
  each with who entered it (name and E-code), for everyone or one person. On
  each they can comment, send a reminder, change how critical it is and its
  due date, approve or send back a completed one, reopen an approved one, and
  delete one. The person sees their own on **My Task**, and nobody else sees
  either.
- **Who may change what:** the person changes their task (name, description,
  due date, how critical) while it is to do; the manager changes how critical
  it is and its due date until it is approved. Once the manager has changed
  either, only the manager changes it again. Only the manager deletes, and a
  deletion is written to the audit log with the task's whole history first.
- **Comments:** both comment while the task is to do. Once the person marks
  it complete it is with the manager, and only the manager comments, until
  it comes back to the person (sent back or reopened).
- **Every step is in the task's history**, with who took it: "Henry changed it
  to Non-critical · was Critical", "Henry changed the due date to 9 Oct 2026
  · was 30 Sep 2026". A comment, a reminder, a change of criticality or of the
  due date, a completion, a send-back, an approval or a reopening is marked
  new for the other side until they open the task; a reminder is told in the
  app, not by mail.
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

## Run it

```
npm install
npm run dev      # http://localhost:5179/tasks/
npm run build    # type-check and build into dist/tasks
npm test
```

Copy `.env.example` to `.env.local` and fill in the two Supabase values — the
same public ones every module's bundle already carries.

## Deploy

A Vercel project named `cyrix-task` (the portal rewrites `/tasks` to
`cyrix-task.vercel.app`), building the `main` branch of
`CYRIX-Healthcare-Pvt-Ltd/Cyrix-Task` on every push. It needs
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `VITE_AUTH_EMAIL_DOMAIN`
may be left out, and is `cyrix.local` when it is. Database changes are in
`supabase/migrations`, applied one at a time.
