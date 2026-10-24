/*
  mt_0007 — the manager assigns tasks; progress; approval only for what was assigned.

  The user, 24 Oct:
  · A manager assigns a task to one, several or all of the people who report to them: its name, description,
    due date, how critical it is and remarks. Each gets their own task, "Assigned by Henry". Its name,
    description, due date and criticality stay as the manager set them; the person updates its progress,
    comments on it and completes it.
  · Progress on any task still to do: Not started 0%, Started 25%, In progress 50%, Almost done 75%;
    marking it complete is 100%. Each change is a step in its history.
  · Approval only for an assigned task: one the person added for themselves is complete when they mark it so
    (what they did still asked). Those waiting for approval today are complete. The manager can reopen any.
*/

alter table public.task_items
  add column if not exists assigned_by uuid references public.employees(id) on delete set null,
  add column if not exists remarks text,
  add column if not exists progress integer not null default 0;
alter table public.task_items drop constraint if exists task_items_remarks_length;
alter table public.task_items add constraint task_items_remarks_length check (remarks is null or length(remarks) <= 2000);
alter table public.task_items drop constraint if exists task_items_progress_steps;
alter table public.task_items add constraint task_items_progress_steps check (progress in (0, 25, 50, 75));

alter table public.task_events drop constraint task_events_kind_check;
alter table public.task_events add constraint task_events_kind_check check (kind = any (array[
  'created', 'edited', 'criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened',
  'assigned', 'progress']));

-- A task the person added for themselves, waiting for approval: complete now.
update public.task_items set status = 'approved', approved_at = coalesce(done_at, now()), approved_by = null
 where status = 'done' and assigned_by is null;

CREATE OR REPLACE FUNCTION public.task_done(p_task_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := btrim(coalesce(p_note, ''));
begin
  if t.employee_id <> me then raise exception 'Only the person whose task it is can mark it complete'; end if;
  if t.status <> 'open' then raise exception 'This task is already marked complete'; end if;
  if length(v_note) < 3 then raise exception 'Say what you did to complete the task'; end if;
  if length(v_note) > 4000 then raise exception 'Keep it under 4000 characters'; end if;
  -- A task the person added for themselves is complete when they say so; one the manager assigned waits for
  -- the manager's approval (mt_0007; the user, 24 Oct: "for only assigned we need approval").
  if t.assigned_by is null then
    update task_items set status = 'approved', done_note = v_note, done_at = now(), approved_at = now(), approved_by = null, updated_at = now() where id = t.id;
  else
    update task_items set status = 'done', done_note = v_note, done_at = now(), updated_at = now() where id = t.id;
  end if;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'done', me, v_note);
  perform task_mark_seen(t.id, me);
end $function$;

