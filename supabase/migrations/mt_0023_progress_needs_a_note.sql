-- =====================================================================
-- My Task  ·  mt_0023  ·  Every change of stage says what was done
--
-- The user, 20 Nov: "in each stage selecting also we need like remark of what you did mandatory bcz they can simply
-- change". task_progress gains p_note (required, 3+ characters); the history keeps "Stage · n%" on the first line
-- and the note under it; a step back is kept as "Back to Stage · n%" (asks why it is going back). The two-argument version stays for the app already open until it reloads.
-- =====================================================================

create or replace function public.task_progress(p_task_id uuid, p_progress integer, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare t task_items := task_lock(p_task_id); me uuid := current_employee_id(); v_note text := btrim(coalesce(p_note, ''));
begin
  if t.employee_id <> me then raise exception 'Only the person whose task it is updates its progress'; end if;
  if t.status <> 'open' then raise exception 'This task is already marked complete'; end if;
  if task_progress_word(p_progress) is null then raise exception 'Choose how far along it is'; end if;
  if p_progress = t.progress then return; end if;
  if length(v_note) < 3 then raise exception '%', case when p_progress < t.progress then 'Write why it is going back first' else 'Write what you did first' end; end if;
  if length(v_note) > 2000 then raise exception 'Keep it under 2000 characters'; end if;
  update task_items set progress = p_progress, updated_at = now() where id = t.id;
  insert into task_events (task_id, kind, by_id, note)
  values (t.id, 'progress', me, case when p_progress < t.progress then 'Back to ' else '' end || format('%s · %s%%', task_progress_word(p_progress), p_progress) || E'\n' || v_note);
end $fn$;

revoke all on function public.task_progress(uuid, integer, text) from public, anon;
grant execute on function public.task_progress(uuid, integer, text) to authenticated, service_role;
