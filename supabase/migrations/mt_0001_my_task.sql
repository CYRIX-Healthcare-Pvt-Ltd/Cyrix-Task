/*
  mt_0001 — My Task.

  A person keeps their own tasks: a name, a description, a due date and how
  critical it is (critical, moderate, non-critical), laid out on a calendar.
  Completing one asks what they did to complete it — that is required — and
  the task then waits for their reporting manager, whose approval closes it.
  A task not completed by its due date is overdue, counted in days from it.

  The reporting manager (employees.reporting_manager_id, the direct one, as
  manages_employee reads it) sees the tasks of the people who report to them,
  comments on any of them, sends a reminder about one still to do, changes
  how critical one is, approves a completed one or sends it back with a
  reason, and may delete a task. The person and their manager are the only
  two who see a task. Every change is a step in the task's history, with who
  made it ("Henry changed it to Non-critical, from Critical").

  Who may open the module is who holds it in employee_modules (mt_0002 gives
  it to the test accounts), or the software administrator.

  Everything is written through the functions below. The tables can only be
  read, and only by a task's owner and their reporting manager. A deletion is
  written to the audit log with the task and its whole history first.

  A reminder or a comment is told in the app, not by mail: each step is marked
  seen when the other side opens the task, and until then it shows as new.
*/

create table if not exists public.task_items (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  title        text not null,
  details      text,
  due_on       date not null,
  criticality  text not null check (criticality in ('critical', 'moderate', 'non_critical')),
  status       text not null default 'open' check (status in ('open', 'done', 'approved')),
  done_note    text,
  done_at      timestamptz,
  approved_at  timestamptz,
  approved_by  uuid references public.employees(id) on delete set null,
  created_by   uuid references public.employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint task_items_title_length check (length(btrim(title)) between 1 and 200),
  constraint task_items_details_length check (details is null or length(details) <= 4000),
  constraint task_items_done_says_what check (status = 'open' or (done_note is not null and done_at is not null)),
  constraint task_items_approved_when check (status <> 'approved' or approved_at is not null)
);
create index if not exists task_items_employee_due on public.task_items (employee_id, due_on);

create table if not exists public.task_events (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid not null references public.task_items(id) on delete cascade,
  kind     text not null check (kind in ('created', 'edited', 'criticality', 'comment', 'reminder', 'done', 'sent_back', 'approved')),
  by_id    uuid references public.employees(id) on delete set null,
  note     text,
  -- The clock, not the transaction's start: steps taken together still come out in the order they were taken.
  at       timestamptz not null default clock_timestamp(),
  -- When the other side (the owner, or their manager) first opened the task
  -- after this step. Only a change of criticality, a comment, a reminder, a
  -- completion, a send-back or an approval waits to be seen.
  seen_at  timestamptz
);
create index if not exists task_events_task on public.task_events (task_id, at);

alter table public.task_items enable row level security;
alter table public.task_events enable row level security;

-- ---------------------------------------------------------------------------
-- Who
-- ---------------------------------------------------------------------------

create or replace function public.task_has_access()
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select is_sw_admin() or exists (
    select 1 from employee_modules em where em.employee_id = current_employee_id() and em.module_code = 'tasks')
$fn$;

