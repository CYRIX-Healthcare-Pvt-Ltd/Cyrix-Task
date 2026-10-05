/*
  mt_0003 — the tile is switched on.

  mt_0002 put the module's row in switched off, so that it could be given to
  the test accounts before there was anything at app.cyrix.in/tasks to open.
  The app is deployed (cyrix-task.vercel.app) and the portal forwards /tasks
  to it, so the row goes on: the portal shows the My Task tile to the people
  who hold the module, and the software administrator's module list — which
  offers active modules only — gains My Task, so it can be given to people
  and to the managers who approve their tasks.

  Nobody gains access by this. Who may use the module is who holds it in
  employee_modules — E7777 and E9999 — and this changes no row there.
*/
update public.app_modules set is_active = true where code = 'tasks';
