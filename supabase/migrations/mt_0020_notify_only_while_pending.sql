-- =====================================================================
-- My Task  ·  mt_0020  ·  Notify my manager only on a pending task
--
-- The user, 18 Nov: "ya only pending". Turning it on for a completed task would only tell the manager of work
-- already finished; it can still be turned off.
-- =====================================================================

create or replace function public.task_set_notify(p_task_id uuid, p_on boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_on boolean := coalesce(p_on, false);
begin
  if t.assigned_by is not null then raise exception 'An assigned task already tells the manager who assigned it'; end if;
  if me is distinct from t.employee_id
     and me is distinct from (select reporting_manager_id from employees where id = t.employee_id) then
    raise exception 'Only the person or their manager can change this';
  end if;
  if v_on = t.notify_manager then return; end if;
  if v_on and t.status <> 'open' then raise exception 'Only a pending task can tell your manager'; end if;
  update task_items set notify_manager = v_on, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'edited', me, jsonb_build_object('changes', jsonb_build_array(
    jsonb_build_object('what', 'Notify ' || coalesce((select split_part(m.full_name, ' ', 1) from employees o join employees m on m.id = o.reporting_manager_id where o.id = t.employee_id), 'the manager'),
      'from', case when t.notify_manager then 'On' else 'Off' end, 'to', case when v_on then 'On' else 'Off' end)))::text);
  perform task_mark_seen(t.id, me);
end $$;
