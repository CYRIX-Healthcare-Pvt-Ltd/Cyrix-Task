-- =====================================================================
-- My Task  ·  mt_0016  ·  A due time, and Notify my manager
--
-- The user, 18 Nov: "Need due date, due time and notify my manager toggle", "bell on add, complete and overdue",
-- "due time is not mandatory, it should be blank ... only date means that full day is ok".
--   due_at          optional; blank = the whole day
--   notify_manager  the owner's own task: their manager gets a bell when it is added, completed, and overdue
--   overdue         a new event, written once when the due date (and time) has passed and it is still open
-- =====================================================================

alter table task_items add column if not exists due_at time;
alter table task_items add column if not exists notify_manager boolean not null default false;

alter table task_events drop constraint task_events_kind_check;
alter table task_events add constraint task_events_kind_check check (kind = any (array['created', 'edited', 'criticality', 'due',
  'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened', 'assigned', 'progress', 'overdue']));

drop function if exists public.task_add(text, text, date, text);
create or replace function public.task_add(p_title text, p_details text, p_due_on date, p_criticality text,
  p_due_at time default null, p_notify_manager boolean default false)
 returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := current_employee_id(); v_id uuid;
begin
  if me is null or not task_has_access() then raise exception 'My Task has not been given to you yet'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Give the task a name'; end if;
  if length(btrim(p_title)) > 200 then raise exception 'Keep the task name under 200 characters'; end if;
  if length(p_details) > 4000 then raise exception 'Keep the description under 4000 characters'; end if;
  perform task_check_due(p_due_on);
  if p_due_at is not null and ((p_due_on + p_due_at) at time zone 'Asia/Kolkata') <= now() then
    raise exception 'That due time has passed';
  end if;
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  if coalesce(p_notify_manager, false) and (select reporting_manager_id from employees where id = me) is null then
    raise exception 'You have no manager on record to notify';
  end if;
  insert into task_items (employee_id, title, details, due_on, due_at, notify_manager, criticality, created_by)
  values (me, btrim(p_title), nullif(btrim(p_details), ''), p_due_on, p_due_at, coalesce(p_notify_manager, false), p_criticality, me)
  returning id into v_id;
  insert into task_events (task_id, kind, by_id) values (v_id, 'created', me);
  return v_id;
end $$;
revoke all on function public.task_add(text, text, date, text, time, boolean) from public, anon;
grant execute on function public.task_add(text, text, date, text, time, boolean) to authenticated;

-- Past its due date (end of the day when no time) and still open: an 'overdue' event by the owner, once.
create or replace function public.task_mark_overdue()
 returns void language sql security definer set search_path to 'public'
as $$
  insert into task_events (task_id, kind, by_id)
  select t.id, 'overdue', t.employee_id
  from task_items t
  where t.notify_manager and t.status = 'open'
    and ((t.due_on + coalesce(t.due_at, time '23:59:59')) at time zone 'Asia/Kolkata') < now()
    and not exists (select 1 from task_events e where e.task_id = t.id and e.kind = 'overdue')
$$;
revoke all on function public.task_mark_overdue() from public, anon, authenticated;

drop function if exists public.task_list(date, date, uuid, boolean);
CREATE OR REPLACE FUNCTION public.task_list(p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid, p_team boolean DEFAULT false)
 RETURNS TABLE(id uuid, employee_id uuid, employee_name text, employee_ecode text, title text, details text, due_on date, due_set_by text, criticality text, criticality_set_by text, status text, done_note text, done_at timestamp with time zone, approved_at timestamp with time zone, approved_by_name text, created_at timestamp with time zone, updated_at timestamp with time zone, reminders integer, last_reminded_at timestamp with time zone, comments integer, sent_back integer, reopened integer, unseen integer, unseen_kinds text[], assigned_by_name text, remarks text, progress integer, release_on date, due_at time without time zone, notify_manager boolean)
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
         asg.full_name, t.remarks, t.progress, t.release_on, t.due_at, t.notify_manager
  from task_items t
  join whose w on w.id = t.employee_id
   and (not p_team or (select x.reporting_manager_id from employees x where x.id = t.employee_id) = current_employee_id() or t.assigned_by = current_employee_id())
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
  ids uuid[];
begin
  -- My Task (mt_0016): an overdue task whose owner asked for their manager to be told, written once.
  perform task_mark_overdue();

  -- Revive Lab, worked out once for everybody.
  drop table if exists _rw;
  create temp table _rw on commit drop as select * from revive_waiting_now();

  ids := array(select distinct e.id from push_subscriptions s join employees e on e.id = s.employee_id
               where e.is_active and e.auth_user_id is not null);
  -- KPI's own bell lines, worked out once for everybody (0291: 774 one-by-one calls took 5 s).
  drop table if exists _nt;
  create temp table _nt on commit drop as select * from bell_notifications_all(ids);
  create index on _nt (employee_id);

  for r in select x as id from unnest(ids) x
  loop
    kinds := '{}';
    for f in
      select x.kind, x.n, x.latest, null::text as detail from _nt x where x.employee_id = r.id
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
                when 'progress' then coalesce(e2.note, 'updated progress') || ' on' when 'done' then 'completed' when 'created' then 'added' when 'overdue' then 'is overdue on' else 'changed' end
              || ' · ' || t2.title
              from task_events e2 join task_items t2 on t2.id = e2.task_id left join employees b on b.id = e2.by_id
              where e2.by_id = t2.employee_id and e2.seen_at is null and (
              (t2.assigned_by = r.id and e2.kind in ('progress', 'done', 'comment'))
              or (t2.assigned_by is null and t2.notify_manager and e2.kind in ('created', 'done', 'overdue')
                  and exists (select 1 from employees o where o.id = t2.employee_id and o.reporting_manager_id = r.id)))
              order by e2.at desc limit 1)
      from task_events e join task_items t on t.id = e.task_id
      where e.by_id = t.employee_id and e.seen_at is null and (
              (t.assigned_by = r.id and e.kind in ('progress', 'done', 'comment'))
              or (t.assigned_by is null and t.notify_manager and e.kind in ('created', 'done', 'overdue')
                  and exists (select 1 from employees o where o.id = t.employee_id and o.reporting_manager_id = r.id)))
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
end $function$;
