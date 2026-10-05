import { useSearchParams } from 'react-router-dom'
import { Users } from 'lucide-react'
import { usePeople, type Person } from '@/lib/tasks'

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

export default function PersonSelect({ people, person, onChange }: {
  people: Person[]
  person: Person | null
  onChange: (id: string | null) => void
}) {
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="sr-only">Whose tasks</span>
      <Users className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
      <select
        className="input w-full min-w-0 py-2 sm:w-72"
        value={person?.id ?? ''}
        onChange={e => onChange(e.target.value || null)}
        aria-label="Whose tasks"
      >
        <option value="">Everyone in my team ({people.length})</option>
        {people.map(p => (
          <option key={p.id} value={p.id}>{p.full_name} · {p.ecode}</option>
        ))}
      </select>
    </label>
  )
}
