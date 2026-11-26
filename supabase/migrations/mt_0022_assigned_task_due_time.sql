-- =====================================================================
-- My Task  ·  mt_0022  ·  A due time on an assigned task
--
-- The user, 20 Nov: "when manager assigning team task there is no time, like we have in my task self". The manager
-- may give a due time beside the due date, as a person can on their own task (mt_0016); blank = the whole day.
-- =====================================================================

drop function if exists public.task_assign(uuid[], text, text, date, text, text, date);
CREATE FUNCTION public.task_assign(p_people uuid[], p_title text, p_details text, p_due_on date, p_criticality text, p_remarks text, p_release_on date DEFAULT NULL::date, p_due_at time DEFAULT NULL::time)
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
  -- A due time (mt_0022): not passed already, and after the task reaches them at 9 AM on the scheduled date.
  if p_due_at is not null and ((p_due_on + p_due_at) at time zone 'Asia/Kolkata') <= now() then
    raise exception 'That due time has passed';
  end if;
  if p_due_at is not null and p_due_on = v_release and p_due_at <= time '09:00' then
    raise exception 'The task reaches them at 9 AM, so the due time must be after 9 AM';
  end if;
  if task_criticality_word(p_criticality) is null then raise exception 'Choose how critical the task is'; end if;
  foreach v_person in array (select array_agg(distinct x) from unnest(p_people) x) loop
    if not exists (select 1 from task_people() p where p.id = v_person) then
      raise exception '% does not report to you, or does not have My Task',
        coalesce((select full_name from employees where id = v_person), 'Somebody chosen');
    end if;
    insert into task_items (employee_id, title, details, due_on, due_at, criticality, created_by, assigned_by, remarks, release_on)
    values (v_person, v_title, v_details, p_due_on, p_due_at, p_criticality, me, me, v_remarks, v_release)
    returning id into v_id;
    insert into task_events (task_id, kind, by_id, note) values (v_id, 'assigned', me, v_remarks);
    n := n + 1;
  end loop;
  -- Released now (for today, after 9 AM): mailed at once rather than at the next five-minute round (mt_0012).
  if ((v_release + time '09:00') at time zone 'Asia/Kolkata') <= now() then perform task_mail_call(); end if;
  return n;
end $function$;

revoke all on function public.task_assign(uuid[], text, text, date, text, text, date, time) from public, anon;
grant execute on function public.task_assign(uuid[], text, text, date, text, text, date, time) to authenticated;
