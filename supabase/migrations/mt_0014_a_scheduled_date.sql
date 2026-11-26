/*
  mt_0014 — a scheduled date beside the due date (the user, 29 Oct: "add new date field also ie task scheduled date and
  due date. so due should be same or greater than scheduled. so if scheduled is 30th and due is 2nd nov, so on 30th oct
  9 am it should come to hari"). An assigned task reaches the person, and is mailed, at 9 AM on its scheduled date
  (today: at once); the due date is when the work is expected done, on or after it. Tasks already there keep what they
  had: their scheduled date is their due date.
*/
alter table public.task_items add column if not exists release_on date;
update public.task_items set release_on = case when assigned_by is not null then due_on else least(due_on, (created_at at time zone 'Asia/Kolkata')::date) end
 where release_on is null;
alter table public.task_items alter column release_on set default ((now() at time zone 'Asia/Kolkata')::date);
alter table public.task_items alter column release_on set not null;

drop function if exists public.task_list(date, date, uuid, boolean);
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

CREATE FUNCTION public.task_list(p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid, p_team boolean DEFAULT false)
 RETURNS TABLE(id uuid, employee_id uuid, employee_name text, employee_ecode text, title text, details text, due_on date, due_set_by text, criticality text, criticality_set_by text, status text, done_note text, done_at timestamp with time zone, approved_at timestamp with time zone, approved_by_name text, created_at timestamp with time zone, updated_at timestamp with time zone, reminders integer, last_reminded_at timestamp with time zone, comments integer, sent_back integer, reopened integer, unseen integer, unseen_kinds text[], assigned_by_name text, remarks text, progress integer, release_on date)
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
         asg.full_name, t.remarks, t.progress, t.release_on
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
    and (t.assigned_by is null or ((t.release_on + time '09:00') at time zone 'Asia/Kolkata') <= now() or t.employee_id <> (select id from me))
  order by t.due_on, t.created_at$function$;

revoke all on function public.task_list(date, date, uuid, boolean) from public, anon;
grant execute on function public.task_list(date, date, uuid, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.push_bell_due()
 RETURNS TABLE(employee_id uuid, kind text, n integer, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r  record;
  f  record;
  st push_bell_state%rowtype;
  kinds text[];
begin
  -- Revive Lab, worked out once for everybody.
  drop table if exists _rw;
  create temp table _rw on commit drop as select * from revive_waiting_now();

  for r in
    select distinct e.id, e.auth_user_id
    from push_subscriptions s join employees e on e.id = s.employee_id
    where e.is_active and e.auth_user_id is not null
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.auth_user_id, 'role', 'authenticated')::text, true);
    kinds := '{}';
    for f in
      select x.kind, x.n, x.latest, null::text as detail from my_notifications() x
      union all
      select 'revive', count(distinct w.ticket_id)::int, max(w.at),
             (select string_agg(y.code || ' · ' || y.why, ', ' order by y.at desc)
              from (select * from _rw z where z.employee_id = r.id order by z.at desc limit 3) y)
      from _rw w where w.employee_id = r.id
      having count(*) > 0
      union all
      select 'revive_team', count(*)::int, max(t.created_at),
             (select split_part(m.full_name, ' ', 1) || ' raised ' || tt.code || coalesce(' · ' || nullif(tt.spare_name, ''), '')
              from revive_tickets tt join employees m on m.id = tt.raised_by
              where m.reporting_manager_id = r.id and tt.created_at > now() - interval '30 days'
              order by tt.created_at desc limit 1)
      from revive_tickets t join employees m on m.id = t.raised_by
      where m.reporting_manager_id = r.id and t.created_at > now() - interval '30 days'
      having count(*) > 0
      union all
      -- My Task (0220): what the manager did on this person's tasks, not opened yet — a task assigned, a reminder…
      select 'tasks', count(distinct e.task_id)::int, max(e.at),
             (select split_part(coalesce(b.full_name, 'Your manager'), ' ', 1) || ' ' || case e2.kind
                when 'assigned' then 'assigned you' when 'reminder' then 'sent a reminder on' when 'sent_back' then 'sent back'
                when 'approved' then 'approved' when 'reopened' then 'reopened' when 'due' then 'changed the due date of'
                when 'criticality' then 'changed how critical' when 'comment' then 'commented on'
                when 'progress' then coalesce(e2.note, 'updated progress') || ' on' when 'done' then 'completed' else 'changed' end
              || ' · ' || t2.title
              from task_events e2 join task_items t2 on t2.id = e2.task_id left join employees b on b.id = e2.by_id
              where t2.employee_id = r.id and e2.seen_at is null and (t2.assigned_by is null or ((t2.release_on + time '09:00') at time zone 'Asia/Kolkata') <= now()) and e2.by_id is distinct from r.id and e2.kind in ('assigned', 'reminder', 'sent_back', 'approved', 'reopened', 'due', 'criticality', 'comment')
              order by e2.at desc limit 1)
      from task_events e join task_items t on t.id = e.task_id
      where t.employee_id = r.id and e.seen_at is null and (t.assigned_by is null or ((t.release_on + time '09:00') at time zone 'Asia/Kolkata') <= now()) and e.by_id is distinct from r.id and e.kind in ('assigned', 'reminder', 'sent_back', 'approved', 'reopened', 'due', 'criticality', 'comment')
      having count(*) > 0
      union all
      -- …and, to the manager who assigned a task, the person's progress, completion and comments on it.
      select 'tasks_team', count(distinct e.task_id)::int, max(e.at),
             (select split_part(coalesce(b.full_name, 'Your manager'), ' ', 1) || ' ' || case e2.kind
                when 'assigned' then 'assigned you' when 'reminder' then 'sent a reminder on' when 'sent_back' then 'sent back'
                when 'approved' then 'approved' when 'reopened' then 'reopened' when 'due' then 'changed the due date of'
                when 'criticality' then 'changed how critical' when 'comment' then 'commented on'
                when 'progress' then coalesce(e2.note, 'updated progress') || ' on' when 'done' then 'completed' else 'changed' end
              || ' · ' || t2.title
              from task_events e2 join task_items t2 on t2.id = e2.task_id left join employees b on b.id = e2.by_id
              where t2.assigned_by = r.id and e2.by_id = t2.employee_id and e2.seen_at is null and e2.kind in ('progress', 'done', 'comment')
              order by e2.at desc limit 1)
      from task_events e join task_items t on t.id = e.task_id
      where t.assigned_by = r.id and e.by_id = t.employee_id and e.seen_at is null and e.kind in ('progress', 'done', 'comment')
      having count(*) > 0
    loop
      kinds := kinds || f.kind;
      select * into st from push_bell_state b where b.employee_id = r.id and b.kind = f.kind;
      if not found
         or f.n > st.n
         or coalesce(f.latest, '-infinity') > coalesce(st.latest, '-infinity') then
        employee_id := r.id; kind := f.kind; n := f.n; detail := f.detail;
        return next;
      end if;
      insert into push_bell_state as b (employee_id, kind, n, latest)
      values (r.id, f.kind, f.n, f.latest)
      on conflict on constraint push_bell_state_pkey do update set n = excluded.n, latest = excluded.latest;
    end loop;
    delete from push_bell_state b where b.employee_id = r.id and not (b.kind = any (kinds));
  end loop;
  perform set_config('request.jwt.claims', '', true);
