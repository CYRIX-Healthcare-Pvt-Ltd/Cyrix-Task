/*
  mt_0004 — once the manager sets how critical a task is, it is the manager's to change.

  The user, 5 Oct: "once manager change the criticality, then the
  criticality cant be changed by the reportee". The person still chooses it
  when adding a task, and may change their own choice while the task is to
  do; once their manager has changed it, only the manager changes it again.

  task_list says who set it (criticality_set_by: the first name of whoever
  other than the person last changed it, null while it is the person's own
  choice), so the screen shows it as set by the manager rather than offering
  a change that would be refused. A column is added to what task_list
  returns, which needs the function dropped and made again; the app already
  live reads the columns it knows and passes over the new one.
*/

create or replace function public.task_set_criticality(p_task_id uuid, p_criticality text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_by text;
begin
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  if t.status = 'approved' then raise exception 'An approved task cannot be changed'; end if;
  if t.employee_id = me then
    if t.status <> 'open' then raise exception 'A completed task cannot be changed'; end if;
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
end $fn$;

drop function public.task_list(date, date, uuid, boolean);

create function public.task_list(p_from date, p_to date, p_employee_id uuid default null, p_team boolean default false)
returns table (
  id uuid, employee_id uuid, employee_name text, employee_ecode text,
  title text, details text, due_on date, criticality text, criticality_set_by text, status text,
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
         t.title, t.details, t.due_on, t.criticality,
         (select coalesce(split_part(b.full_name, ' ', 1), 'your manager')
            from task_events c left join employees b on b.id = c.by_id
            where c.task_id = t.id and c.kind = 'criticality' and c.by_id is distinct from t.employee_id
            order by c.at desc limit 1),
         t.status,
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

revoke all on function public.task_list(date, date, uuid, boolean) from public, anon;
grant execute on function public.task_list(date, date, uuid, boolean) to authenticated, service_role;