-- The task's owner, or the owner's reporting manager — nobody else.
create or replace function public.task_can_see(p_employee_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select task_has_access() and (p_employee_id = current_employee_id() or manages_employee(p_employee_id))
$fn$;

-- Today, in India.
create or replace function public.task_today()
returns date language sql stable set search_path to 'public' as $fn$
  select (now() at time zone 'Asia/Kolkata')::date
$fn$;

-- The task, held for the change about to be made to it, if this person may see it.
create or replace function public.task_lock(p_task_id uuid)
returns public.task_items language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items;
begin
  if not task_has_access() then raise exception 'My Task has not been given to you yet'; end if;
  select * into t from task_items where id = p_task_id for update;
  if not found or not (t.employee_id = current_employee_id() or manages_employee(t.employee_id)) then
    raise exception 'This task is not there any more';
  end if;
  return t;
end $fn$;

-- Acting on a task is seeing it: what the other side did before is no longer new.
create or replace function public.task_mark_seen(p_task_id uuid, p_me uuid)
returns void language sql security definer set search_path to 'public' as $fn$
  update task_events set seen_at = now()
  where task_id = p_task_id and seen_at is null and by_id is distinct from p_me
    and kind in ('criticality', 'comment', 'reminder', 'done', 'sent_back', 'approved')
$fn$;

-- How critical, in the words the screens use.
create or replace function public.task_criticality_word(p_criticality text)
returns text language sql immutable set search_path to 'public' as $fn$
  select case p_criticality when 'critical' then 'Critical' when 'moderate' then 'Moderate' when 'non_critical' then 'Non-critical' end
$fn$;

create or replace function public.task_check_due(p_due_on date)
returns void language plpgsql stable set search_path to 'public' as $fn$
begin
  if p_due_on is null then raise exception 'Choose the due date'; end if;
  if p_due_on < task_today() then raise exception 'The due date cannot be in the past'; end if;
  if p_due_on > task_today() + 366 then raise exception 'The due date is more than a year away — check the year'; end if;
end $fn$;

-- ---------------------------------------------------------------------------
-- The owner
-- ---------------------------------------------------------------------------

create or replace function public.task_add(p_title text, p_details text, p_due_on date, p_criticality text)
returns uuid language plpgsql security definer set search_path to 'public' as $fn$
declare me uuid := current_employee_id(); v_id uuid;
begin
  if me is null or not task_has_access() then raise exception 'My Task has not been given to you yet'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Give the task a name'; end if;
  if length(btrim(p_title)) > 200 then raise exception 'Keep the task name under 200 characters'; end if;
  if length(p_details) > 4000 then raise exception 'Keep the description under 4000 characters'; end if;
  perform task_check_due(p_due_on);
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  insert into task_items (employee_id, title, details, due_on, criticality, created_by)
  values (me, btrim(p_title), nullif(btrim(p_details), ''), p_due_on, p_criticality, me)
  returning id into v_id;
  insert into task_events (task_id, kind, by_id) values (v_id, 'created', me);
  return v_id;
end $fn$;

-- Name, description and due date, while the task is still to do. What changed is kept in the history.
create or replace function public.task_edit(p_task_id uuid, p_title text, p_details text, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  t task_items := task_lock(p_task_id);
  me uuid := current_employee_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  changes text[] := '{}';
begin
  if t.employee_id <> me then raise exception 'Only the person whose task it is can change it'; end if;
  if t.status <> 'open' then raise exception 'A completed task cannot be changed'; end if;
  if v_title = '' then raise exception 'Give the task a name'; end if;
  if length(v_title) > 200 then raise exception 'Keep the task name under 200 characters'; end if;
  if length(v_details) > 4000 then raise exception 'Keep the description under 4000 characters'; end if;
  if p_due_on is distinct from t.due_on then perform task_check_due(p_due_on); end if;

  if v_title <> t.title then changes := changes || format('Name: %s → %s', t.title, v_title); end if;
  if v_details is distinct from t.details then
    changes := changes || case when t.details is null then 'Description added'
                               when v_details is null then 'Description removed'
                               else 'Description changed' end;
  end if;
  if p_due_on <> t.due_on then
    changes := changes || format('Due date: %s → %s', to_char(t.due_on, 'FMDD Mon YYYY'), to_char(p_due_on, 'FMDD Mon YYYY'));
  end if;
  if cardinality(changes) = 0 then return; end if;

  update task_items set title = v_title, details = v_details, due_on = p_due_on, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'edited', me, array_to_string(changes, E'\n'));
  perform task_mark_seen(t.id, me);
end $fn$;

create or replace function public.task_done(p_task_id uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := btrim(coalesce(p_note, ''));
begin
  if t.employee_id <> me then raise exception 'Only the person whose task it is can mark it complete'; end if;
  if t.status <> 'open' then raise exception 'This task is already marked complete'; end if;
  if length(v_note) < 3 then raise exception 'Say what you did to complete the task'; end if;
  if length(v_note) > 4000 then raise exception 'Keep it under 4000 characters'; end if;
  update task_items set status = 'done', done_note = v_note, done_at = now(), updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'done', me, v_note);
  perform task_mark_seen(t.id, me);
end $fn$;

-- ---------------------------------------------------------------------------
-- Either of them
-- ---------------------------------------------------------------------------

-- How critical the task is: the person while it is to do, their manager until it is approved.
create or replace function public.task_set_criticality(p_task_id uuid, p_criticality text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id();
begin
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  if t.status = 'approved' then raise exception 'An approved task cannot be changed'; end if;
  if t.employee_id = me and t.status <> 'open' then raise exception 'A completed task cannot be changed'; end if;
  if p_criticality = t.criticality then return; end if;
  update task_items set criticality = p_criticality, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note)
  values (t.id, 'criticality', me, format('%s → %s', task_criticality_word(t.criticality), task_criticality_word(p_criticality)));
  perform task_mark_seen(t.id, me);
end $fn$;

create or replace function public.task_comment(p_task_id uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := btrim(coalesce(p_note, ''));
begin
  if v_note = '' then raise exception 'Write the comment first'; end if;
  if length(v_note) > 2000 then raise exception 'Keep the comment under 2000 characters'; end if;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'comment', me, v_note);
  perform task_mark_seen(t.id, me);
end $fn$;

-- Opening a task: what the other side did is seen.
create or replace function public.task_seen(p_task_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_owner uuid;
begin
  select employee_id into v_owner from task_items where id = p_task_id;
  if v_owner is null or not task_can_see(v_owner) then return; end if;
  perform task_mark_seen(p_task_id, current_employee_id());
end $fn$;

-- ---------------------------------------------------------------------------
-- The reporting manager
-- ---------------------------------------------------------------------------

create or replace function public.task_remind(p_task_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if t.employee_id = me or not manages_employee(t.employee_id) then raise exception 'Only the reporting manager can send a reminder'; end if;
  if t.status <> 'open' then raise exception 'This task is already marked complete'; end if;
  if length(v_note) > 1000 then raise exception 'Keep the reminder under 1000 characters'; end if;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'reminder', me, v_note);
  perform task_mark_seen(t.id, me);
end $fn$;

create or replace function public.task_approve(p_task_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if t.employee_id = me or not manages_employee(t.employee_id) then raise exception 'Only the reporting manager can approve a task'; end if;
  if t.status = 'approved' then raise exception 'This task is already approved'; end if;
  if t.status <> 'done' then raise exception 'A task is approved once it is marked complete'; end if;
  if length(v_note) > 2000 then raise exception 'Keep the comment under 2000 characters'; end if;
  update task_items set status = 'approved', approved_at = now(), approved_by = me, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'approved', me, v_note);
  perform task_mark_seen(t.id, me);
end $fn$;

-- Not done as it should be: back to the person, to do, with the reason.
create or replace function public.task_send_back(p_task_id uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := btrim(coalesce(p_note, ''));
begin
  if t.employee_id = me or not manages_employee(t.employee_id) then raise exception 'Only the reporting manager can send a task back'; end if;
  if t.status = 'approved' then raise exception 'This task is already approved'; end if;
  if t.status <> 'done' then raise exception 'Only a task marked complete can be sent back'; end if;
  if v_note = '' then raise exception 'Say why it is going back'; end if;
  if length(v_note) > 2000 then raise exception 'Keep the reason under 2000 characters'; end if;
  update task_items set status = 'open', done_note = null, done_at = null, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'sent_back', me, v_note);
  perform task_mark_seen(t.id, me);
end $fn$;

create or replace function public.task_delete(p_task_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id();
begin
  if t.employee_id = me or not manages_employee(t.employee_id) then raise exception 'Only the reporting manager can delete a task'; end if;
  insert into audit_log (actor_id, entity_type, entity_id, action, details)
  values (me, 'task', t.id, 'deleted', jsonb_build_object(
    'task', to_jsonb(t),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) from task_events e where e.task_id = t.id)));
  delete from task_items where id = t.id;
end $fn$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- The people who report to me and keep tasks here: they hold the module, or a task of theirs is still open.
create or replace function public.task_people()
returns table (id uuid, full_name text, ecode text, designation text, avatar text)
language sql stable security definer set search_path to 'public' as $fn$
  select r.id, r.full_name, r.ecode, r.designation, r.avatar
  from employees r
  where task_has_access()
    and r.reporting_manager_id = current_employee_id()
    and (
      (r.is_active and exists (select 1 from employee_modules em where em.employee_id = r.id and em.module_code = 'tasks'))
      or exists (select 1 from task_items t where t.employee_id = r.id and t.status <> 'approved'))
  order by r.full_name
$fn$;

-- Whose approval my tasks wait for, and whether I have people of my own here.
create or replace function public.task_me()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object(
    'manager_id', m.id,
    'manager_name', m.full_name,
    'manager_has_module', m.id is not null and (
      exists (select 1 from employee_modules em where em.employee_id = m.id and em.module_code = 'tasks')
      or exists (select 1 from user_roles ur where ur.employee_id = m.id and ur.role = 'sw_admin')),
    'team', (select count(*)::int from task_people()))
  from employees e
  left join employees m on m.id = e.reporting_manager_id and m.is_active
  where e.id = current_employee_id() and task_has_access()
$fn$;

/*
  Tasks: mine; one person's (mine, or someone who reports to me); or, with
  p_team, everyone's who reports to me. Every task still to do or waiting
  for approval, whenever it is due, and the approved ones due between p_from
  and p_to — the month on the calendar.

  unseen counts the steps the other side took that I have not opened yet.
*/
create or replace function public.task_list(p_from date, p_to date, p_employee_id uuid default null, p_team boolean default false)
returns table (
  id uuid, employee_id uuid, employee_name text, employee_ecode text,
  title text, details text, due_on date, criticality text, status text,
  done_note text, done_at timestamptz, approved_at timestamptz, approved_by_name text,
  created_at timestamptz, updated_at timestamptz,
  reminders integer, last_reminded_at timestamptz, comments integer, sent_back integer,
  unseen integer, unseen_kinds text[]
)
language sql stable security definer set search_path to 'public' as $fn$
  with me as (select current_employee_id() as id),
  whose as (
    select e.id from employees e, me
    where task_has_access() and me.id is not null and (
      case
        when p_team then e.reporting_manager_id = me.id
        when p_employee_id is not null then e.id = p_employee_id and (e.id = me.id or e.reporting_manager_id = me.id)
        else e.id = me.id
      end)
  )
  select t.id, t.employee_id, o.full_name, o.ecode,
         t.title, t.details, t.due_on, t.criticality, t.status,
         t.done_note, t.done_at, t.approved_at, a.full_name,
         t.created_at, t.updated_at,
         coalesce(ev.reminders, 0), ev.last_reminded_at, coalesce(ev.comments, 0), coalesce(ev.sent_back, 0),
         coalesce(ev.unseen, 0), ev.unseen_kinds
  from task_items t
  join whose w on w.id = t.employee_id
  join employees o on o.id = t.employee_id
  left join employees a on a.id = t.approved_by
  left join lateral (
    select count(*) filter (where e.kind = 'reminder')::int as reminders,
           max(e.at) filter (where e.kind = 'reminder') as last_reminded_at,
           count(*) filter (where e.kind = 'comment')::int as comments,
           count(*) filter (where e.kind = 'sent_back')::int as sent_back,
           count(*) filter (where e.seen_at is null and e.by_id is distinct from (select id from me)
                              and e.kind in ('criticality', 'comment', 'reminder', 'done', 'sent_back', 'approved'))::int as unseen,
           array_agg(distinct e.kind) filter (where e.seen_at is null and e.by_id is distinct from (select id from me)
                              and e.kind in ('criticality', 'comment', 'reminder', 'done', 'sent_back', 'approved')) as unseen_kinds
    from task_events e where e.task_id = t.id
  ) ev on true
  where t.status <> 'approved' or t.due_on between p_from and p_to
  order by t.due_on, t.created_at
$fn$;

-- A task's history and comments, oldest first, with who did each.
create or replace function public.task_history(p_task_id uuid)
returns table (id uuid, kind text, by_id uuid, by_name text, note text, at timestamptz, seen_at timestamptz)
language sql stable security definer set search_path to 'public' as $fn$
  select e.id, e.kind, e.by_id, b.full_name, e.note, e.at, e.seen_at
  from task_events e
  join task_items t on t.id = e.task_id
  left join employees b on b.id = e.by_id
  where e.task_id = p_task_id and task_can_see(t.employee_id)
  order by e.at, e.id
$fn$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

create policy task_items_read on public.task_items for select to authenticated using (task_can_see(employee_id));
create policy task_events_read on public.task_events for select to authenticated
  using (exists (select 1 from public.task_items t where t.id = task_id and task_can_see(t.employee_id)));

revoke all on public.task_items, public.task_events from public, anon, authenticated;
grant select on public.task_items, public.task_events to authenticated;
grant all on public.task_items, public.task_events to service_role;

do $$
declare f text;
begin
  for f in
    select p.oid::regprocedure::text from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'task\_%'
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  -- Inner steps, called only from the functions above.
  revoke execute on function public.task_lock(uuid) from authenticated;
  revoke execute on function public.task_mark_seen(uuid, uuid) from authenticated;
  revoke execute on function public.task_check_due(date) from authenticated;
end $$;
