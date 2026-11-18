import { Users } from 'lucide-react'
import TaskBoard from '@/components/TaskBoard'
import PersonSelect, { usePersonChoice } from '@/components/PersonSelect'
import { EmptyState, PageLoader } from '@/components/ui'

/**
 * My Team Task: the tasks the people who report to me entered, on the same
 * board as my own — each task with who entered it, name and E-code — and a
 * choice of one person or everyone.
 */
export default function Team() {
  const { people, person, setPerson, loading } = usePersonChoice()

  if (loading) return <PageLoader />
  if (!people?.length) {
    return (
      <EmptyState icon={Users} title="Nobody who reports to you keeps tasks here yet">
        The software administrator gives My Task to people; once they have it, their tasks are here.
      </EmptyState>
    )
  }

  return (
    <TaskBoard
      whose={{ team: true, person }}
      heading={
        // The heading, whose tasks and Assign task on one row (the user, 18 Nov: "so 1 row will be up").
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">My Team Task</h1>
          <div className="w-full sm:w-72"><PersonSelect people={people} person={person} onChange={setPerson} /></div>
        </div>
      }
    />
  )
}
