/*
  mt_0013 — the whole line (the user, 29 Oct: "in afsal id ... manish r nair has reportees also, so add a plus or team
  icon so on click his list will come. ie afsal can give task to them also. so for afsal, his reportee also task will
  be visible"). A manager sees and assigns to everyone below them, not only those who report to them directly.
  Approving, sending back, reopening, reminding, changing the due date and deleting stay with the direct manager,
  and now also with whoever assigned the task.
*/

-- Everyone below me, with whom each reports to, so the list can open a manager's own team under them.
drop function if exists public.task_people();
create function public.task_people()
returns table (id uuid, full_name text, ecode text, designation text, avatar text, manager_id uuid, manager_name text)
language sql stable security definer set search_path to 'public' as $f$
  with recursive below as (
    select e.id, 1 as depth from employees e where e.reporting_manager_id = current_employee_id()
    union
    select e.id, b.depth + 1 from employees e join below b on e.reporting_manager_id = b.id where b.depth < 20
  )
  select r.id, r.full_name, r.ecode, r.designation, r.avatar, r.reporting_manager_id, m.full_name
  from employees r
  join (select distinct id from below) b on b.id = r.id
  left join employees m on m.id = r.reporting_manager_id
  where task_has_access()
    and (
      (r.is_active and exists (select 1 from employee_modules em where em.employee_id = r.id and em.module_code = 'tasks'))
      or exists (select 1 from task_items t where t.employee_id = r.id and t.status <> 'approved'))
  order by r.full_name
$f$;
revoke all on function public.task_people() from public, anon;
grant execute on function public.task_people() to authenticated;

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
        when p_team then e.id in (select p.id from task_people() p)
        when p_employee_id is not null then e.id = p_employee_id and (e.id = me.id or e.id in (select p.id from task_people() p))
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
                              and e.kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened', 'assigned', 'progress'))::int as unseen,
           array_agg(distinct e.kind) filter (where e.seen_at is null and e.by_id is distinct from (select id from me)
                              and e.kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened', 'assigned', 'progress')) as unseen_kinds
    from task_events e where e.task_id = t.id
  ) ev on true
  where (t.status <> 'approved' or t.due_on between p_from and p_to)
    -- A task assigned for a later day reaches the person at 9 AM that day (mt_0010); their manager sees it from the start.
    and (t.assigned_by is null or ((t.due_on + time '09:00') at time zone 'Asia/Kolkata') <= now() or t.employee_id <> (select id from me))
  order by t.due_on, t.created_at
$function$;

CREATE OR REPLACE FUNCTION public.task_can_see(p_employee_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select task_has_access() and (p_employee_id = current_employee_id() or manages_employee(p_employee_id) or is_above(p_employee_id))
$function$;

CREATE OR REPLACE FUNCTION public.task_lock(p_task_id uuid)
 RETURNS task_items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items;
begin
  if not task_has_access() then raise exception 'My Task has not been given to you yet'; end if;
  select * into t from task_items where id = p_task_id for update;
  if not found or not (t.employee_id = current_employee_id() or manages_employee(t.employee_id) or is_above(t.employee_id)) then
    raise exception 'This task is not there any more';
  end if;
  return t;
end $function$;

CREATE OR REPLACE FUNCTION public.task_approve(p_task_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if t.employee_id = me or not (manages_employee(t.employee_id) or t.assigned_by = me) then raise exception 'Only the reporting manager can approve a task'; end if;
  if t.status = 'approved' then raise exception 'This task is already approved'; end if;
  if t.status <> 'done' then raise exception 'A task is approved once it is marked complete'; end if;
  if length(v_note) > 2000 then raise exception 'Keep the comment under 2000 characters'; end if;
  update task_items set status = 'approved', approved_at = now(), approved_by = me, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'approved', me, v_note);
  perform task_mark_seen(t.id, me);
end $function$;

CREATE OR REPLACE FUNCTION public.task_delete(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id();
begin
  if t.employee_id = me or not (manages_employee(t.employee_id) or t.assigned_by = me) then raise exception 'Only the reporting manager can delete a task'; end if;
  insert into audit_log (actor_id, entity_type, entity_id, action, details)
  values (me, 'task', t.id, 'deleted', jsonb_build_object(
    'task', to_jsonb(t),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) from task_events e where e.task_id = t.id)));
  delete from task_items where id = t.id;
