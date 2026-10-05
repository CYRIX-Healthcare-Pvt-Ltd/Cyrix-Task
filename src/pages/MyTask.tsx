import { useAuth } from '@/contexts/AuthContext'
import TaskBoard from '@/components/TaskBoard'
import { firstName, useMe } from '@/lib/tasks'

/** My own tasks, by the day. */
export default function MyTask() {
  const { employee } = useAuth()
  const { data: me } = useMe()
  const manager = firstName(me?.manager_name)
  return (
    <TaskBoard
      whose={{ team: false }}
      heading={
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">My Task</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Hello {firstName(employee?.full_name)}. Add your tasks on the day they are due; when one is done, mark it complete and say what you did{manager ? ` — ${manager} approves it` : ''}.
          </p>
        </div>
      }
    />
  )
}
