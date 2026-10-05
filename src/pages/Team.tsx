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
        <div className="w-full min-w-0 space-y-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">My Team Task</h1>
            <p className="mt-0.5 text-sm text-ink-500">
              The tasks your team entered, each with who entered it. Approve what is done, remind what is late.
            </p>
          </div>
          <PersonSelect people={people} person={person} onChange={setPerson} />
        </div>
      }
    />
  )
}
