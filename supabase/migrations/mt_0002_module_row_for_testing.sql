/*
  mt_0002 — the module's row, switched off, so it can be given to the test accounts.

  employee_modules points at app_modules, so nobody can be given My Task
  until its row exists. It goes in inactive: the portal shows no tile for it
  until the app is deployed and the row is switched on. The user, 5 Oct:
  "now assign to e7777 and e9999 for testing" — E7777 (Amal - Test) reports
  to E9999 (Henry - Test), so one keeps the tasks and the other approves them.
*/
insert into public.app_modules (code, name, description, path, icon, sort_order, is_active)
values ('tasks', 'My Task', 'Your tasks by the day; your manager follows them and approves each one done.', '/tasks', 'ListChecks', 70, false)
on conflict (code) do nothing;

insert into public.employee_modules (employee_id, module_code)
select e.id, 'tasks' from public.employees e where e.ecode in ('E7777', 'E9999')
on conflict do nothing;