end $function$;

CREATE OR REPLACE FUNCTION public.task_mail_claim(p_limit integer DEFAULT 40)
 RETURNS TABLE(kind text, id uuid, email text, first_name text, title text, details text, due_on date, criticality text, remarks text, by_name text, by_ecode text, progress integer, reminder_no integer, note text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare lim integer := greatest(1, least(coalesce(p_limit, 40), 200)); n integer;
begin
  -- What was assigned and has reached the person: once each.
  return query
  with c as (
    select t.id from task_items t
     where t.assigned_by is not null and t.mailed_at is null and t.status = 'open'
       and ((t.release_on + time '09:00') at time zone 'Asia/Kolkata') <= now()
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
       and (t.assigned_by is null or ((t.release_on + time '09:00') at time zone 'Asia/Kolkata') <= now())
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
  if t.assigned_by is null or ((t.release_on + time '09:00') at time zone 'Asia/Kolkata') <= now() then perform task_mail_call(); end if;
end$function$;

drop function if exists public.task_assign(uuid[], text, text, date, text, text);
CREATE FUNCTION public.task_assign(p_people uuid[], p_title text, p_details text, p_due_on date, p_criticality text, p_remarks text, p_release_on date DEFAULT NULL::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := current_employee_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
  v_person uuid; v_id uuid; n integer := 0;
  v_release date := coalesce(p_release_on, task_today());
begin
  if me is null or not task_has_access() then raise exception 'My Task has not been given to you yet'; end if;
  if coalesce(cardinality(p_people), 0) = 0 then raise exception 'Choose who the task is for'; end if;
  if cardinality(p_people) > 500 then raise exception 'Assign to at most 500 people at a time'; end if;
  if v_title = '' then raise exception 'Give the task a name'; end if;
  if length(v_title) > 200 then raise exception 'Keep the task name under 200 characters'; end if;
  if length(v_details) > 4000 then raise exception 'Keep the description under 4000 characters'; end if;
  if length(v_remarks) > 2000 then raise exception 'Keep the remarks under 2000 characters'; end if;
  perform task_check_due(p_due_on);
  if v_release < task_today() then raise exception 'The scheduled date cannot be before today'; end if;
  if p_due_on < v_release then raise exception 'The due date cannot be before the scheduled date'; end if;
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  foreach v_person in array (select array_agg(distinct x) from unnest(p_people) x) loop
    if not exists (select 1 from task_people() p where p.id = v_person) then
      raise exception '% does not report to you, or does not have My Task',
        coalesce((select full_name from employees where id = v_person), 'Somebody chosen');
    end if;
    insert into task_items (employee_id, title, details, due_on, criticality, created_by, assigned_by, remarks, release_on)
    values (v_person, v_title, v_details, p_due_on, p_criticality, me, me, v_remarks, v_release)
    returning id into v_id;
    insert into task_events (task_id, kind, by_id, note) values (v_id, 'assigned', me, v_remarks);
    n := n + 1;
  end loop;
  -- Released now (for today, after 9 AM): mailed at once rather than at the next five-minute round (mt_0012).
  if ((v_release + time '09:00') at time zone 'Asia/Kolkata') <= now() then perform task_mail_call(); end if;
  return n;
end $function$;

revoke all on function public.task_assign(uuid[], text, text, date, text, text, date) from public, anon;
grant execute on function public.task_assign(uuid[], text, text, date, text, text, date) to authenticated;

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
  if p_due_on < t.release_on then raise exception 'The due date cannot be before the scheduled date'; end if;
  update task_items set due_on = p_due_on, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note)
  values (t.id, 'due', me, format('%s → %s', to_char(t.due_on, 'FMDD Mon YYYY'), to_char(p_due_on, 'FMDD Mon YYYY')));
  perform task_mark_seen(t.id, me);
end$function$;