CREATE OR REPLACE FUNCTION public.task_edit(p_task_id uuid, p_title text, p_details text, p_due_on date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t task_items := task_lock(p_task_id);
  me uuid := current_employee_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_by text;
  changes text[] := '{}';
begin
  if t.employee_id <> me then raise exception 'Only the person whose task it is can change it'; end if;
  if t.status <> 'open' then raise exception 'A completed task cannot be changed'; end if;
  -- An assigned task is as the manager set it (mt_0007).
  if t.assigned_by is not null then
    raise exception '% assigned this task, so its name, description and due date stay as % set them',
      coalesce((select split_part(full_name, ' ', 1) from employees where id = t.assigned_by), 'Your manager'),
      coalesce((select split_part(full_name, ' ', 1) from employees where id = t.assigned_by), 'your manager');
  end if;
  if v_title = '' then raise exception 'Give the task a name'; end if;
  if length(v_title) > 200 then raise exception 'Keep the task name under 200 characters'; end if;
  if length(v_details) > 4000 then raise exception 'Keep the description under 4000 characters'; end if;
  if p_due_on is distinct from t.due_on then
    select split_part(b.full_name, ' ', 1) into v_by
    from task_events e left join employees b on b.id = e.by_id
    where e.task_id = t.id and e.kind = 'due' and e.by_id is distinct from t.employee_id
    order by e.at desc limit 1;
    if found then
      raise exception '%', case when v_by is null
        then 'Your manager set the due date, so only your manager can change it'
        else format('%s set the due date, so only %s can change it', v_by, v_by) end;
    end if;
    perform task_check_due(p_due_on);
  end if;

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
end $function$;

CREATE OR REPLACE FUNCTION public.task_set_criticality(p_task_id uuid, p_criticality text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_by text;
begin
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  if t.status = 'approved' then raise exception 'An approved task cannot be changed'; end if;
  if t.employee_id = me then
    if t.status <> 'open' then raise exception 'A completed task cannot be changed'; end if;
    if t.assigned_by is not null then
      raise exception '% assigned this task, so only % changes how critical it is',
        coalesce((select split_part(full_name, ' ', 1) from employees where id = t.assigned_by), 'Your manager'),
        coalesce((select split_part(full_name, ' ', 1) from employees where id = t.assigned_by), 'your manager');
    end if;
    -- Set by the manager: theirs to change from now on.
    select split_part(b.full_name, ' ', 1) into v_by
    from task_events e left join employees b on b.id = e.by_id
    where e.task_id = t.id and e.kind = 'criticality' and e.by_id is distinct from t.employee_id
    order by e.at desc limit 1;
    if found then
      raise exception '%', case when v_by is null
        then 'Your manager set how critical this task is, so only your manager can change it'
        else format('%s set how critical this task is, so only %s can change it', v_by, v_by) end;
    end if;
  end if;
  if p_criticality = t.criticality then return; end if;
  update task_items set criticality = p_criticality, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note)
  values (t.id, 'criticality', me, format('%s → %s', task_criticality_word(t.criticality), task_criticality_word(p_criticality)));
  perform task_mark_seen(t.id, me);
end $function$;

CREATE OR REPLACE FUNCTION public.task_mark_seen(p_task_id uuid, p_me uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update task_events set seen_at = now()
  where task_id = p_task_id and seen_at is null and by_id is distinct from p_me
    and kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened', 'assigned')
$function$;

create or replace function public.task_progress_word(p_progress integer)
returns text language sql immutable set search_path to 'public' as $fn$
  select case p_progress when 0 then 'Not started' when 25 then 'Started' when 50 then 'In progress' when 75 then 'Almost done' end
$fn$;

-- Where the person is with a task still to do.
create or replace function public.task_progress(p_task_id uuid, p_progress integer)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id();
begin
  if t.employee_id <> me then raise exception 'Only the person whose task it is updates its progress'; end if;
  if t.status <> 'open' then raise exception 'This task is already marked complete'; end if;
  if task_progress_word(p_progress) is null then raise exception 'Choose how far along it is'; end if;
  if p_progress = t.progress then return; end if;
  update task_items set progress = p_progress, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note)
  values (t.id, 'progress', me, format('%s · %s%%', task_progress_word(p_progress), p_progress));
end $fn$;

-- The manager gives a task to one or more of the people who report to them, each their own.
create or replace function public.task_assign(p_people uuid[], p_title text, p_details text, p_due_on date, p_criticality text, p_remarks text)
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare
  me uuid := current_employee_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
  v_person uuid; v_id uuid; n integer := 0;
begin
  if me is null or not task_has_access() then raise exception 'My Task has not been given to you yet'; end if;
  if coalesce(cardinality(p_people), 0) = 0 then raise exception 'Choose who the task is for'; end if;
  if cardinality(p_people) > 500 then raise exception 'Assign to at most 500 people at a time'; end if;
  if v_title = '' then raise exception 'Give the task a name'; end if;
  if length(v_title) > 200 then raise exception 'Keep the task name under 200 characters'; end if;
  if length(v_details) > 4000 then raise exception 'Keep the description under 4000 characters'; end if;
  if length(v_remarks) > 2000 then raise exception 'Keep the remarks under 2000 characters'; end if;
  perform task_check_due(p_due_on);
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  foreach v_person in array (select array_agg(distinct x) from unnest(p_people) x) loop
    if not exists (select 1 from task_people() p where p.id = v_person) then
      raise exception '% does not report to you, or does not have My Task',
        coalesce((select full_name from employees where id = v_person), 'Somebody chosen');
    end if;
    insert into task_items (employee_id, title, details, due_on, criticality, created_by, assigned_by, remarks)
    values (v_person, v_title, v_details, p_due_on, p_criticality, me, me, v_remarks)
    returning id into v_id;
    insert into task_events (task_id, kind, by_id, note) values (v_id, 'assigned', me, v_remarks);
    n := n + 1;
  end loop;
  return n;
end $fn$;

drop function public.task_list(date, date, uuid, boolean);
CREATE OR REPLACE FUNCTION public.task_list(p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid, p_team boolean DEFAULT false)
 RETURNS TABLE(id uuid, employee_id uuid, employee_name text, employee_ecode text, title text, details text, due_on date, due_set_by text, criticality text, criticality_set_by text, status text, done_note text, done_at timestamp with time zone, approved_at timestamp with time zone, approved_by_name text, created_at timestamp with time zone, updated_at timestamp with time zone, reminders integer, last_reminded_at timestamp with time zone, comments integer, sent_back integer, reopened integer, unseen integer, unseen_kinds text[], assigned_by_name text, remarks text, progress integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         t.title, t.details, t.due_on,
         coalesce((select coalesce(split_part(b.full_name, ' ', 1), 'your manager')
            from task_events d left join employees b on b.id = d.by_id
            where d.task_id = t.id and d.kind = 'due' and d.by_id is distinct from t.employee_id
            order by d.at desc limit 1), split_part(asg.full_name, ' ', 1)),
         t.criticality,
         coalesce((select coalesce(split_part(b.full_name, ' ', 1), 'your manager')
            from task_events c left join employees b on b.id = c.by_id
            where c.task_id = t.id and c.kind = 'criticality' and c.by_id is distinct from t.employee_id
            order by c.at desc limit 1), split_part(asg.full_name, ' ', 1)),
         t.status,
         t.done_note, t.done_at, t.approved_at, a.full_name,
         t.created_at, t.updated_at,
         coalesce(ev.reminders, 0), ev.last_reminded_at, coalesce(ev.comments, 0), coalesce(ev.sent_back, 0), coalesce(ev.reopened, 0),
         coalesce(ev.unseen, 0), ev.unseen_kinds,
         asg.full_name, t.remarks, t.progress
  from task_items t
  join whose w on w.id = t.employee_id
  join employees o on o.id = t.employee_id
  left join employees a on a.id = t.approved_by
  left join employees asg on asg.id = t.assigned_by
  left join lateral (
    select count(*) filter (where e.kind = 'reminder')::int as reminders,
           max(e.at) filter (where e.kind = 'reminder') as last_reminded_at,
           count(*) filter (where e.kind = 'comment')::int as comments,
           count(*) filter (where e.kind = 'sent_back')::int as sent_back,
           count(*) filter (where e.kind = 'reopened')::int as reopened,
           count(*) filter (where e.seen_at is null and e.by_id is distinct from (select id from me)
                              and e.kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened', 'assigned'))::int as unseen,
           array_agg(distinct e.kind) filter (where e.seen_at is null and e.by_id is distinct from (select id from me)
                              and e.kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened', 'assigned')) as unseen_kinds
    from task_events e where e.task_id = t.id
  ) ev on true
  where t.status <> 'approved' or t.due_on between p_from and p_to
  order by t.due_on, t.created_at
$function$;

revoke all on function public.task_list(date, date, uuid, boolean) from public, anon;
grant execute on function public.task_list(date, date, uuid, boolean) to authenticated, service_role;
revoke all on function public.task_progress(uuid, integer) from public, anon;
grant execute on function public.task_progress(uuid, integer) to authenticated, service_role;
revoke all on function public.task_assign(uuid[], text, text, date, text, text) from public, anon;
grant execute on function public.task_assign(uuid[], text, text, date, text, text) to authenticated, service_role;
revoke all on function public.task_progress_word(integer) from public, anon;
grant execute on function public.task_progress_word(integer) to authenticated, service_role;