end $function$;

CREATE OR REPLACE FUNCTION public.task_remind(p_task_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if t.employee_id = me or not (manages_employee(t.employee_id) or t.assigned_by = me) then raise exception 'Only the reporting manager can send a reminder'; end if;
  if t.status <> 'open' then raise exception 'This task is already marked complete'; end if;
  if length(v_note) > 1000 then raise exception 'Keep the reminder under 1000 characters'; end if;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'reminder', me, v_note);
  perform task_mark_seen(t.id, me);
  -- Mailed at once, if the task has reached the person (mt_0012).
  if t.assigned_by is null or ((t.due_on + time '09:00') at time zone 'Asia/Kolkata') <= now() then perform task_mail_call(); end if;
end $function$;

CREATE OR REPLACE FUNCTION public.task_reopen(p_task_id uuid, p_note text, p_due_on date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t task_items := task_lock(p_task_id);
  me uuid := current_employee_id();
  v_note text := btrim(coalesce(p_note, ''));
  v_due date := coalesce(p_due_on, t.due_on);
begin
  if t.employee_id = me or not (manages_employee(t.employee_id) or t.assigned_by = me) then raise exception 'Only the reporting manager can reopen a task'; end if;
  if t.status = 'open' then raise exception 'This task is not completed, so there is nothing to reopen'; end if;
  if t.status = 'done' then raise exception 'A task waiting for your approval is sent back, not reopened'; end if;
  if v_note = '' then raise exception 'Say why it is being reopened'; end if;
  if length(v_note) > 2000 then raise exception 'Keep the reason under 2000 characters'; end if;
  if v_due <> t.due_on then perform task_check_due(v_due); end if;
  update task_items
     set status = 'open', done_note = null, done_at = null, approved_at = null, approved_by = null,
         due_on = v_due, updated_at = now()
   where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'reopened', me, v_note);
  if v_due <> t.due_on then
    insert into task_events (task_id, kind, by_id, note)
    values (t.id, 'due', me, format('%s → %s', to_char(t.due_on, 'FMDD Mon YYYY'), to_char(v_due, 'FMDD Mon YYYY')));
  end if;
  perform task_mark_seen(t.id, me);
end $function$;

CREATE OR REPLACE FUNCTION public.task_send_back(p_task_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := btrim(coalesce(p_note, ''));
begin
  if t.employee_id = me or not (manages_employee(t.employee_id) or t.assigned_by = me) then raise exception 'Only the reporting manager can send a task back'; end if;
  if t.status = 'approved' then raise exception 'This task is already approved'; end if;
  if t.status <> 'done' then raise exception 'Only a task marked complete can be sent back'; end if;
  if v_note = '' then raise exception 'Say why it is going back'; end if;
  if length(v_note) > 2000 then raise exception 'Keep the reason under 2000 characters'; end if;
  update task_items set status = 'open', done_note = null, done_at = null, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'sent_back', me, v_note);
  perform task_mark_seen(t.id, me);
end $function$;

CREATE OR REPLACE FUNCTION public.task_set_due(p_task_id uuid, p_due_on date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id();
begin
  if t.employee_id = me then raise exception 'Change the due date of your own task with Change'; end if;
  if not (manages_employee(t.employee_id) or t.assigned_by = me) then raise exception 'Only the reporting manager can change the due date'; end if;
  if t.status = 'approved' then raise exception 'An approved task is reopened to give it a new due date'; end if;
  if p_due_on is not distinct from t.due_on then return; end if;
  perform task_check_due(p_due_on);
  update task_items set due_on = p_due_on, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note)
  values (t.id, 'due', me, format('%s → %s', to_char(t.due_on, 'FMDD Mon YYYY'), to_char(p_due_on, 'FMDD Mon YYYY')));
  perform task_mark_seen(t.id, me);
end $function$;

