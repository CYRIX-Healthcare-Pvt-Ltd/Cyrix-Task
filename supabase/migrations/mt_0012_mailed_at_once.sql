/*
  mt_0012 — mailed at once (the user, 24 Oct: "why 5 mins? can't we trigger on assigning itself?"). Assigning a task
  that reaches the person now, or sending a reminder, asks task-mail to send straight away (KPI 0222's
  task_mail_call, through pg_net: the request goes once this is saved, so the button never waits for the mail).
  The five-minute round stays for what is released at 9 AM on a later day, and catches anything missed.
*/

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
  -- Released now (for today, after 9 AM): mailed at once rather than at the next five-minute round (mt_0012).
  if ((p_due_on + time '09:00') at time zone 'Asia/Kolkata') <= now() then perform task_mail_call(); end if;
  return n;
end $fn$;

CREATE OR REPLACE FUNCTION public.task_remind(p_task_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if t.employee_id = me or not manages_employee(t.employee_id) then raise exception 'Only the reporting manager can send a reminder'; end if;
  if t.status <> 'open' then raise exception 'This task is already marked complete'; end if;
  if length(v_note) > 1000 then raise exception 'Keep the reminder under 1000 characters'; end if;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'reminder', me, v_note);
  perform task_mark_seen(t.id, me);
  -- Mailed at once, if the task has reached the person (mt_0012).
  if t.assigned_by is null or ((t.due_on + time '09:00') at time zone 'Asia/Kolkata') <= now() then perform task_mail_call(); end if;
end $function$
;
