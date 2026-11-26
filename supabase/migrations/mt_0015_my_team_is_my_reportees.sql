/*
  mt_0015 — "my team" is my own reportees (the user, 29 Oct: "for Mohandas, we dont need to show all under reportees data,
  in dashboard and summary only his team ... if mohandas assigned to jisha, that task count should show"). Everyone in
  my team = my direct reportees' tasks plus every task I assigned, anywhere below me. One person picked still opens
  anyone in the line, and Assign still offers the whole line.
*/
CREATE OR REPLACE FUNCTION public.task_list(p_from date, p_to date, p_employee_id uuid DEFAULT NULL::uuid, p_team boolean DEFAULT false)
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
