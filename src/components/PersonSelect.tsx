import { useSearchParams } from 'react-router-dom'
import { Users } from 'lucide-react'
import { usePeople, type Person } from '@/lib/tasks'
import DropPick from '@/components/DropPick'

/**
 * Whose tasks, on a manager's screens: everyone who reports to them, or one
 * person. Kept in the address (?person=), so going back, or opening My Team
 * Task from the dashboard, keeps the same person.
 */
export function usePersonChoice(): { people: Person[] | undefined; person: Person | null; setPerson: (id: string | null) => void; loading: boolean } {
  const [params, setParams] = useSearchParams()
  const { data: people, isLoading } = usePeople()
  const id = params.get('person')
  const person = (id && people?.find(p => p.id === id)) || null
  const setPerson = (next: string | null) => {
    setParams(p => {
      const q = new URLSearchParams(p)
      if (next) q.set('person', next); else q.delete('person')
      return q
    }, { replace: true })
  }
  return { people, person, setPerson, loading: isLoading }
}

/** A press-to-open list (DropPick): a press outside or Escape closes it (the user, 20 Nov: "clicking outside also it is not closing"). */
export default function PersonSelect({ people, person, onChange }: {
  people: Person[]
  person: Person | null
  onChange: (id: string | null) => void
}) {
  // My own reportees in the list; anyone further down is reached by Assign's search (the user, 29 Oct).
  const ids = new Set(people.map(p => p.id))
  const mine = people.filter(p => !p.manager_id || !ids.has(p.manager_id) || p.id === person?.id)
  return (
    <DropPick label="Whose tasks" value={person?.id ?? 'all'} icon={<Users className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />}
      options={[{ key: 'all', word: 'Everyone in my team' }, ...mine.map(p => ({ key: p.id, word: `${p.full_name} · ${p.ecode}` }))]}
      onChange={k => onChange(k === 'all' ? null : k)} />
  )
}
