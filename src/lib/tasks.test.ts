import { describe, expect, it } from 'vitest'
import { addDays, addMonths, dayInSentence, dayTitle, daysBetween, daysLate, lookOf, monthGrid } from '@/lib/tasks'

describe('the calendar', () => {
  it('lays a month out in whole weeks, Sunday first', () => {
    const oct = monthGrid('2026-10') // 1 Oct 2026 is a Thursday, 31 Oct a Saturday
    expect(oct[0]).toBe('2026-09-27')
    expect(oct[oct.length - 1]).toBe('2026-10-31')
    expect(oct.length % 7).toBe(0)
    const feb = monthGrid('2026-02') // 1 Feb 2026 is a Sunday, 28 Feb a Saturday: exactly four weeks
    expect(feb.length).toBe(28)
    expect(feb[0]).toBe('2026-02-01')
  })

  it('counts days and months across their ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(daysBetween('2026-10-05', '2026-10-08')).toBe(3)
    expect(daysBetween('2026-10-08', '2026-10-05')).toBe(-3)
  })

  it('names the days near today in words', () => {
    expect(dayTitle('2026-10-05', '2026-10-05')).toBe('Today')
    expect(dayTitle('2026-10-06', '2026-10-05')).toBe('Tomorrow')
    expect(dayTitle('2026-10-04', '2026-10-05')).toBe('Yesterday')
    expect(dayInSentence('2026-10-06', '2026-10-05')).toBe('tomorrow')
    expect(dayTitle('2026-10-08', '2026-10-05')).toMatch(/Thursday/)
  })
})

describe('where a task stands', () => {
  const now = '2026-10-05'
  it('to do until its day has passed, then overdue', () => {
    expect(lookOf({ status: 'open', due_on: '2026-10-05' }, now)).toBe('todo')
    expect(lookOf({ status: 'open', due_on: '2026-10-04' }, now)).toBe('overdue')
  })
  it('waiting once marked complete, however late; approved once approved', () => {
    expect(lookOf({ status: 'done', due_on: '2026-09-01' }, now)).toBe('waiting')
    expect(lookOf({ status: 'approved', due_on: '2026-09-01' }, now)).toBe('approved')
  })
  it('counts late days to today while to do, and to the day it was completed after that', () => {
    expect(daysLate({ status: 'open', due_on: '2026-10-02', done_at: null }, now)).toBe(3)
    expect(daysLate({ status: 'open', due_on: '2026-10-09', done_at: null }, now)).toBe(0)
    expect(daysLate({ status: 'done', due_on: '2026-10-02', done_at: '2026-10-03T06:00:00Z' }, now)).toBe(1)
    expect(daysLate({ status: 'approved', due_on: '2026-10-02', done_at: '2026-10-01T06:00:00Z' }, now)).toBe(0)
  })
})
