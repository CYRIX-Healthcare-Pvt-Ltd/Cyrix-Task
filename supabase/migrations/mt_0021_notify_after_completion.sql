-- =====================================================================
-- My Task  ·  mt_0021  ·  Notify my manager on a completed task too
--
-- The user, 20 Nov: "i task is already completed, and when toggle it on, show notification also". Turning it on for a
-- task already completed tells the manager now: the completion counts as not seen by them again, so their bell and
-- phone say "<Name> completed · <task>" and the task carries the new-update dot in My Team Task (push_bell_due,
-- tasks_team, as for a completion with it on from the start). Turning it off stays as it was. Replaces mt_0020.
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
  update task_items set notify_manager = v_on, updated_at = now() where id = t.id;
  -- Completed already: the latest completion is news to the manager again.
  if v_on and t.status <> 'open' then
    update task_events set seen_at = null
    where id = (select e.id from task_events e where e.task_id = t.id and e.kind = 'done' and e.by_id = t.employee_id
                order by e.at desc limit 1);
  end if;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'edited', me, jsonb_build_object('changes', jsonb_build_array(
    jsonb_build_object('what', 'Notify ' || coalesce((select split_part(m.full_name, ' ', 1) from employees o join employees m on m.id = o.reporting_manager_id where o.id = t.employee_id), 'the manager'),
      'from', case when t.notify_manager then 'On' else 'Off' end, 'to', case when v_on then 'On' else 'Off' end)))::text);
  perform task_mark_seen(t.id, me);
end $$;
