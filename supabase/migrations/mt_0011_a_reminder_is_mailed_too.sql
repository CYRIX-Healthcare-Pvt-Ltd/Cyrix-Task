/*
  mt_0011 — a reminder is mailed too (the user, 24 Oct: "for clicking reminder button also need mail, saying reminder
  count also"). Each reminder the manager sends on a task that has reached the person is mailed once, with which
  reminder it is (Reminder 2), the manager's note, the task's status and how many days it is overdue. Reminders sent
  before this are marked as mailed. task_mail_claim now hands task-mail both: what was assigned, and the reminders.
*/

alter table public.task_events add column if not exists mailed_at timestamptz, add column if not exists mail_error text;
update public.task_events set mailed_at = now() where kind = 'reminder' and mailed_at is null;

drop function if exists public.task_mail_claim(integer);
create function public.task_mail_claim(p_limit integer default 40)
returns table (kind text, id uuid, email text, first_name text, title text, details text, due_on date, criticality text,
               remarks text, by_name text, by_ecode text, progress integer, reminder_no integer, note text)
language plpgsql security definer set search_path to 'public' as $fn$
#variable_conflict use_column
declare lim integer := greatest(1, least(coalesce(p_limit, 40), 200)); n integer;
begin
  -- What was assigned and has reached the person: once each.
  return query
  with c as (
    select t.id from task_items t
     where t.assigned_by is not null and t.mailed_at is null and t.status = 'open'
       and ((t.due_on + time '09:00') at time zone 'Asia/Kolkata') <= now()
     order by t.created_at limit lim
     for update skip locked
  ), u as (
    update task_items t set mailed_at = now() from c where t.id = c.id returning t.*
  )
  select 'assigned'::text, u.id, nullif(btrim(o.work_email), ''), split_part(o.full_name, ' ', 1), u.title, u.details, u.due_on,
         u.criticality, u.remarks, a.full_name, a.ecode, u.progress, null::integer, null::text
  from u join employees o on o.id = u.employee_id left join employees a on a.id = u.assigned_by;
  get diagnostics n = row_count;
  if n >= lim then return; end if;

  -- The reminders, on tasks still to do that have reached the person: once each, with which reminder it is.
  return query
  with c as (
    select e.id from task_events e join task_items t on t.id = e.task_id
     where e.kind = 'reminder' and e.mailed_at is null and t.status = 'open'
       and (t.assigned_by is null or ((t.due_on + time '09:00') at time zone 'Asia/Kolkata') <= now())
     order by e.at limit lim - n
     for update of e skip locked
  ), u as (
    update task_events e set mailed_at = now() from c where e.id = c.id returning e.*
  )
  select 'reminder'::text, u.id, nullif(btrim(o.work_email), ''), split_part(o.full_name, ' ', 1), t.title, t.details, t.due_on,
         t.criticality, t.remarks, b.full_name, b.ecode, t.progress,
         (select count(*)::int from task_events r where r.task_id = t.id and r.kind = 'reminder' and r.at <= u.at),
         u.note
  from u join task_items t on t.id = u.task_id join employees o on o.id = t.employee_id left join employees b on b.id = u.by_id;
end $fn$;

-- A send that failed, written where it belongs: on the task for an assignment, on the step for a reminder.
create or replace function public.task_mail_failed(p_id uuid, p_error text)
returns void language sql security definer set search_path to 'public' as $fn$
  update task_items set mail_error = left(coalesce(p_error, 'failed'), 500) where id = p_id;
  update task_events set mail_error = left(coalesce(p_error, 'failed'), 500) where id = p_id;
$fn$;

revoke all on function public.task_mail_claim(integer) from public, anon, authenticated;
grant execute on function public.task_mail_claim(integer) to service_role;
revoke all on function public.task_mail_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.task_mail_failed(uuid, text) to service_role;
