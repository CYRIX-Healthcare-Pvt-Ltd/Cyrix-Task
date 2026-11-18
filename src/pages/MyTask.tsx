import TaskBoard from '@/components/TaskBoard'

/** My own tasks, by the day. */
export default function MyTask() {
  return (
    <TaskBoard
      whose={{ team: false }}
      heading={
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">My Task</h1>
        </div>
      }
    />
  )
}
