import { describe, expect, it } from 'vitest'
import { byCriticality, byPerson, figures, onTimeShare, periodRange, tatWords } from '@/lib/stats'
import type { Task } from '@/lib/tasks'

const task = (o: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), employee_id: 'e1', employee_name: 'Amal - Test', employee_ecode: 'E7777',
  title: 'A task', details: null, due_on: '2026-10-05', criticality: 'moderate', criticality_set_by: null, status: 'open',
  done_note: null, done_at: null, approved_at: null, approved_by_name: null,
  created_at: '2026-10-05T04:00:00Z', updated_at: '2026-10-05T04:00:00Z',
  reminders: 0, last_reminded_at: null, comments: 0, sent_back: 0, unseen: 0, unseen_kinds: null,
  ...o,
})

describe('the dashboard', () => {
  const now = '2026-10-08'
  const tasks = [
    task({ due_on: '2026-10-09' }),                                                                      // to do
    task({ due_on: '2026-10-06', criticality: 'critical' }),                                             // overdue
    task({ status: 'done', done_note: 'x', done_at: '2026-10-05T10:00:00Z', criticality: 'critical' }),   // 6 h, on time
    task({ status: 'approved', done_note: 'x', done_at: '2026-10-07T04:00:00Z', due_on: '2026-10-06' }), // 48 h, a day late
  ]

  it('total is pending and completed together; overdue is pending past its date', () => {
    const f = figures(tasks, now)
    expect(f).toMatchObject({ total: 4, pending: 2, overdue: 1, completed: 2, waiting: 1, approved: 1, onTime: 1 })
    expect(f.avgHours).toBe(27)
  })

  it('splits by criticality, critical first', () => {
    const split = byCriticality(tasks, now)
    expect(split.map(([c]) => c)).toEqual(['critical', 'moderate', 'non_critical'])
    expect(split[0][1]).toMatchObject({ total: 2, pending: 1, overdue: 1, completed: 1 })
    expect(split[2][1].total).toBe(0)
    expect(split[2][1].avgHours).toBeNull()
  })

  it('lists people with the most pending first', () => {
    const rows = byPerson([...tasks, task({ employee_id: 'e2', employee_name: 'Nivek - Test', employee_ecode: 'E6666', status: 'done', done_note: 'x', done_at: '2026-10-05T05:00:00Z' })], now)
    expect(rows.map(r => r.ecode)).toEqual(['E7777', 'E6666'])
  })

  it('says completion time in minutes, hours or days', () => {
    expect(tatWords(null)).toBe('—')
    expect(tatWords(0.25)).toBe('15 min')
    expect(tatWords(5.4)).toBe('5 h')
    expect(tatWords(36)).toBe('1.5 days')
    expect(tatWords(24 * 12)).toBe('12 days')
  })

  it('colours on time as TAT met is coloured: green from 90%, amber from 70%, red below', () => {
    expect(onTimeShare(figures([], now))).toEqual({ pct: null, tone: 'slate' })
    expect(onTimeShare({ ...figures([], now), completed: 10, onTime: 9 }).tone).toBe('green')
    expect(onTimeShare({ ...figures([], now), completed: 10, onTime: 7 }).tone).toBe('amber')
    expect(onTimeShare({ ...figures([], now), completed: 10, onTime: 6 }).tone).toBe('red')
  })

  it('periods are calendar months, or all time', () => {
    expect(periodRange('this', '2026-10-08')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('last', '2026-10-08')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(periodRange('last', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodRange('all', '2026-10-08').from <= '2026-01-01').toBe(true)
  })
})
