-- mt_0024 (the user, 26 Nov: "how to delete self assigned task? better add delete button in edit").
-- The person may delete a task they added themselves while it is still to do; the reporting manager (or whoever
-- assigned it) may delete any of their people's tasks, as before. A copy still goes to the audit log.
CREATE OR REPLACE FUNCTION public.task_delete(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id();
begin
  if t.employee_id = me then
    if t.assigned_by is not null then raise exception 'Only the person who gave you this task can delete it'; end if;
    if t.status <> 'open' then raise exception 'A completed task cannot be deleted'; end if;
  elsif not (manages_employee(t.employee_id) or t.assigned_by = me) then
    raise exception 'Only the reporting manager can delete a task';
  end if;
  insert into audit_log (actor_id, entity_type, entity_id, action, details)
  values (me, 'task', t.id, 'deleted', jsonb_build_object(
    'task', to_jsonb(t),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.at, e.id), '[]'::jsonb) from task_events e where e.task_id = t.id)));
  delete from task_items where id = t.id;
end $function$;
