-- =====================================================================
-- My Task  ·  mt_0018  ·  The history says what changed to what
--
-- The user, 18 Nov: "if time date changed, whatever changed just show it what was changed to what". A change is
-- kept as {"changes":[{"what":"Due date","from":"18 Nov 2026","to":"20 Nov 2026"}, ...]} in the event's note, and the
-- app shows each as was → now. The description is kept whole on both sides. The due time is changed here too
-- (p_set_time: an app that does not know due times leaves it as it is), and Notify my manager switched on or off
-- is kept in the history the same way.
-- =====================================================================

drop function if exists public.task_edit(uuid, text, text, date);
create or replace function public.task_edit(p_task_id uuid, p_title text, p_details text, p_due_on date,
  p_due_at time default null, p_set_time boolean default false)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  t task_items := task_lock(p_task_id);
  me uuid := current_employee_id();
  v_title text := btrim(coalesce(p_title, ''));
  v_details text := nullif(btrim(coalesce(p_details, '')), '');
  v_due_at time := case when p_set_time then p_due_at else t.due_at end;
  v_by text;
  changes jsonb := '[]';
begin
  if t.employee_id <> me then raise exception 'Only the person whose task it is can change it'; end if;
  if t.status <> 'open' then raise exception 'A completed task cannot be changed'; end if;
  if t.assigned_by is not null then
    raise exception '% assigned this task, so its name, description and due date stay as % set them',
      coalesce((select split_part(full_name, ' ', 1) from employees where id = t.assigned_by), 'Your manager'),
      coalesce((select split_part(full_name, ' ', 1) from employees where id = t.assigned_by), 'your manager');
  end if;
  if v_title = '' then raise exception 'Give the task a name'; end if;
  if length(v_title) > 200 then raise exception 'Keep the task name under 200 characters'; end if;
  if length(v_details) > 4000 then raise exception 'Keep the description under 4000 characters'; end if;
  if p_due_on is distinct from t.due_on or v_due_at is distinct from t.due_at then
    select split_part(b.full_name, ' ', 1) into v_by
    from task_events e left join employees b on b.id = e.by_id
    where e.task_id = t.id and e.kind = 'due' and e.by_id is distinct from t.employee_id
    order by e.at desc limit 1;
    if found then
      raise exception '%', case when v_by is null
        then 'Your manager set the due date, so only your manager can change it'
        else format('%s set the due date, so only %s can change it', v_by, v_by) end;
    end if;
  end if;
  if p_due_on is distinct from t.due_on then perform task_check_due(p_due_on); end if;
  if v_due_at is not null and v_due_at is distinct from t.due_at
     and ((p_due_on + v_due_at) at time zone 'Asia/Kolkata') <= now() then
    raise exception 'That due time has passed';
  end if;

  if v_title <> t.title then
    changes := changes || jsonb_build_object('what', 'Name', 'from', t.title, 'to', v_title);
  end if;
  if v_details is distinct from t.details then
    changes := changes || jsonb_build_object('what', 'Description', 'from', coalesce(t.details, ''), 'to', coalesce(v_details, ''));
  end if;
  if p_due_on <> t.due_on then
    changes := changes || jsonb_build_object('what', 'Due date', 'from', to_char(t.due_on, 'FMDD Mon YYYY'), 'to', to_char(p_due_on, 'FMDD Mon YYYY'));
  end if;
  if v_due_at is distinct from t.due_at then
    changes := changes || jsonb_build_object('what', 'Due time',
      'from', coalesce(lower(to_char(t.due_at, 'FMHH12:MI am')), 'Any time'),
      'to', coalesce(lower(to_char(v_due_at, 'FMHH12:MI am')), 'Any time'));
  end if;
  if jsonb_array_length(changes) = 0 then return; end if;

  update task_items set title = v_title, details = v_details, due_on = p_due_on, due_at = v_due_at, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'edited', me, jsonb_build_object('changes', changes)::text);
  perform task_mark_seen(t.id, me);
end $$;
revoke all on function public.task_edit(uuid, text, text, date, time, boolean) from public, anon;
grant execute on function public.task_edit(uuid, text, text, date, time, boolean) to authenticated;

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
  insert into task_events (task_id, kind, by_id, note) values (t.id, 'edited', me, jsonb_build_object('changes', jsonb_build_array(
    jsonb_build_object('what', 'Notify ' || coalesce((select split_part(m.full_name, ' ', 1) from employees o join employees m on m.id = o.reporting_manager_id where o.id = t.employee_id), 'the manager'),
      'from', case when t.notify_manager then 'On' else 'Off' end, 'to', case when v_on then 'On' else 'Off' end)))::text);
  perform task_mark_seen(t.id, me);
end $$;
