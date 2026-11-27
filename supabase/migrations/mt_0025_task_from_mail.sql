-- mt_0025 (the user, 27 Nov: "should we give mail link or something? if i click that in cyra app, it should redirect
-- to that mail"). A task made from Outlook (Make task add-in) keeps the mail's subject, sender and Outlook web link.
-- The link opens only in the mailbox it came from, so task_mail gives it to the task's maker alone; the others see
-- the subject and sender. No copy of the mail is kept.

alter table task_items add column if not exists mail_link text;
alter table task_items add column if not exists mail_subject text;
alter table task_items add column if not exists mail_from text;

-- The mail as the add-in sends it: {link, subject, from}; null when the task was not made from a mail.
create or replace function public.task_mail_fields(p_mail jsonb)
 returns table(link text, subject text, sender text)
 language plpgsql immutable
as $function$
declare v_link text := btrim(coalesce(p_mail->>'link', ''));
begin
  if p_mail is null or v_link = '' then return; end if;
  if v_link !~ '^https://outlook\.(office|office365)\.com/' or length(v_link) > 2000 then
    raise exception 'That mail link is not an Outlook link';
  end if;
  link := v_link;
  subject := left(nullif(btrim(coalesce(p_mail->>'subject', '')), ''), 300);
  sender := left(nullif(btrim(coalesce(p_mail->>'from', '')), ''), 200);
  return next;
end $function$;
revoke all on function public.task_mail_fields(jsonb) from public, anon;

drop function if exists public.task_add(text, text, date, text, time without time zone, boolean);
CREATE OR REPLACE FUNCTION public.task_add(p_title text, p_details text, p_due_on date, p_criticality text, p_due_at time without time zone DEFAULT NULL::time without time zone, p_notify_manager boolean DEFAULT false, p_mail jsonb DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me uuid := current_employee_id(); v_id uuid; m record;
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
  select * into m from task_mail_fields(p_mail);
  insert into task_items (employee_id, title, details, due_on, due_at, notify_manager, criticality, created_by, mail_link, mail_subject, mail_from)
  values (me, btrim(p_title), nullif(btrim(p_details), ''), p_due_on, p_due_at, coalesce(p_notify_manager, false), p_criticality, me, m.link, m.subject, m.sender)
  returning id into v_id;
  insert into task_events (task_id, kind, by_id) values (v_id, 'created', me);
  return v_id;
end $function$;
revoke all on function public.task_add(text, text, date, text, time without time zone, boolean, jsonb) from public, anon;
grant execute on function public.task_add(text, text, date, text, time without time zone, boolean, jsonb) to authenticated;

drop function if exists public.task_assign(uuid[], text, text, date, text, text, date, time without time zone);
CREATE OR REPLACE FUNCTION public.task_assign(p_people uuid[], p_title text, p_details text, p_due_on date, p_criticality text, p_remarks text, p_release_on date DEFAULT NULL::date, p_due_at time without time zone DEFAULT NULL::time without time zone, p_mail jsonb DEFAULT NULL)
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
  m record;
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
  -- A due time (mt_0022): not passed already, and after the task reaches them at 9 AM on the scheduled date.
  if p_due_at is not null and ((p_due_on + p_due_at) at time zone 'Asia/Kolkata') <= now() then
    raise exception 'That due time has passed';
  end if;
  if p_due_at is not null and p_due_on = v_release and p_due_at <= time '09:00' then
    raise exception 'The task reaches them at 9 AM, so the due time must be after 9 AM';
  end if;
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  select * into m from task_mail_fields(p_mail);
  foreach v_person in array (select array_agg(distinct x) from unnest(p_people) x) loop
    if not exists (select 1 from task_people() p where p.id = v_person) then
      raise exception '% does not report to you, or does not have My Task',
        coalesce((select full_name from employees where id = v_person), 'Somebody chosen');
    end if;
    insert into task_items (employee_id, title, details, due_on, due_at, criticality, created_by, assigned_by, remarks, release_on, mail_link, mail_subject, mail_from)
    values (v_person, v_title, v_details, p_due_on, p_due_at, p_criticality, me, me, v_remarks, v_release, m.link, m.subject, m.sender)
    returning id into v_id;
    insert into task_events (task_id, kind, by_id, note) values (v_id, 'assigned', me, v_remarks);
    n := n + 1;
  end loop;
  -- Released now (for today, after 9 AM): mailed at once rather than at the next five-minute round (mt_0012).
  if ((v_release + time '09:00') at time zone 'Asia/Kolkata') <= now() then perform task_mail_call(); end if;
  return n;
end $function$;
revoke all on function public.task_assign(uuid[], text, text, date, text, text, date, time without time zone, jsonb) from public, anon;
grant execute on function public.task_assign(uuid[], text, text, date, text, text, date, time without time zone, jsonb) to authenticated;

-- The mail a task came from, for whoever may see the task; the link to its maker only.
create or replace function public.task_mail(p_task_id uuid)
 returns table(subject text, sender text, link text)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select t.mail_subject, t.mail_from, case when t.created_by = current_employee_id() then t.mail_link end
  from task_items t
  where t.id = p_task_id and t.mail_link is not null and task_has_access()
    and (t.employee_id = current_employee_id() or t.created_by = current_employee_id() or t.assigned_by = current_employee_id()
         or t.employee_id in (select p.id from task_people() p))
$function$;
revoke all on function public.task_mail(uuid) from public, anon;
grant execute on function public.task_mail(uuid) to authenticated;


-- The list carries the mail too (mt_0025): its subject for everyone, the link for the task's maker.
drop function if exists public.task_list(date, date, uuid, boolean);
CREATE FUNCTION public.task_list(p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid, p_team boolean DEFAULT false)
 RETURNS TABLE(id uuid, employee_id uuid, employee_name text, employee_ecode text, title text, details text, due_on date, due_set_by text, criticality text, criticality_set_by text, status text, done_note text, done_at timestamp with time zone, approved_at timestamp with time zone, approved_by_name text, created_at timestamp with time zone, updated_at timestamp with time zone, reminders integer, last_reminded_at timestamp with time zone, comments integer, sent_back integer, reopened integer, unseen integer, unseen_kinds text[], assigned_by_name text, remarks text, progress integer, release_on date, due_at time without time zone, notify_manager boolean, mail_subject text, mail_link text)
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
         asg.full_name, t.remarks, t.progress, t.release_on, t.due_at, t.notify_manager,
         t.mail_subject, case when t.created_by = current_employee_id() then t.mail_link end
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
                              and (e.kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened', 'assigned', 'progress')
                                   or (t.notify_manager and e.kind in ('created', 'overdue'))))::int as unseen,
           array_agg(distinct e.kind) filter (where e.seen_at is null and e.by_id is distinct from (select id from me)
                              and (e.kind in ('criticality', 'due', 'comment', 'reminder', 'done', 'sent_back', 'approved', 'reopened', 'assigned', 'progress')
                                   or (t.notify_manager and e.kind in ('created', 'overdue')))) as unseen_kinds
    from task_events e where e.task_id = t.id
  ) ev on true
  where (t.status <> 'approved' or t.due_on between p_from and p_to)
    -- A task assigned for a later day reaches the person at 9 AM that day (mt_0010); their manager sees it from the start.
    and (t.assigned_by is null or ((t.release_on + time '09:00') at time zone 'Asia/Kolkata') <= now() or t.employee_id <> (select id from me))
  order by t.due_on, t.created_at$function$;
revoke all on function public.task_list(date, date, uuid, boolean) from public, anon;
grant execute on function public.task_list(date, date, uuid, boolean) to authenticated;

-- A task added before mt_0025 gets its mail from Outlook: open the mail, My Task, Link (the user, 27 Nov: "for already
-- added, get the link and add it"). Only the task's maker, only a task with no mail yet.
create or replace function public.task_link_mail(p_task_id uuid, p_mail jsonb)
 returns void
 language plpgsql security definer
 set search_path to 'public'
as $function$
declare m record;
begin
  if not task_has_access() then raise exception 'My Task has not been given to you yet'; end if;
  select * into m from task_mail_fields(p_mail);
  if m.link is null then raise exception 'No mail to link'; end if;
  update task_items set mail_link = m.link, mail_subject = m.subject, mail_from = m.sender
   where id = p_task_id and created_by = current_employee_id() and mail_link is null;
  if not found then raise exception 'That task is not yours, or already has a mail'; end if;
end $function$;
revoke all on function public.task_link_mail(uuid, jsonb) from public, anon;
grant execute on function public.task_link_mail(uuid, jsonb) to authenticated;
