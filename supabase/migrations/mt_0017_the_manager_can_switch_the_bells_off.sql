-- =====================================================================
-- My Task  ·  mt_0017  ·  The manager can switch Notify my manager off
--
-- The user, 18 Nov: "the manager can turn of notification also ie if amal enables it if manager thinks not needed,
-- he can disable it". The owner of the task or their reporting manager sets it, on the owner's own tasks only.
-- =====================================================================

create or replace function public.task_set_notify(p_task_id uuid, p_on boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id();
begin
  if t.assigned_by is not null then raise exception 'An assigned task already tells the manager who assigned it'; end if;
  if me is distinct from t.employee_id
     and me is distinct from (select reporting_manager_id from employees where id = t.employee_id) then
    raise exception 'Only the person or their manager can change this';
  end if;
  update task_items set notify_manager = coalesce(p_on, false), updated_at = now() where id = t.id;
end $$;
revoke all on function public.task_set_notify(uuid, boolean) from public, anon;
grant execute on function public.task_set_notify(uuid, boolean) to authenticated;
