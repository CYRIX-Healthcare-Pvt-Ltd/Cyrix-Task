/*
  mt_0006 — everybody gets My Task, as everybody gets KPI.

  The user, 6 Oct: "and like kpi make my task also as default modules for
  all employees". Until now My Task was handed out in KPI SW Admin → Login
  administration, to the test accounts and a few people.

  This does for My Task what KPI 0092 does for KPI. grant_default_modules(),
  the trigger every new employees row runs, now grants My Task as well as
  KPI, each only while its module is switched on. Every active employee who
  does not hold My Task is given it. Active only, as 0092 reasoned:
  somebody deactivated has no reason to be handed a module now.

  A manager approves their people's tasks only while holding the module, so
  everybody having it also puts every manager in place. The software
  administrator can still take My Task away from somebody, as with KPI.
*/

create or replace function public.grant_default_modules()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- KPI and My Task, each only if it is switched on. A company that
  -- retires a module should not have new joiners handed a tile to a
  -- module nobody uses.
  insert into employee_modules (employee_id, module_code)
  select new.id, m.code
  from app_modules m
  where m.code in ('kpi', 'tasks') and m.is_active
  on conflict (employee_id, module_code) do nothing;

  return new;
end $$;

comment on function public.grant_default_modules() is
  'Grants KPI and My Task to every new employee. KPI is how everybody is '
  'appraised, and everybody keeps their tasks in My Task (mt_0006), so '
  'neither is opt-in the way Spare and BEMMP are.';

-- The people who are here already.
insert into employee_modules (employee_id, module_code)
select e.id, 'tasks'
from employees e
where e.is_active
  and exists (select 1 from app_modules where code = 'tasks' and is_active)
on conflict (employee_id, module_code) do nothing;
