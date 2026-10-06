/*
  mt_0005 — the manager reopens a completed task and keeps a due date they
  set; the person's comments close once they mark a task complete.

  The user, 6 Oct: "when manager is approving completion, still emp has
  option to enter new comments, that not needed and here manager can reopen
  task even if it is completed and manager can change the due date, once
  manager is changing the due date then the emp cannot change it but manager
  can change anytime."

  Comments. A task marked complete is with the manager, who approves it or
  sends it back with a reason. From then the person writes no more comments
  on it, until it comes back to them, sent back or reopened. The manager
  still comments.

  Reopening. An approved task was final. Now the manager reopens it with a
  reason, and may give it a new due date in the same step. It is to do again
  for the person: its completion and approval are cleared from the task, and
  both stay in its history. A task still waiting for approval is sent back,
  as before.

  The due date. The manager changes it whenever the task is not approved
  (to do, overdue or waiting) and when reopening it. Once the manager has
  changed it, only the manager changes it again, as with criticality
  (mt_0004). The person still changes the name and the description.

  task_list adds two columns. due_set_by is the first name of the manager who
  last changed the due date, null while the date is the person's own.
  reopened counts how often the task was reopened. Adding columns needs
  task_list dropped and made again; the live app reads the columns it knows
  and ignores the new ones.

  Two steps join the history: 'due', when the manager changes the due date
  ("30 Sep 2026 → 9 Oct 2026"), and 'reopened', which carries the reason. The
  person sees both marked new, as they see a reminder.
*/

alter table public.task_events drop constraint task_events_kind_check;
alter table public.task_events add constraint task_events_kind_check
  check (kind in ('created', 'edited', 'criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened'));

-- Acting on a task is seeing it: what the other side did before is no longer new.
create or replace function public.task_mark_seen(p_task_id uuid, p_me uuid)
returns void language sql security definer set search_path to 'public' as $fn$
  update task_events set seen_at = now()
  where task_id = p_task_id and seen_at is null and by_id is distinct from p_me
    and kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened')
$fn$;

-- Name, description and due date, while the task is still to do. What changed is kept in the history.
-- A due date the manager set is the manager's to change (mt_0005).
create or replace function public.task_edit(p_task_id uuid, p_title text, p_details text, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $fn$
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
end $fn$;

-- Marked complete, a task is with the manager: the person's comments close until it comes back to them (mt_0005).
create or replace function public.task_comment(p_task_id uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := btrim(coalesce(p_note, ''));
begin
  if t.employee_id = me and t.status <> 'open' then raise exception 'Comments are closed once you mark the task complete'; end if;
  if v_note = '' then raise exception 'Write the comment first'; end if;
  if length(v_note) > 2000 then raise exception 'Keep the comment under 2000 characters'; end if;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'comment', me, v_note);
  perform task_mark_seen(t.id, me);
end $fn$;

-- The due date, changed by the reporting manager whenever the task is not approved. Theirs to change from then on.
create or replace function public.task_set_due(p_task_id uuid, p_due_on date)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id();
begin
  if t.employee_id = me then raise exception 'Change the due date of your own task with Change'; end if;
  if not manages_employee(t.employee_id) then raise exception 'Only the reporting manager can change the due date'; end if;
  if t.status = 'approved' then raise exception 'An approved task is reopened to give it a new due date'; end if;
  if p_due_on is not distinct from t.due_on then return; end if;
  perform task_check_due(p_due_on);
  update task_items set due_on = p_due_on, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note)
  values (t.id, 'due', me, format('%s → %s', to_char(t.due_on, 'FMDD Mon YYYY'), to_char(p_due_on, 'FMDD Mon YYYY')));
  perform task_mark_seen(t.id, me);
end $fn$;

-- An approved task back to the person, to do again, with the reason; and a new due date if the manager gives one.
create or replace function public.task_reopen(p_task_id uuid, p_note text, p_due_on date default null)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare
  t task_items := task_lock(p_task_id);
  me uuid := current_employee_id();
  v_note text := btrim(coalesce(p_note, ''));
  v_due date := coalesce(p_due_on, t.due_on);
begin
  if t.employee_id = me or not manages_employee(t.employee_id) then raise exception 'Only the reporting manager can reopen a task'; end if;
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
end $fn$;

drop function public.task_list(date, date, uuid, boolean);

create function public.task_list(p_from date, p_to date, p_employee_id uuid default null, p_team boolean default false)
returns table (
  id uuid, employee_id uuid, employee_name text, employee_ecode text,
  title text, details text, due_on date, due_set_by text, criticality text, criticality_set_by text, status text,
  done_note text, done_at timestamptz, approved_at timestamptz, approved_by_name text,
  created_at timestamptz, updated_at timestamptz,
  reminders integer, last_reminded_at timestamptz, comments integer, sent_back integer, reopened integer,
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
         t.title, t.details, t.due_on,
         (select coalesce(split_part(b.full_name, ' ', 1), 'your manager')
            from task_events d left join employees b on b.id = d.by_id
            where d.task_id = t.id and d.kind = 'due' and d.by_id is distinct from t.employee_id
            order by d.at desc limit 1),
         t.criticality,
         (select coalesce(split_part(b.full_name, ' ', 1), 'your manager')
            from task_events c left join employees b on b.id = c.by_id
            where c.task_id = t.id and c.kind = 'criticality' and c.by_id is distinct from t.employee_id
            order by c.at desc limit 1),
         t.status,
         t.done_note, t.done_at, t.approved_at, a.full_name,
         t.created_at, t.updated_at,
         coalesce(ev.reminders, 0), ev.last_reminded_at, coalesce(ev.comments, 0), coalesce(ev.sent_back, 0), coalesce(ev.reopened, 0),
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
           count(*) filter (where e.kind = 'reopened')::int as reopened,
           count(*) filter (where e.seen_at is null and e.by_id is distinct from (select id from me)
                              and e.kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened'))::int as unseen,
           array_agg(distinct e.kind) filter (where e.seen_at is null and e.by_id is distinct from (select id from me)
                              and e.kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened')) as unseen_kinds
    from task_events e where e.task_id = t.id
  ) ev on true
  where t.status <> 'approved' or t.due_on between p_from and p_to
  order by t.due_on, t.created_at
$fn$;

revoke all on function public.task_list(date, date, uuid, boolean) from public, anon;
grant execute on function public.task_list(date, date, uuid, boolean) to authenticated, service_role;
revoke all on function public.task_set_due(uuid, date) from public, anon;
grant execute on function public.task_set_due(uuid, date) to authenticated, service_role;
revoke all on function public.task_reopen(uuid, text, date) from public, anon;
grant execute on function public.task_reopen(uuid, text, date) to authenticated, service_role;
